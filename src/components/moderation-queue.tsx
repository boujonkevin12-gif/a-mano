"use client";

import { useActionState, type FormEvent } from "react";
import Link from "next/link";
import { StorageImage } from "@/components/storage-image";
import { moderateProfessionalAction } from "@/app/actions/admin";
import { categories } from "@/lib/categories";
import { idleActionState } from "@/lib/validation";
import type { AdminProfessional, AdminProfessionalImage, ProfessionalStatus } from "@/lib/supabase/database.types";

type ModerationProfessional = AdminProfessional & { images: AdminProfessionalImage[] };

const statusNames: Record<ProfessionalStatus, string> = {
  draft: "Borrador",
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  suspended: "Suspendido",
};
const categoryNames = new Map<string, string>(categories.map((category) => [category.slug, category.name]));
const confirmText: Record<string, string> = {
  approve: "¿Aprobar y publicar este perfil?",
  reject: "¿Rechazar esta solicitud? El motivo se guardará en la auditoría.",
  hide: "¿Ocultar este perfil de la búsqueda pública?",
  publish: "¿Volver a publicar este perfil aprobado?",
  suspend: "¿Suspender este perfil y ocultarlo al público?",
  restore: "¿Restablecer y publicar este perfil suspendido?",
};

function dateLabel(value: string | null): string {
  if (!value) return "Sin acciones de moderación";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

function actionButton(decision: string, label: string, pending: boolean, quiet = false) {
  return <button className={`button${quiet ? " button-quiet" : ""}`} type="submit" name="decision" value={decision} disabled={pending}>{pending ? "Procesando…" : label}</button>;
}

function ModerationCard({ professional }: { professional: ModerationProfessional }) {
  const [state, action, pending] = useActionState(moderateProfessionalAction, idleActionState);
  function confirmAction(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const decision = submitter instanceof HTMLButtonElement ? submitter.value : "";
    if (decision && !window.confirm(confirmText[decision] ?? "¿Confirmás este cambio?")) event.preventDefault();
  }

  return <article className="moderation-card">
    <div className="moderation-card-heading"><div><span className={`status-pill moderation-status moderation-status-${professional.status}`}>{statusNames[professional.status]} · {professional.is_published ? "visible" : "oculto"}</span><h2>{professional.business_name}</h2></div><time dateTime={professional.updated_at}>Modificado {dateLabel(professional.updated_at)}</time></div>
    <p className="moderation-description">{professional.description}</p>
    {professional.images.length > 0 && <section className="moderation-photo-review" aria-label="Fotos enviadas para revisión"><strong>Fotos del perfil · {professional.images.length}</strong><div>{professional.images.map((image) => <div key={image.id}><StorageImage path={image.object_path} width={image.width} height={image.height} alt={image.image_kind === "profile" ? "Foto principal enviada por el profesional" : "Foto de un trabajo enviada por el profesional"} /><span>{image.image_kind === "profile" ? "Principal" : "Trabajo"}</span></div>)}</div></section>}
    <dl className="moderation-facts"><div><dt>Ciudad</dt><dd>{professional.city}</dd></div><div><dt>Zona</dt><dd>{professional.service_area}</dd></div><div><dt>WhatsApp</dt><dd>{professional.whatsapp_phone || "No informado"}</dd></div><div><dt>Categorías</dt><dd>{professional.category_slugs.map((slug) => categoryNames.get(slug) ?? slug).join(", ") || "Sin categorías activas"}</dd></div></dl>
    {professional.last_moderated_at && <div className="moderation-history"><strong>Última moderación · {dateLabel(professional.last_moderated_at)}</strong><p>{professional.last_moderation_reason || "Sin motivo registrado."}</p></div>}
    {professional.status === "approved" && professional.is_published && <Link className="text-link" href={`/profesional/${professional.slug}`} target="_blank">Abrir perfil público ↗</Link>}
    <form className="moderation-actions" action={action} onSubmit={confirmAction}>
      <input type="hidden" name="professionalId" value={professional.id} />
      <input type="hidden" name="expectedStatus" value={professional.status} />
      <input type="hidden" name="expectedPublished" value={String(professional.is_published)} />
      <label className="form-field moderation-reason"><span>Motivo de la acción</span><textarea name="reason" maxLength={500} rows={2} placeholder="Obligatorio al rechazar, ocultar, suspender o restablecer." /></label>
      <div className="moderation-buttons">
        {professional.status === "pending" && <>{actionButton("approve", "Aprobar y publicar", pending)}{actionButton("reject", "Rechazar solicitud", pending, true)}</>}
        {professional.status === "approved" && <>{professional.is_published ? actionButton("hide", "Ocultar", pending, true) : actionButton("publish", "Publicar", pending)}{actionButton("suspend", "Suspender", pending, true)}</>}
        {professional.status === "suspended" && actionButton("restore", "Restablecer y publicar", pending)}
      </div>
      {state.status !== "idle" && <p className={`form-alert${state.status === "error" ? " form-alert-error" : ""}`} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>}
    </form>
  </article>;
}

export function ModerationQueue({ professionals }: { professionals: ModerationProfessional[] }) {
  if (professionals.length === 0) return null;
  return <div className="moderation-queue">{professionals.map((professional) => <ModerationCard key={professional.id} professional={professional} />)}</div>;
}
