import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth-forms";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return <main className="account-main"><div className="account-wrap"><div className="account-heading"><span className="eyebrow">SUMATE A A MANO</span><h1>Empezá por acá.</h1><p>Creá tu cuenta para guardar tus datos y, si querés, ofrecer tus servicios.</p></div>{!isSupabaseConfigured() && <p className="form-alert form-alert-info" role="status">El registro está preparado, pero falta conectar el proyecto Supabase. Completá las variables de entorno para habilitar las cuentas.</p>}<SignUpForm /><div className="account-nav"><Link href="/">Volver al inicio</Link></div></div></main>;
}
