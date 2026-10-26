import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeInternalPath } from "@/lib/redirects";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeInternalPath(params.next);
  if (isSupabaseConfigured() && await getCurrentUser()) redirect(next);
  const initialError = params.error === "enlace-invalido" ? "El enlace venció o ya se usó. Iniciá sesión o pedí uno nuevo." : "";
  return <main className="account-main"><div className="account-wrap"><div className="account-heading"><span className="eyebrow">TU CUENTA EN A MANO</span><h1>Qué bueno verte.</h1><p>Iniciá sesión para acceder a tu cuenta y gestionar tus servicios.</p></div>{!isSupabaseConfigured() && <p className="form-alert form-alert-info" role="status">La autenticación está preparada, pero falta conectar el proyecto Supabase. Completá las variables de entorno para habilitar el acceso.</p>}<SignInForm next={next} initialError={initialError} /><p className="form-footnote">Al continuar, tus datos se procesan mediante Supabase Auth. Consultá la política de privacidad cuando esté publicada.</p><div className="account-nav"><Link href="/">Volver al inicio</Link></div></div></main>;
}
