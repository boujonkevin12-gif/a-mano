begin;

-- Storage's removal API needs SELECT visibility for the object it deletes.
-- Keep unpublished/in-flight objects private while retaining owner access to
-- their own paths during the deleting and cleanup_pending transitions.
create or replace function private.can_read_professional_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.professional_images i
    join public.professionals p on p.id = i.professional_id
    where i.object_path = p_path
      and (
        (i.state = 'ready' and (
          p.user_id = (select auth.uid())
          or public.is_current_user_admin()
          or (p.status = 'approved' and p.is_published)
        ))
        or (i.state in ('deleting', 'cleanup_pending') and p.user_id = (select auth.uid()))
      )
  );
$$;
revoke all on function private.can_read_professional_image(text) from public, anon, authenticated;
grant execute on function private.can_read_professional_image(text) to anon, authenticated;

create or replace function private.can_read_professional_image_upload(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.professional_images i
    join public.professionals p on p.id = i.professional_id
    where i.upload_path = p_path
      and i.state in ('uploading', 'ready', 'deleting', 'cleanup_pending')
      and p.user_id = (select auth.uid())
  );
$$;
revoke all on function private.can_read_professional_image_upload(text) from public, anon, authenticated;
grant execute on function private.can_read_professional_image_upload(text) to anon, authenticated;

commit;
