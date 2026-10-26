import Link from "next/link";
import { categories } from "@/lib/categories";
import type { SearchOptions } from "@/lib/supabase/public-data";

export function SearchFilters({ initial, fixedCategory }: { initial: SearchOptions; fixedCategory?: string }) {
  const clearHref = fixedCategory ? `/categoria/${fixedCategory}` : "/buscar";
  return <form className="search-filters" action="/buscar" method="get">
    {fixedCategory && <input type="hidden" name="categoria" value={fixedCategory} />}
    <label className="form-field"><span>Servicio o palabra clave</span><input name="q" type="search" maxLength={100} placeholder="Ej. electricidad, clases…" defaultValue={initial.query} /></label>
    <label className="form-field"><span>Ciudad</span><input name="ciudad" autoComplete="address-level2" maxLength={100} placeholder="Cualquier ciudad" defaultValue={initial.city} /></label>
    {!fixedCategory && <label className="form-field"><span>Categoría</span><select name="categoria" defaultValue={initial.categorySlug}><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select></label>}
    <label className="form-field"><span>Ordenar por</span><select name="orden" defaultValue={initial.sort}><option value="name">Nombre</option><option value="recent">Más recientes</option></select></label>
    <div className="search-filter-actions"><button type="submit" className="button">Aplicar filtros</button><Link className="button button-quiet" href={clearHref}>Limpiar</Link></div>
  </form>;
}

export function SearchPagination({ page, hasMore, href }: { page: number; hasMore: boolean; href: (page: number) => string }) {
  if (page <= 1 && !hasMore) return null;
  return <nav className="search-pagination" aria-label="Páginas de resultados">
    {page > 1 ? <Link className="button button-quiet" href={href(page - 1)}>← Anterior</Link> : <span />}
    <span>Página {page}</span>
    {hasMore ? <Link className="button button-quiet" href={href(page + 1)}>Siguiente →</Link> : <span />}
  </nav>;
}
