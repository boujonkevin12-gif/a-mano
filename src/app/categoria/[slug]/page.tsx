import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfessionalCard } from "@/components/professional-card";
import { SearchFilters, SearchPagination } from "@/components/search-controls";
import { categories, getCategory } from "@/lib/categories";
import { readSearchOptions, searchPageHref, type RouteSearchParams } from "@/lib/search-params";
import { searchProfessionals } from "@/lib/supabase/public-data";

export function generateStaticParams() { return categories.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  return { title: category ? category.name : "Categoría" };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<RouteSearchParams> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = getCategory(slug);
  if (!category) notFound();
  const options = readSearchOptions(query, slug);
  const result = await searchProfessionals(options);
  return <main className="account-main"><div className="account-wrap search-page-wrap">
    <div className="account-heading"><span className="eyebrow">CATEGORÍAS · SERVICIOS LOCALES</span><h1>{category.name}, cerca tuyo.</h1><p>{category.detail}{options.city ? ` · ${options.city}` : " · Todas las ciudades"}</p></div>
    <SearchFilters initial={options} fixedCategory={slug} />
    {!result.configured ? <div className="empty-results"><h2>Esta categoría necesita conexión.</h2><p>Configurá Supabase para consultar publicaciones aprobadas.</p></div> : result.error ? <div className="form-alert form-alert-error" role="alert">No pudimos cargar esta categoría. Volvé a intentar en unos minutos.</div> : result.professionals.length ? <><div className="result-grid">{result.professionals.map((professional) => <ProfessionalCard key={professional.id} professional={professional} />)}</div><SearchPagination page={options.page ?? 1} hasMore={result.hasMore} href={(page) => searchPageHref(`/categoria/${slug}`, options, page)} /></> : <div className="empty-results"><h2>{options.query || options.city ? "No encontramos servicios con esos filtros." : "Todavía no hay publicaciones en esta categoría."}</h2><p>Probá cambiar la palabra o la ciudad. Solo aparecen perfiles aprobados y publicados.</p></div>}
  </div></main>;
}
