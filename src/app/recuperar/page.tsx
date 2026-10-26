import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/auth-forms";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Recuperar contraseña" };
export default function RecoverPage() {
  return <main className="account-main"><div className="account-wrap"><div className="account-heading"><span className="eyebrow">RECUPERÁ TU ACCESO</span><h1>Vamos a ayudarte.</h1><p>Te mandamos instrucciones al correo asociado a tu cuenta.</p></div>{!isSupabaseConfigured() && <p className="form-alert form-alert-info" role="status">La recuperación de contraseña está preparada y necesita las variables de Supabase.</p>}<ResetRequestForm /><div className="account-nav"><Link href="/">Volver al inicio</Link></div></div></main>;
}
