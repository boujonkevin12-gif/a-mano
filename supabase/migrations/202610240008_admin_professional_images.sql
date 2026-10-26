begin;

create function public.get_admin_professional_images(p_professional_ids uuid[])
returns table(professional_id uuid, id uuid, image_kind text, mime_type text, size_bytes integer, width integer, height integer, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_current_user_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_professional_ids is null or cardinality(p_professional_ids) > 50 then
    raise exception 'invalid_professional_ids' using errcode = '22023';
  end if;
  return query
    select i.professional_id, i.id, i.image_kind, i.mime_type, i.size_bytes, i.width, i.height, i.created_at
    from private.professional_images i
    where i.professional_id = any(p_professional_ids) and i.state = 'ready'
    order by i.professional_id, i.image_kind, i.created_at, i.id;
end;
$$;
revoke all on function public.get_admin_professional_images(uuid[]) from public, anon;
grant execute on function public.get_admin_professional_images(uuid[]) to authenticated;

commit;
