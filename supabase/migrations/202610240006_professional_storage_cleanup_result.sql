begin;

-- Conserva el tombstone si la eliminación física no terminó; el servidor
-- confirma el resultado consultando el listado propio después de este RPC.
create or replace function public.finish_professional_image_delete(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  select i.object_path into v_path from private.professional_images i join public.professionals p on p.id = i.professional_id
    where i.id = p_image_id and p.user_id = (select auth.uid()) and i.state = 'deleting' for update of i;
  if v_path is null then raise exception 'image_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'amano-professional-images' and o.name = v_path) then
    update private.professional_images set state = 'cleanup_pending', updated_at = now() where id = p_image_id;
    return;
  end if;
  delete from private.professional_images where id = p_image_id;
end;
$$;
revoke all on function public.finish_professional_image_delete(uuid) from public, anon;
grant execute on function public.finish_professional_image_delete(uuid) to authenticated;

commit;
