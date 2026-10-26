import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicProfessional } from "@/lib/supabase/database.types";
import { normalizeSearchOptions } from "@/lib/search-params";

export const SEARCH_PAGE_SIZE = 12;
export type SearchOptions = { query?: string; city?: string; categorySlug?: string; page?: number; sort?: "name" | "recent" };
export type PublicSearchResult = { configured: false } | { configured: true; professionals: PublicProfessional[]; error: boolean; hasMore: boolean };

export async function searchProfessionals(options: SearchOptions): Promise<PublicSearchResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { configured: false };
  const normalized = normalizeSearchOptions(options);
  try {
    const { data, error } = await supabase.rpc("search_public_professionals_page", {
      p_query: normalized.query || null,
      p_city: normalized.city || null,
      p_category_slug: normalized.categorySlug || null,
      p_limit: SEARCH_PAGE_SIZE,
      p_offset: (normalized.page - 1) * SEARCH_PAGE_SIZE,
      p_sort: normalized.sort,
    });
    const rows = data ?? [];
    const professionals = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "has_more")) as unknown as PublicProfessional);
    return { configured: true, professionals, error: Boolean(error), hasMore: rows[0]?.has_more ?? false };
  } catch {
    return { configured: true, professionals: [], error: true, hasMore: false };
  }
}
