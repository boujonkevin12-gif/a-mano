import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";
import { safeInternalPath } from "@/lib/redirects";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = safeInternalPath(requestUrl.searchParams.get("next"));
  const code = requestUrl.searchParams.get("code");
  const config = getSupabaseConfig();

  if (code && config) {
    let response = NextResponse.redirect(new URL(next, request.url));
    const supabase = createServerClient<Database>(config.url, config.publishableKey, {
      auth: { flowType: "pkce", autoRefreshToken: true, persistSession: true },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, cacheHeaders) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.redirect(new URL(next, request.url));
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const header of ["cache-control", "expires", "pragma"]) {
            const value = cacheHeaders?.[header as keyof typeof cacheHeaders];
            if (value) response.headers.set(header, value);
          }
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  }

  const failure = new URL("/ingresar", request.url);
  failure.searchParams.set("error", "enlace-invalido");
  return NextResponse.redirect(failure);
}
