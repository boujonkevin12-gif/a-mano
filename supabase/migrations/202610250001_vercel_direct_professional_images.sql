begin;

-- Original uploads go straight from the authenticated browser to a private
-- quarantine path. Only the trusted server writes sanitized public candidates.
alter table private.professional_images
  add column upload_path text unique;

create or replace function private.can_read_professional_image_upload(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.professional_images i
    join public.professionals p on p.id = i.professional_id
    where i.upload_path = p_path and i.state = 'uploading'
      and p.user_id = (select auth.uid())
  );
$$;
revoke all on function private.can_read_professional_image_upload(text) from public, anon, authenticated;
grant execute on function private.can_read_professional_image_upload(text) to authenticated;

create or replace function private.can_upload_professional_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.professional_images i
    join public.professionals p on p.id = i.professional_id
    where i.upload_path = p_path and i.state = 'uploading'
      and p.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_delete_professional_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.professional_images i
    join public.professionals p on p.id = i.professional_id
    where p.user_id = (select auth.uid())
      and (
        (i.object_path = p_path and i.state in ('ready', 'deleting', 'cleanup_pending'))
        or i.upload_path = p_path
      )
  );
$$;

drop policy if exists "A Mano image read is owner admin or published" on storage.objects;
create policy "A Mano image read is owner admin or published"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'amano-professional-images'
  and (
    private.can_read_professional_image(name)
    or private.can_read_professional_image_upload(name)
  )
);

-- Browser clients may insert only their own outstanding quarantine reservation.
-- Final sanitized objects can be written only by the server-only Storage client.
drop policy if exists "A Mano image insert needs an owner reservation" on storage.objects;
create policy "A Mano image insert needs an owner reservation"
on storage.objects for insert to authenticated
with check (bucket_id = 'amano-professional-images' and private.can_upload_professional_image(name));

drop policy if exists "A Mano image delete is owner only" on storage.objects;
create policy "A Mano image delete is owner only"
on storage.objects for delete to authenticated
using (bucket_id = 'amano-professional-images' and private.can_delete_professional_image(name));

create or replace function public.reserve_professional_image(
  p_professional_id uuid, p_kind text, p_mime_type text, p_extension text,
  p_size_bytes integer, p_width integer, p_height integer
)
returns table(image_id uuid, object_path text)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_path text;
  v_upload_path text;
  v_owner uuid := (select auth.uid());
  v_profile public.professionals%rowtype;
begin
  if v_owner is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_kind not in ('profile', 'portfolio') or p_size_bytes not between 1 and 5242880
     or p_width not between 1 and 10000 or p_height not between 1 and 10000
     or p_width::bigint * p_height::bigint > 20000000
     or not ((p_mime_type = 'image/jpeg' and p_extension = 'jpg')
       or (p_mime_type = 'image/png' and p_extension = 'png')
       or (p_mime_type = 'image/webp' and p_extension = 'webp')) then
    raise exception 'invalid_image_metadata' using errcode = '22023';
  end if;
  select p.* into v_profile from public.professionals p
    where p.id = p_professional_id and p.user_id = v_owner for update;
  if not found then raise exception 'professional_owner_required' using errcode = '42501'; end if;
  if v_profile.status = 'suspended' then raise exception 'profile_unavailable' using errcode = '55000'; end if;
  if p_kind = 'profile' and exists (select 1 from private.professional_images i where i.professional_id = p_professional_id and i.image_kind = 'profile') then
    raise exception 'profile_image_limit_reached' using errcode = '23505';
  end if;
  if p_kind = 'portfolio' and (select count(*) from private.professional_images i where i.professional_id = p_professional_id and i.image_kind = 'portfolio') >= 8 then
    raise exception 'portfolio_image_limit_reached' using errcode = '23514';
  end if;

  v_path := 'professionals/' || p_professional_id::text || '/' || gen_random_uuid()::text || '.' || p_extension;
  v_upload_path := 'uploading/' || p_professional_id::text || '/' || v_id::text || '.' || p_extension;
  insert into private.professional_images (
    id, professional_id, object_path, upload_path, image_kind, mime_type, extension,
    size_bytes, width, height
  ) values (
    v_id, p_professional_id, v_path, v_upload_path, p_kind, p_mime_type, p_extension,
    p_size_bytes, 1, 1
  );
  -- Keep the historical RPC return shape, but return only the browser's staging path.
  return query select v_id, v_upload_path;
end;
$$;

drop function if exists public.mark_professional_image_uploaded(uuid);
create function public.mark_professional_image_uploaded(
  p_image_id uuid, p_mime_type text, p_extension text, p_size_bytes integer,
  p_width integer, p_height integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_image private.professional_images%rowtype;
begin
  select i.* into v_image from private.professional_images i
  join public.professionals p on p.id = i.professional_id
  where i.id = p_image_id and p.user_id = (select auth.uid())
  for update of i;
  if not found then raise exception 'image_not_found' using errcode = 'P0002'; end if;
  if v_image.state <> 'uploading' then raise exception 'invalid_image_state' using errcode = '55000'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or not ((p_mime_type = 'image/jpeg' and p_extension = 'jpg')
       or (p_mime_type = 'image/png' and p_extension = 'png')
       or (p_mime_type = 'image/webp' and p_extension = 'webp'))
     or p_size_bytes not between 1 and 5242880
     or p_width not between 1 and 10000 or p_height not between 1 and 10000
     or p_width::bigint * p_height::bigint > 20000000 then
    raise exception 'invalid_image_metadata' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'amano-professional-images' and o.name = v_image.object_path
  ) then raise exception 'sanitized_object_not_found' using errcode = 'P0002'; end if;
  update private.professional_images
    set mime_type = p_mime_type, extension = p_extension, size_bytes = p_size_bytes,
        width = p_width, height = p_height, state = 'ready', updated_at = now()
    where id = p_image_id;
end;
$$;

create or replace function public.cancel_professional_image_upload(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_image private.professional_images%rowtype;
begin
  select i.* into v_image from private.professional_images i
  join public.professionals p on p.id = i.professional_id
  where i.id = p_image_id and p.user_id = (select auth.uid()) for update of i;
  if not found then return; end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'amano-professional-images' and o.name in (v_image.object_path, v_image.upload_path)) then
    update private.professional_images set state = 'cleanup_pending', updated_at = now() where id = p_image_id;
  else
    delete from private.professional_images where id = p_image_id;
  end if;
end;
$$;

drop function if exists public.get_own_professional_images();
create function public.get_own_professional_images()
returns table(
  id uuid, professional_id uuid, object_path text, upload_path text,
  image_kind text, mime_type text, size_bytes integer, width integer, height integer,
  state text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.professional_id,
    case when i.state = 'ready' then i.object_path else null end,
    i.upload_path, i.image_kind, i.mime_type, i.size_bytes, i.width, i.height, i.state, i.created_at
  from private.professional_images i join public.professionals p on p.id = i.professional_id
  where p.user_id = (select auth.uid()) order by i.created_at, i.id;
$$;

create function public.get_professional_image_upload(p_image_id uuid)
returns table(
  id uuid, object_path text, upload_path text, image_kind text, mime_type text,
  extension text, size_bytes integer, state text
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.object_path, i.upload_path, i.image_kind, i.mime_type, i.extension, i.size_bytes, i.state
  from private.professional_images i join public.professionals p on p.id = i.professional_id
  where i.id = p_image_id and p.user_id = (select auth.uid())
    and i.state in ('uploading', 'ready', 'cleanup_pending');
$$;

create function public.clear_professional_image_upload_path(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  select i.upload_path into v_path from private.professional_images i
  join public.professionals p on p.id = i.professional_id
  where i.id = p_image_id and p.user_id = (select auth.uid()) and i.state = 'ready'
  for update of i;
  if not found then raise exception 'image_not_found' using errcode = 'P0002'; end if;
  if v_path is not null and exists (
    select 1 from storage.objects o where o.bucket_id = 'amano-professional-images' and o.name = v_path
  ) then raise exception 'upload_cleanup_pending' using errcode = '55000'; end if;
  update private.professional_images set upload_path = null, updated_at = now() where id = p_image_id;
end;
$$;

create function public.begin_professional_image_delete_paths(p_image_id uuid)
returns table(object_path text, upload_path text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update private.professional_images i set state = 'deleting', updated_at = now()
  from public.professionals p
  where i.id = p_image_id and p.id = i.professional_id and p.user_id = (select auth.uid())
    and i.state in ('ready', 'cleanup_pending', 'uploading', 'deleting')
  returning i.object_path, i.upload_path;
  if not found then raise exception 'image_not_found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.finish_professional_image_delete(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_final_path text; v_upload_path text;
begin
  select i.object_path, i.upload_path into v_final_path, v_upload_path
  from private.professional_images i join public.professionals p on p.id = i.professional_id
  where i.id = p_image_id and p.user_id = (select auth.uid()) and i.state = 'deleting'
  for update of i;
  if not found then raise exception 'image_not_found' using errcode = 'P0002'; end if;
  if exists (
    select 1 from storage.objects o where o.bucket_id = 'amano-professional-images'
      and o.name in (v_final_path, v_upload_path)
  ) then
    update private.professional_images set state = 'cleanup_pending', updated_at = now() where id = p_image_id;
    return;
  end if;
  delete from private.professional_images where id = p_image_id;
end;
$$;

drop function if exists public.get_admin_professional_images(uuid[]);
create function public.get_admin_professional_images(p_professional_ids uuid[])
returns table(professional_id uuid, id uuid, object_path text, image_kind text, mime_type text, size_bytes integer, width integer, height integer, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_current_user_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_professional_ids is null or cardinality(p_professional_ids) > 50 then
    raise exception 'invalid_professional_ids' using errcode = '22023';
  end if;
  return query
    select i.professional_id, i.id, i.object_path, i.image_kind, i.mime_type, i.size_bytes, i.width, i.height, i.created_at
    from private.professional_images i
    where i.professional_id = any(p_professional_ids) and i.state = 'ready'
    order by i.professional_id, i.image_kind, i.created_at, i.id;
end;
$$;

drop function if exists public.get_public_professional_images(text);
create function public.get_public_professional_images(p_slug text)
returns table(id uuid, object_path text, image_kind text, mime_type text, width integer, height integer)
language sql stable security definer set search_path = '' as $$
  select i.id, i.object_path, i.image_kind, i.mime_type, i.width, i.height
  from public.professionals p
  join private.professional_images i on i.professional_id = p.id
  where p.slug = p_slug and p.status = 'approved' and p.is_published and i.state = 'ready'
  order by case when i.image_kind = 'profile' then 0 else 1 end, i.created_at, i.id
  limit 9;
$$;

revoke all on function public.mark_professional_image_uploaded(uuid,text,text,integer,integer,integer) from public, anon;
revoke all on function public.get_own_professional_images() from public, anon;
revoke all on function public.get_professional_image_upload(uuid) from public, anon;
revoke all on function public.clear_professional_image_upload_path(uuid) from public, anon;
revoke all on function public.begin_professional_image_delete_paths(uuid) from public, anon;
revoke all on function public.get_admin_professional_images(uuid[]) from public, anon;
revoke all on function public.get_public_professional_images(text) from public;
grant execute on function public.mark_professional_image_uploaded(uuid,text,text,integer,integer,integer) to authenticated;
grant execute on function public.get_own_professional_images() to authenticated;
grant execute on function public.get_professional_image_upload(uuid) to authenticated;
grant execute on function public.clear_professional_image_upload_path(uuid) to authenticated;
grant execute on function public.begin_professional_image_delete_paths(uuid) to authenticated;
grant execute on function public.get_admin_professional_images(uuid[]) to authenticated;
grant execute on function public.get_public_professional_images(text) to anon, authenticated;

commit;
