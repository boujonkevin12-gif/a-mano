import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfessionalForm } from "@/components/profile-forms";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
export const metadata: Metadata = { title: "Ofrecer mis servicios" };
export default async function PublishPage() {
  if (!isSupabaseConfigured()) return <main className="account-main"><div className="account-wrap"><div className="account-heading"><span className="eyebrow">PARA PROFESIONALES</span><h1>Mostrá lo que hacés.</h1><p>Completá tu perfil y envialo a revisión antes de que aparezca en búsquedas.</p></div><p className="form-alert form-alert-info" role="status">El formulario está listo, pero necesita las variables de Supabase para guardar información.</p><ProfessionalForm initial={null} /></div></main>;
  if (!await getCurrentUser()) redirect("/ingresar?next=%2Fpublicar");
  const supabase = await createSupabaseServerClient();
  const { data } = supabase ? await supabase.rpc("get_own_professional_profile") : { data: null };
  const profile = data?.[0] ?? null;
  return <main className="account-main"><div className="account-wrap"><div className="account-heading"><span className="eyebrow">PARA PROFESIONALES</span><h1>Mostrá lo que hacés.</h1><p>Completá tu perfil y envialo a revisión antes de que aparezca en búsquedas.</p></div><ProfessionalForm initial={profile} /><div className="account-nav"><Link href="/cuenta">Volver a mi cuenta</Link></div></div></main>;
}
