begin;

-- Roles y auditoría fuera de los esquemas expuestos por PostgREST.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.admin_users (
  user_id uuid primary key references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table private.admin_users enable row level security;
revoke all on table private.admin_users from public, anon, authenticated;

create table private.admin_role_events (
  id bigint generated always as identity primary key,
  target_user_id uuid not null,
  enabled boolean not null,
  changed_by text not null,
  created_at timestamptz not null default now()
);
alter table private.admin_role_events enable row level security;
revoke all on table private.admin_role_events from public, anon, authenticated;

create table private.professional_moderation_events (
  id bigint generated always as identity primary key,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  admin_id uuid not null references private.admin_users (user_id) on delete restrict,
  action text not null check (action in ('approve', 'reject', 'hide', 'publish', 'suspend', 'restore')),
  from_status text not null check (from_status in ('draft', 'pending', 'approved', 'rejected', 'suspended')),
  to_status text not null check (to_status in ('draft', 'pending', 'approved', 'rejected', 'suspended')),
  from_is_published boolean not null,
  to_is_published boolean not null,
  reason text null check (reason is null or char_length(reason) between 5 and 500),
  created_at timestamptz not null default now()
);
alter table private.professional_moderation_events enable row level security;
revoke all on table private.professional_moderation_events from public, anon, authenticated;

-- El cambio de roles solo se puede ejecutar desde una sesión confiable de base
-- de datos; no se concede EXECUTE a ningún rol de la API.
create function private.manage_admin_role(p_user_id uuid, p_is_admin boolean)
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
  if not exists (
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

create function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.admin_users a where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

create function public.get_admin_professionals(
  p_status text default 'pending',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  business_name text,
  description text,
  whatsapp_phone text,
  city text,
  service_area text,
  status text,
  is_published boolean,
  updated_at timestamptz,
  category_slugs text[],
  last_moderation_reason text,
  last_moderated_at timestamptz,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_current_user_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('all', 'draft', 'pending', 'approved', 'rejected', 'suspended') then
    raise exception 'invalid_status_filter' using errcode = '22023';
  end if;

  return query
  with selected as (
    select p.id, p.slug, p.business_name, p.description, p.whatsapp_phone,
           p.city, p.service_area, p.status, p.is_published, p.updated_at,
           coalesce((
             select array_agg(c.slug order by c.name)
             from public.professional_categories pc
             join public.categories c on c.id = pc.category_id
             where pc.professional_id = p.id and c.is_active
           ), array[]::text[]) as category_slugs,
           last_event.reason as last_moderation_reason,
           last_event.created_at as last_moderated_at
    from public.professionals p
    left join lateral (
      select e.reason, e.created_at
      from private.professional_moderation_events e
      where e.professional_id = p.id
      order by e.created_at desc, e.id desc
      limit 1
    ) last_event on true
    where p_status = 'all' or p.status = p_status
    order by p.updated_at desc, p.id
    limit least(greatest(coalesce(p_limit, 24), 1), 50) + 1
    offset least(greatest(coalesce(p_offset, 0), 0), 5000)
  )
  select s.id, s.slug, s.business_name, s.description, s.whatsapp_phone,
         s.city, s.service_area, s.status, s.is_published, s.updated_at,
         s.category_slugs, s.last_moderation_reason, s.last_moderated_at,
         (select count(*) > least(greatest(coalesce(p_limit, 24), 1), 50) from selected)
  from selected s
  order by s.updated_at desc, s.id
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
end;
$$;
revoke all on function public.get_admin_professionals(text, integer, integer) from public, anon;
grant execute on function public.get_admin_professionals(text, integer, integer) to authenticated;

create function public.moderate_professional(
  p_professional_id uuid,
  p_action text,
  p_reason text,
  p_expected_status text,
  p_expected_is_published boolean
)
returns table (
  slug text,
  status text,
  is_published boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_professional public.professionals%rowtype;
  v_next_status text;
  v_next_published boolean;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_admin_id is null or not public.is_current_user_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_professional_id is null
     or p_action not in ('approve', 'reject', 'hide', 'publish', 'suspend', 'restore')
     or p_expected_status not in ('draft', 'pending', 'approved', 'rejected', 'suspended')
     or p_expected_is_published is null then
    raise exception 'invalid_moderation_request' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) not between 5 and 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if p_action in ('reject', 'hide', 'suspend', 'restore') and v_reason is null then
    raise exception 'moderation_reason_required' using errcode = '22023';
  end if;

  select p.* into v_professional
  from public.professionals p
  where p.id = p_professional_id
  for update;
  if not found then
    raise exception 'professional_not_found' using errcode = 'P0002';
  end if;
  if v_professional.status is distinct from p_expected_status
     or v_professional.is_published is distinct from p_expected_is_published then
    raise exception 'stale_moderation_state' using errcode = '40001';
  end if;

  v_next_status := v_professional.status;
  v_next_published := v_professional.is_published;
  if p_action = 'approve' and v_professional.status = 'pending' then
    v_next_status := 'approved'; v_next_published := true;
  elsif p_action = 'reject' and v_professional.status = 'pending' then
    v_next_status := 'rejected'; v_next_published := false;
  elsif p_action = 'hide' and v_professional.status = 'approved' and v_professional.is_published then
    v_next_published := false;
  elsif p_action = 'publish' and v_professional.status = 'approved' and not v_professional.is_published then
    v_next_published := true;
  elsif p_action = 'suspend' and v_professional.status = 'approved' then
    v_next_status := 'suspended'; v_next_published := false;
  elsif p_action = 'restore' and v_professional.status = 'suspended' then
    v_next_status := 'approved'; v_next_published := true;
  else
    raise exception 'invalid_moderation_transition' using errcode = '55000';
  end if;

  update public.professionals p
  set status = v_next_status, is_published = v_next_published, updated_at = now()
  where p.id = v_professional.id;

  insert into private.professional_moderation_events (
    professional_id, admin_id, action, from_status, to_status,
    from_is_published, to_is_published, reason
  ) values (
    v_professional.id, v_admin_id, p_action, v_professional.status, v_next_status,
    v_professional.is_published, v_next_published, v_reason
  );

  return query
  select p.slug, p.status, p.is_published, p.updated_at
  from public.professionals p where p.id = v_professional.id;
end;
$$;
revoke all on function public.moderate_professional(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.moderate_professional(uuid, text, text, text, boolean) to authenticated;

comment on schema private is 'Datos y procedimientos internos de administración; no expuestos por la API de Supabase.';
comment on table private.admin_users is 'Roles administrativos asignados exclusivamente mediante private.manage_admin_role desde una sesión de base confiable.';
comment on table private.professional_moderation_events is 'Auditoría inmutable de cambios administrativos sobre publicaciones.';

commit;
