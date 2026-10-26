begin;

-- Imágenes privadas. La API no expone el esquema private ni concede acceso a
-- la tabla; las operaciones pasan por funciones que derivan el usuario del JWT.
create table private.professional_images (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete restrict,
  object_path text not null unique,
  image_kind text not null check (image_kind in ('profile', 'portfolio')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  extension text not null check (extension in ('jpg', 'png', 'webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  state text not null default 'uploading' check (state in ('uploading', 'ready', 'deleting', 'cleanup_pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (width::bigint * height::bigint <= 20000000),
  check (
    (mime_type = 'image/jpeg' and extension = 'jpg') or
    (mime_type = 'image/png' and extension = 'png') or
    (mime_type = 'image/webp' and extension = 'webp')
  )
);
create unique index professional_images_one_profile_idx
  on private.professional_images(professional_id) where image_kind = 'profile';
create index professional_images_professional_state_idx
  on private.professional_images(professional_id, state, created_at);
alter table private.professional_images enable row level security;
revoke all on table private.professional_images from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('amano-professional-images', 'amano-professional-images', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create function private.can_read_professional_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.professional_images i
    join public.professionals p on p.id = i.professional_id
    where i.object_path = p_path and i.state = 'ready'
      and (
        p.user_id = (select auth.uid())
        or public.is_current_user_admin()
        or (p.status = 'approved' and p.is_published)
      )
  );
$$;
create function private.can_upload_professional_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.professional_images i
    join public.professionals p on p.id = i.professional_id
    where i.object_path = p_path and i.state = 'uploading'
      and p.user_id = (select auth.uid())
  );
$$;
create function private.can_delete_professional_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.professional_images i
    join public.professionals p on p.id = i.professional_id
    where i.object_path = p_path and i.state in ('uploading', 'ready', 'deleting', 'cleanup_pending')
      and p.user_id = (select auth.uid())
  );
$$;
revoke all on function private.can_read_professional_image(text) from public, anon, authenticated;
revoke all on function private.can_upload_professional_image(text) from public, anon, authenticated;
revoke all on function private.can_delete_professional_image(text) from public, anon, authenticated;
grant execute on function private.can_read_professional_image(text) to anon, authenticated;
grant execute on function private.can_upload_professional_image(text) to authenticated;
grant execute on function private.can_delete_professional_image(text) to authenticated;

create policy "A Mano image read is owner admin or published"
on storage.objects for select to anon, authenticated
using (bucket_id = 'amano-professional-images' and private.can_read_professional_image(name));
create policy "A Mano image insert needs an owner reservation"
on storage.objects for insert to authenticated
with check (bucket_id = 'amano-professional-images' and private.can_upload_professional_image(name));
create policy "A Mano image delete is owner only"
on storage.objects for delete to authenticated
using (bucket_id = 'amano-professional-images' and private.can_delete_professional_image(name));

create function public.reserve_professional_image(
  p_professional_id uuid, p_kind text, p_mime_type text, p_extension text,
  p_size_bytes integer, p_width integer, p_height integer
)
returns table(image_id uuid, object_path text)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_path text; v_owner uuid := (select auth.uid()); v_profile public.professionals%rowtype;
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
  v_path := 'professionals/' || p_professional_id::text || '/' || v_id::text || '.' || p_extension;
  insert into private.professional_images (id, professional_id, object_path, image_kind, mime_type, extension, size_bytes, width, height)
  values (v_id, p_professional_id, v_path, p_kind, p_mime_type, p_extension, p_size_bytes, p_width, p_height);
  return query select v_id, v_path;
end;
$$;

create function public.mark_professional_image_uploaded(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_image private.professional_images%rowtype;
begin
  select i.* into v_image from private.professional_images i join public.professionals p on p.id = i.professional_id
    where i.id = p_image_id and p.user_id = (select auth.uid()) for update of i;
  if not found then raise exception 'image_not_found' using errcode = 'P0002'; end if;
  if v_image.state <> 'uploading' then raise exception 'invalid_image_state' using errcode = '55000'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'amano-professional-images' and o.name = v_image.object_path) then
    raise exception 'uploaded_object_not_found' using errcode = 'P0002';
  end if;
  update private.professional_images set state = 'ready', updated_at = now() where id = p_image_id;
end;
$$;

create function public.cancel_professional_image_upload(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_image private.professional_images%rowtype;
begin
  select i.* into v_image from private.professional_images i join public.professionals p on p.id = i.professional_id
    where i.id = p_image_id and p.user_id = (select auth.uid()) for update of i;
  if not found then return; end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'amano-professional-images' and o.name = v_image.object_path) then
    update private.professional_images set state = 'cleanup_pending', updated_at = now() where id = p_image_id;
  else
    delete from private.professional_images where id = p_image_id;
  end if;
end;
$$;

create function public.begin_professional_image_delete(p_image_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  update private.professional_images i set state = 'deleting', updated_at = now()
    from public.professionals p
    where i.id = p_image_id and p.id = i.professional_id and p.user_id = (select auth.uid())
      and i.state in ('ready', 'cleanup_pending', 'uploading', 'deleting')
    returning i.object_path into v_path;
  if v_path is null then raise exception 'image_not_found' using errcode = 'P0002'; end if;
  return v_path;
end;
$$;

create function public.finish_professional_image_delete(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  select i.object_path into v_path from private.professional_images i join public.professionals p on p.id = i.professional_id
    where i.id = p_image_id and p.user_id = (select auth.uid()) and i.state = 'deleting' for update of i;
  if v_path is null then raise exception 'image_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'amano-professional-images' and o.name = v_path) then
    update private.professional_images set state = 'cleanup_pending', updated_at = now() where id = p_image_id;
    raise exception 'storage_cleanup_pending' using errcode = '55000';
  end if;
  delete from private.professional_images where id = p_image_id;
end;
$$;

create function public.get_own_professional_images()
returns table(id uuid, professional_id uuid, image_kind text, mime_type text, size_bytes integer, width integer, height integer, state text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.professional_id, i.image_kind, i.mime_type, i.size_bytes, i.width, i.height, i.state, i.created_at
  from private.professional_images i join public.professionals p on p.id = i.professional_id
  where p.user_id = (select auth.uid()) order by i.created_at, i.id;
$$;

create function public.get_professional_image(p_image_id uuid)
returns table(object_path text, mime_type text, size_bytes integer)
language sql stable security definer set search_path = '' as $$
  select i.object_path, i.mime_type, i.size_bytes
  from private.professional_images i join public.professionals p on p.id = i.professional_id
  where i.id = p_image_id and i.state = 'ready'
    and (p.user_id = (select auth.uid()) or public.is_current_user_admin() or (p.status = 'approved' and p.is_published));
$$;

create function public.mark_professional_image_cleanup_pending(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.professional_images i set state = 'cleanup_pending', updated_at = now()
    from public.professionals p where i.id = p_image_id and i.professional_id = p.id
      and p.user_id = (select auth.uid()) and i.state in ('uploading', 'deleting');
end;
$$;

revoke all on function public.reserve_professional_image(uuid,text,text,text,integer,integer,integer) from public, anon;
revoke all on function public.mark_professional_image_uploaded(uuid) from public, anon;
revoke all on function public.cancel_professional_image_upload(uuid) from public, anon;
revoke all on function public.begin_professional_image_delete(uuid) from public, anon;
revoke all on function public.finish_professional_image_delete(uuid) from public, anon;
revoke all on function public.get_own_professional_images() from public, anon;
revoke all on function public.get_professional_image(uuid) from public;
revoke all on function public.mark_professional_image_cleanup_pending(uuid) from public, anon;
grant execute on function public.reserve_professional_image(uuid,text,text,text,integer,integer,integer) to authenticated;
grant execute on function public.mark_professional_image_uploaded(uuid) to authenticated;
grant execute on function public.cancel_professional_image_upload(uuid) to authenticated;
grant execute on function public.begin_professional_image_delete(uuid) to authenticated;
grant execute on function public.finish_professional_image_delete(uuid) to authenticated;
grant execute on function public.get_own_professional_images() to authenticated;
grant execute on function public.get_professional_image(uuid) to anon, authenticated;
grant execute on function public.mark_professional_image_cleanup_pending(uuid) to authenticated;

commit;
