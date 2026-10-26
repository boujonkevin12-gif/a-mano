import type { Metadata } from "next";
import { ProfessionalCard } from "@/components/professional-card";
import { SearchFilters, SearchPagination } from "@/components/search-controls";
import { searchPageHref, readSearchOptions, type RouteSearchParams } from "@/lib/search-params";
import { searchProfessionals } from "@/lib/supabase/public-data";
import { getCategory } from "@/lib/categories";

export const metadata: Metadata = { title: "Buscar servicios" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<RouteSearchParams> }) {
  const params = await searchParams;
  const options = readSearchOptions(params);
  const result = await searchProfessionals(options);
  const filtered = Boolean(options.query || options.city || options.categorySlug);
  return <main className="account-main"><div className="account-wrap search-page-wrap">
    <div className="account-heading"><span className="eyebrow">SERVICIOS CERCA TUYO</span><h1>{options.query ? `Resultados para “${options.query}”.` : "Explorá servicios locales."}</h1><p>{options.city || "Todas las ciudades"}{options.categorySlug ? ` · ${getCategory(options.categorySlug)?.name}` : ""}{result.configured && !result.error ? ` · ${result.professionals.length}${result.hasMore ? "+" : ""} perfiles en esta página` : ""}</p></div>
    <SearchFilters initial={options} />
    {!result.configured ? <div className="empty-results"><h2>El buscador necesita conexión.</h2><p>Configurá Supabase para consultar las publicaciones aprobadas y compartidas públicamente.</p></div> : result.error ? <div className="form-alert form-alert-error" role="alert">No pudimos cargar los resultados. Revisá la configuración de Supabase y volvé a intentar.</div> : result.professionals.length ? <><div className="result-grid">{result.professionals.map((professional) => <ProfessionalCard key={professional.id} professional={professional} />)}</div><SearchPagination page={options.page ?? 1} hasMore={result.hasMore} href={(page) => searchPageHref("/buscar", options, page)} /></> : <div className="empty-results"><h2>{filtered ? "No encontramos servicios con esos filtros." : "Todavía no hay profesionales publicados."}</h2><p>{filtered ? "Probá otra palabra, ciudad o categoría. Podés combinar los filtros y limpiarlos cuando quieras." : "Cuando haya profesionales aprobados y publicados, sus perfiles van a aparecer acá."}</p></div>}
  </div></main>;
}
