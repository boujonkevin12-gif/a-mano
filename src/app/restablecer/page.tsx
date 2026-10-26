import type { Metadata } from "next";
import Link from "next/link";
import { NewPasswordForm } from "@/components/auth-forms";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Elegir contraseña nueva" };
export default function NewPasswordPage() {
  return <main className="account-main"><div className="account-wrap"><div className="account-heading"><span className="eyebrow">RECUPERACIÓN DE CUENTA</span><h1>Elegí una contraseña nueva.</h1><p>Usá una contraseña segura que no uses en otros sitios.</p></div>{!isSupabaseConfigured() && <p className="form-alert form-alert-info" role="status">La recuperación está preparada y necesita las variables de Supabase.</p>}<NewPasswordForm /><div className="account-nav"><Link href="/ingresar">Volver a iniciar sesión</Link></div></div></main>;
}
