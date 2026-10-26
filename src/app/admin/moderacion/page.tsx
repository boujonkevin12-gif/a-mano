import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ModerationQueue } from "@/components/moderation-queue";
import { getAdminContext } from "@/lib/supabase/admin";
import type { AdminProfessional } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Moderación de profesionales" };
const pageSize = 24;
const filters = [
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
  { value: "suspended", label: "Suspendidos" },
  { value: "draft", label: "Borradores" },
  { value: "all", label: "Todos" },
] as const;
type Filter = (typeof filters)[number]["value"];

function queryHref(status: Filter, page: number) {
  const params = new URLSearchParams();
  if (status !== "pending") params.set("estado", status);
  if (page > 1) params.set("pagina", String(page));
  const suffix = params.toString();
  return suffix ? `/admin/moderacion?${suffix}` : "/admin/moderacion";
}

export default async function ModerationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const statusValue = typeof params.estado === "string" ? params.estado : "pending";
  const status = filters.some((filter) => filter.value === statusValue) ? statusValue as Filter : "pending";
  const rawPage = typeof params.pagina === "string" ? Number(params.pagina) : 1;
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(200, rawPage) : 1;
  const context = await getAdminContext();
  if (context.status === "unauthenticated") redirect("/ingresar?next=%2Fadmin%2Fmoderacion");
  if (context.status === "unconfigured") return <main className="account-main"><div className="account-wrap"><div className="empty-results"><h1>Moderación no disponible.</h1><p>Conectá Supabase para validar permisos y cargar solicitudes.</p></div></div></main>;
  if (context.status === "forbidden") return <main className="account-main"><div className="account-wrap"><div className="empty-results"><h1>Acceso restringido.</h1><p>Esta sección está disponible solo para administradores autorizados.</p><Link href="/cuenta" className="button">Volver a mi cuenta</Link></div></div></main>;
  if (context.status === "unavailable") return <main className="account-main"><div className="account-wrap"><p className="form-alert form-alert-error" role="alert">No pudimos validar tu sesión administrativa. Volvé a intentar.</p></div></main>;

  const { data, error } = await context.supabase.rpc("get_admin_professionals", {
    p_status: status,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) return <main className="account-main"><div className="account-wrap"><p className="form-alert form-alert-error" role="alert">No pudimos cargar la cola de moderación. Actualizá la página o revisá la migración administrativa.</p></div></main>;
  const professionals = data ?? [];
  const hasMore = professionals[0]?.has_more ?? false;
  const visible = professionals.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "has_more")) as unknown as AdminProfessional);
  const { data: images, error: imageError } = visible.length
    ? await context.supabase.rpc("get_admin_professional_images", { p_professional_ids: visible.map((item) => item.id) })
    : { data: [], error: null };
  if (imageError) return <main className="account-main"><div className="account-wrap"><p className="form-alert form-alert-error" role="alert">No pudimos cargar las fotos privadas para revisión. No se muestran acciones de moderación hasta recuperar esa consulta.</p></div></main>;
  const withImages = visible.map((professional) => ({ ...professional, images: (images ?? []).filter((image) => image.professional_id === professional.id) }));
  return <main className="account-main"><div className="account-wrap moderation-page">
    <header className="account-heading"><span className="eyebrow">PANEL ADMINISTRATIVO</span><h1>Moderación</h1><p>Revisá perfiles y aplicá cambios de estado. Cada acción queda registrada.</p></header>
    <nav className="moderation-filters" aria-label="Filtrar por estado">{filters.map((filter) => <Link key={filter.value} className={status === filter.value ? "moderation-filter active" : "moderation-filter"} aria-current={status === filter.value ? "page" : undefined} href={queryHref(filter.value, 1)}>{filter.label}</Link>)}</nav>
    {visible.length ? <ModerationQueue professionals={withImages} /> : <div className="empty-results"><h2>{status === "pending" ? "No hay perfiles pendientes." : "No hay perfiles en este estado."}</h2><p>{status === "pending" ? "Las nuevas solicitudes van a aparecer acá cuando se envíen." : "Probá otro filtro para consultar los demás perfiles."}</p></div>}
    {(page > 1 || hasMore) && <nav className="search-pagination" aria-label="Páginas de moderación">{page > 1 ? <Link className="button button-quiet" href={queryHref(status, page - 1)}>← Anterior</Link> : <span />}<span>Página {page}</span>{hasMore ? <Link className="button button-quiet" href={queryHref(status, page + 1)}>Siguiente →</Link> : <span />}</nav>}
  </div></main>;
}
