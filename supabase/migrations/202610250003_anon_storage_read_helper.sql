begin;

-- The anonymous read policy invokes this predicate; auth.uid() is NULL for anon,
-- so the SECURITY DEFINER function returns false for every staging reservation.
grant execute on function private.can_read_professional_image_upload(text) to anon;

commit;
