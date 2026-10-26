-- A Mano: perfiles, profesionales, categorías y políticas de acceso.
-- Aplicar con `supabase db push` o desde el SQL Editor de Supabase.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Usuario'
    check (char_length(btrim(display_name)) between 2 and 80),
  phone text null check (phone is null or (
    phone ~ '^[0-9+() .-]{6,32}$'
    and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 15
  )),
  city text not null default 'Concepción del Uruguay'
    check (char_length(btrim(city)) between 2 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text null check (description is null or char_length(description) <= 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_name text not null check (char_length(btrim(business_name)) between 2 and 100),
  description text not null check (char_length(btrim(description)) between 20 and 2000),
  whatsapp_phone text null check (whatsapp_phone is null or (
    whatsapp_phone ~ '^[0-9+() .-]{6,32}$'
    and char_length(regexp_replace(whatsapp_phone, '[^0-9]', '', 'g')) between 6 and 15
  )),
  city text not null default 'Concepción del Uruguay'
    check (char_length(btrim(city)) between 2 and 100),
  service_area text not null check (char_length(btrim(service_area)) between 2 and 250),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'suspended')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professionals_publication_requires_approval
    check (not is_published or status = 'approved')
);

create table public.professional_categories (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (professional_id, category_id)
);

create index professionals_public_city_idx
  on public.professionals (city, business_name)
  where status = 'approved' and is_published;
create index professionals_status_idx on public.professionals (status, updated_at desc);
create index professional_categories_category_idx
  on public.professional_categories (category_id, professional_id);
create index categories_active_name_idx on public.categories (name) where is_active;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();
create trigger professionals_set_updated_at
  before update on public.professionals
  for each row execute function public.set_updated_at();

-- Crea un único perfil básico por usuario. El nombre de metadatos no otorga roles.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Usuario'), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

insert into public.categories (id, name, slug, description) values
  ('10000000-0000-4000-8000-000000000001', 'Hogar y construcción', 'hogar-construccion', 'Arreglos, instalaciones y mejoras.'),
  ('10000000-0000-4000-8000-000000000002', 'Autos y motos', 'autos-motos', 'Mecánica, cuidado y movilidad.'),
  ('10000000-0000-4000-8000-000000000003', 'Belleza y bienestar', 'belleza-bienestar', 'Cuidado personal y bienestar.'),
  ('10000000-0000-4000-8000-000000000004', 'Mascotas', 'mascotas', 'Cuidado, paseo y compañía.'),
  ('10000000-0000-4000-8000-000000000005', 'Educación y clases', 'educacion-clases', 'Apoyo escolar y aprendizaje.'),
  ('10000000-0000-4000-8000-000000000006', 'Tecnología', 'tecnologia', 'Soporte, reparación y soluciones.'),
  ('10000000-0000-4000-8000-000000000007', 'Profesionales y negocios', 'profesionales-negocios', 'Asesoramiento y servicios expertos.'),
  ('10000000-0000-4000-8000-000000000008', 'Fletes y mudanzas', 'fletes-mudanzas', 'Traslados y ayuda para mudarte.'),
  ('10000000-0000-4000-8000-000000000009', 'Eventos', 'eventos', 'Ideas y servicios para celebrar.'),
  ('10000000-0000-4000-8000-000000000010', 'Otros servicios', 'otros-servicios', 'Otros servicios locales.')
on conflict (slug) do update
set name = excluded.name, description = excluded.description, is_active = true;

alter table public.profiles enable row level security;
alter table public.professionals enable row level security;
alter table public.categories enable row level security;
alter table public.professional_categories enable row level security;

-- Grants y RLS se configuran juntos: las tablas privadas no se exponen por PostgREST.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.professionals from anon, authenticated;
revoke all on table public.professional_categories from anon, authenticated;
revoke all on table public.categories from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, phone, city) on table public.profiles to authenticated;
grant select (id, name, slug, description) on table public.categories to anon, authenticated;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users update their own profile fields"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Clients read active categories"
  on public.categories for select to anon, authenticated
  using (is_active);
create policy "Owners can read their professional row"
  on public.professionals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Only approved published rows are public"
  on public.professionals for select to anon, authenticated
  using (status = 'approved' and is_published);
create policy "Owners can read their category selections"
  on public.professional_categories for select to authenticated
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.user_id = (select auth.uid())
  ));

-- Vista de columnas públicas. No incluye user_id ni otros datos de cuenta.
-- El filtro se fija en la definición de la vista; nunca depende del cliente.
create view public.public_professionals
with (security_barrier = true)
as
select
  p.id,
  p.slug,
  p.business_name,
  p.description,
  p.whatsapp_phone,
  p.city,
  p.service_area,
  p.updated_at,
  coalesce((
    select array_agg(c.slug order by c.name)
    from public.professional_categories pc
    join public.categories c on c.id = pc.category_id
    where pc.professional_id = p.id and c.is_active
  ), array[]::text[]) as category_slugs
from public.professionals p
where p.status = 'approved' and p.is_published;

grant select on public.public_professionals to anon, authenticated;

-- El RPC evita filtros PostgREST construidos con texto de usuario y solo devuelve
-- columnas públicas aprobadas. El límite evita respuestas sin cota.
create function public.search_public_professionals(
  p_query text default null,
  p_city text default null,
  p_category_slug text default null
)
returns setof public.public_professionals
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
  from public.public_professionals v
  where (p_city is null or lower(v.city) = lower(btrim(p_city)))
    and (
      p_query is null or btrim(p_query) = '' or
      v.business_name ilike '%' || replace(replace(replace(btrim(p_query), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%' escape chr(92) or
      v.description ilike '%' || replace(replace(replace(btrim(p_query), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%' escape chr(92)
    )
    and (p_category_slug is null or p_category_slug = any(v.category_slugs))
  order by v.business_name
  limit 50;
$$;

create function public.get_own_professional_profile()
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
  category_slugs text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.business_name, p.description, p.whatsapp_phone,
         p.city, p.service_area, p.status, p.is_published,
         coalesce((
           select array_agg(c.slug order by c.name)
           from public.professional_categories pc
           join public.categories c on c.id = pc.category_id
           where pc.professional_id = p.id and c.is_active
         ), array[]::text[])
  from public.professionals p
  where p.user_id = (select auth.uid());
$$;

-- Único punto de escritura para profesionales: el dueño sale del JWT verificado,
-- el estado siempre vuelve a pendiente/no publicado y categorías se guardan atómicamente.
create function public.submit_own_professional_profile(
  p_slug text,
  p_business_name text,
  p_description text,
  p_whatsapp_phone text,
  p_city text,
  p_service_area text,
  p_category_slugs text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_professional_id uuid;
  v_category_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_slug is null or char_length(p_slug) > 140
     or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or right(p_slug, 36) <> v_user_id::text then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;
  if p_business_name is null or char_length(btrim(p_business_name)) not between 2 and 100
     or p_description is null or char_length(btrim(p_description)) not between 20 and 2000
     or p_city is null or char_length(btrim(p_city)) not between 2 and 100
     or p_service_area is null or char_length(btrim(p_service_area)) not between 2 and 250
     or (p_whatsapp_phone is not null and (
       p_whatsapp_phone !~ '^[0-9+() .-]{6,32}$'
       or char_length(regexp_replace(p_whatsapp_phone, '[^0-9]', '', 'g')) not between 6 and 15
     )) then
    raise exception 'invalid_professional_data' using errcode = '22023';
  end if;
  if p_category_slugs is null or cardinality(p_category_slugs) not between 1 and 5
     or array_position(p_category_slugs, null) is not null then
    raise exception 'invalid_categories' using errcode = '22023';
  end if;

  select count(distinct c.slug) into v_category_count
  from public.categories c
  where c.slug = any(p_category_slugs) and c.is_active;
  if v_category_count <> cardinality(p_category_slugs) then
    raise exception 'invalid_categories' using errcode = '22023';
  end if;

  insert into public.professionals (
    user_id, slug, business_name, description, whatsapp_phone,
    city, service_area, status, is_published
  ) values (
    v_user_id, p_slug, btrim(p_business_name), btrim(p_description), nullif(btrim(p_whatsapp_phone), ''),
    btrim(p_city), btrim(p_service_area), 'pending', false
  )
  on conflict (user_id) do update set
    business_name = excluded.business_name,
    description = excluded.description,
    whatsapp_phone = excluded.whatsapp_phone,
    city = excluded.city,
    service_area = excluded.service_area,
    status = 'pending',
    is_published = false,
    updated_at = now()
  returning id into v_professional_id;

  delete from public.professional_categories
  where professional_id = v_professional_id;

  insert into public.professional_categories (professional_id, category_id)
  select v_professional_id, c.id
  from public.categories c
  where c.slug = any(p_category_slugs) and c.is_active;

  return v_professional_id;
end;
$$;

create function public.get_public_professional(p_slug text)
returns setof public.public_professionals
language sql
stable
security definer
set search_path = ''
as $$
  select v.* from public.public_professionals v where v.slug = p_slug limit 1;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.search_public_professionals(text, text, text) from public;
revoke all on function public.get_own_professional_profile() from public, anon;
revoke all on function public.submit_own_professional_profile(text, text, text, text, text, text, text[]) from public, anon;
revoke all on function public.get_public_professional(text) from public;
grant execute on function public.search_public_professionals(text, text, text) to anon, authenticated;
grant execute on function public.get_own_professional_profile() to authenticated;
grant execute on function public.submit_own_professional_profile(text, text, text, text, text, text, text[]) to authenticated;
grant execute on function public.get_public_professional(text) to anon, authenticated;

comment on table public.profiles is 'Datos básicos privados de cada cuenta. Cada usuario puede leer y editar solo su fila.';
comment on table public.professionals is 'Datos del servicio. La publicación requiere aprobación administrativa explícita.';
comment on column public.professionals.is_published is 'El cliente no puede asignar este campo. Se activa únicamente desde el entorno administrativo.';
comment on view public.public_professionals is 'Columnas públicas mínimas filtradas a perfiles aprobados y publicados.';
