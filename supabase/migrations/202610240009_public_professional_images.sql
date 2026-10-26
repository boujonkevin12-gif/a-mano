begin;

create function public.get_public_professional_images(p_slug text)
returns table(id uuid, image_kind text, mime_type text, width integer, height integer)
language sql stable security definer set search_path = '' as $$
  select i.id, i.image_kind, i.mime_type, i.width, i.height
  from public.professionals p
  join private.professional_images i on i.professional_id = p.id
  where p.slug = p_slug and p.status = 'approved' and p.is_published and i.state = 'ready'
  order by case when i.image_kind = 'profile' then 0 else 1 end, i.created_at, i.id
  limit 9;
$$;
revoke all on function public.get_public_professional_images(text) from public;
grant execute on function public.get_public_professional_images(text) to anon, authenticated;

commit;
