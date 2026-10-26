import { categories, getCategory } from "@/lib/categories";
import type { SearchOptions } from "@/lib/supabase/public-data";

export type RouteSearchParams = Record<string, string | string[] | undefined>;

export function normalizeSearchOptions(options: SearchOptions): Required<SearchOptions> {
  const page = Number.isFinite(options.page) ? Math.min(100, Math.max(1, Math.floor(options.page ?? 1))) : 1;
  return {
    query: (options.query ?? "").normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 100),
    city: (options.city ?? "").normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 100),
    categorySlug: options.categorySlug && getCategory(options.categorySlug) ? options.categorySlug : "",
    page,
    sort: options.sort === "recent" ? "recent" : "name",
  };
}

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export function readSearchOptions(params: RouteSearchParams, fixedCategory?: string): SearchOptions {
  const category = fixedCategory ?? single(params.categoria);
  const pageValue = Number(single(params.pagina));
  return {
    query: single(params.q),
    city: single(params.ciudad),
    categorySlug: categories.some((item) => item.slug === category) ? category : "",
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 100) : 1,
    sort: single(params.orden) === "recent" ? "recent" : "name",
  };
}

export function searchPageHref(path: string, options: SearchOptions, page: number): string {
  const params = new URLSearchParams();
  if (options.query?.trim()) params.set("q", options.query.trim().slice(0, 100));
  if (options.city?.trim()) params.set("ciudad", options.city.trim().slice(0, 100));
  if (options.categorySlug) params.set("categoria", options.categorySlug);
  if (options.sort === "recent") params.set("orden", "recent");
  if (page > 1) params.set("pagina", String(Math.min(page, 100)));
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}
