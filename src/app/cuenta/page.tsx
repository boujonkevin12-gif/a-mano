import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/supabase/auth";
import { ProfileForm } from "@/components/profile-forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ clave?: string }> }) {
  const params = await searchParams;
  if (!isSupabaseConfigured()) return <main className="account-main"><div className="account-wrap"><div className="account-heading"><span className="eyebrow">TU CUENTA</span><h1>Gestioná tus datos.</h1><p>El perfil y los servicios se administran desde una cuenta personal.</p></div><p className="form-alert form-alert-info" role="status">La cuenta está preparada. Completá las variables de Supabase y aplicá la migración para habilitarla.</p><div className="account-nav"><Link href="/ingresar">Iniciar sesión</Link><Link href="/registrarse">Crear cuenta</Link></div></div></main>;

  const user = await getCurrentUser();
  if (!user) redirect("/ingresar?next=%2Fcuenta");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/ingresar");
  const [{ data: profile, error: profileError }, { data: professional, error: professionalError }, { data: isAdmin }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, phone, city").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_own_professional_profile"),
    supabase.rpc("is_current_user_admin"),
  ]);
  const displayName = profile?.display_name ?? (typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name : "");
  return <main className="account-main"><div className="account-wrap"><div className="account-heading"><span className="eyebrow">TU CUENTA</span><h1>Hola{displayName ? `, ${displayName.split(" ")[0]}` : ""}.</h1><p>{user.email}</p></div>{isAdmin && <div className="account-nav account-admin-link"><Link href="/admin/moderacion">Abrir panel de moderación →</Link></div>}{params.clave === "actualizada" && <p className="form-alert" role="status">Actualizamos tu contraseña.</p>}{profileError && <p className="form-alert form-alert-error" role="alert">No pudimos cargar los datos del perfil. Revisá que la migración inicial esté aplicada.</p>}<h2 className="account-section-title">Datos personales</h2><ProfileForm initial={{ displayName, phone: profile?.phone ?? "", city: profile?.city ?? "Concepción del Uruguay" }} /><div className="account-divider" /><div className="account-professional-heading"><div><span className="eyebrow">SI OFRECÉS SERVICIOS</span><h2>Tu perfil profesional</h2><p>La cuenta personal y el perfil profesional tienen datos y permisos separados.</p></div><Link href="/publicar" className="button">{professionalError || !professional?.length ? "Completar perfil" : "Editar perfil"}</Link></div>{professionalError && <p className="form-alert form-alert-error" role="alert">No pudimos cargar el estado profesional. Revisá que la migración inicial esté aplicada.</p>}{professional?.[0] && <div className="professional-status-card"><span className="status-pill">{professional[0].is_published && professional[0].status === "approved" ? "Publicado" : professional[0].status === "rejected" ? "Necesita cambios" : professional[0].status === "suspended" ? "Suspendido" : professional[0].status === "draft" ? "Borrador" : "Pendiente de revisión"}</span><p>{professional[0].is_published && professional[0].status === "approved" ? "Tu perfil aparece en las búsquedas públicas." : "Tu perfil no aparece públicamente hasta que se apruebe y se publique."}</p></div>}<div className="account-divider" /><form action={signOutAction}><button className="button button-quiet" type="submit">Cerrar sesión</button></form></div></main>;
}
