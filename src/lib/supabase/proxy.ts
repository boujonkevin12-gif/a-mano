import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export async function updateSupabaseSession(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(config.url, config.publishableKey, {
    auth: { flowType: "pkce", autoRefreshToken: true, persistSession: true },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, cacheHeaders) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const header of ["cache-control", "expires", "pragma"]) {
          const value = cacheHeaders?.[header as keyof typeof cacheHeaders];
          if (value) response.headers.set(header, value);
        }
      },
    },
  });

  // getClaims verifica el JWT y renueva la sesión; getSession solo leería una cookie sin validar.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Una caída temporal de Auth no debe derribar rutas públicas; las mutaciones vuelven a validar la sesión.
  }
  return response;
}
