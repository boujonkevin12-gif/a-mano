-- Búsqueda paginada sobre la vista pública ya filtrada. No amplía las tablas ni
-- concede acceso directo a datos privados.
create function public.search_public_professionals_page(
  p_query text default null,
  p_city text default null,
  p_category_slug text default null,
  p_limit integer default 12,
  p_offset integer default 0,
  p_sort text default 'name'
)
returns table (
  id uuid,
  slug text,
  business_name text,
  description text,
  whatsapp_phone text,
  city text,
  service_area text,
  updated_at timestamptz,
  category_slugs text[],
  has_more boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with matched as (
    select v.*
    from public.public_professionals v
    where (nullif(btrim(p_city), '') is null or lower(v.city) = lower(btrim(p_city)))
      and (
        nullif(btrim(p_query), '') is null or
        v.business_name ilike '%' || replace(replace(replace(btrim(p_query), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%' escape chr(92) or
        v.description ilike '%' || replace(replace(replace(btrim(p_query), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%' escape chr(92)
      )
      and (nullif(btrim(p_category_slug), '') is null or btrim(p_category_slug) = any(v.category_slugs))
  ), page_plus_one as (
    select m.*
    from matched m
    order by
      case when p_sort = 'recent' then m.updated_at end desc nulls last,
      case when p_sort is distinct from 'recent' then m.business_name end asc nulls last,
      m.id
    limit least(greatest(coalesce(p_limit, 12), 1), 30) + 1
    offset least(greatest(coalesce(p_offset, 0), 0), 1200)
  )
  select p.id, p.slug, p.business_name, p.description, p.whatsapp_phone,
         p.city, p.service_area, p.updated_at, p.category_slugs,
         (select count(*) > least(greatest(coalesce(p_limit, 12), 1), 30) from page_plus_one)
  from page_plus_one p
  order by
    case when p_sort = 'recent' then p.updated_at end desc nulls last,
    case when p_sort is distinct from 'recent' then p.business_name end asc nulls last,
    p.id
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;

revoke all on function public.search_public_professionals_page(text, text, text, integer, integer, text) from public;
grant execute on function public.search_public_professionals_page(text, text, text, integer, integer, text) to anon, authenticated;
