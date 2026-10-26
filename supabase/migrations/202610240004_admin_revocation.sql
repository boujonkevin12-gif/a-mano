begin;

-- La confirmación de correo es necesaria para conceder un rol, no para
-- revocarlo: el equipo debe poder retirar acceso ante un incidente.
create or replace function private.manage_admin_role(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'trusted_database_session_required' using errcode = '42501';
  end if;
  if p_user_id is null or p_is_admin is null then
    raise exception 'invalid_admin_change' using errcode = '22023';
  end if;
  if p_is_admin and not exists (
    select 1 from auth.users u
    where u.id = p_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'confirmed_user_required' using errcode = '22023';
  end if;

  lock table private.admin_users in exclusive mode;
  if p_is_admin then
    insert into private.admin_users (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
    get diagnostics v_changed = row_count;
  else
    if exists (select 1 from private.admin_users a where a.user_id = p_user_id)
       and (select count(*) from private.admin_users) <= 1 then
      raise exception 'last_admin_cannot_be_removed' using errcode = '55000';
    end if;
    delete from private.admin_users a where a.user_id = p_user_id;
    get diagnostics v_changed = row_count;
  end if;

  if v_changed > 0 then
    insert into private.admin_role_events (target_user_id, enabled, changed_by)
    values (p_user_id, p_is_admin, session_user::text);
  end if;
end;
$$;
revoke all on function private.manage_admin_role(uuid, boolean) from public, anon, authenticated;

commit;
