"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/supabase/admin";
import { formErrors, moderationSchema, readString, type ActionState } from "@/lib/validation";

const denied: ActionState = { status: "error", message: "No tenés permisos para moderar publicaciones." };

export async function moderateProfessionalAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = moderationSchema.safeParse({
    professionalId: readString(formData, "professionalId"),
    decision: readString(formData, "decision"),
    reason: readString(formData, "reason"),
    expectedStatus: readString(formData, "expectedStatus"),
    expectedPublished: readString(formData, "expectedPublished"),
  });
  if (!parsed.success) return formErrors(parsed.error);

  const context = await getAdminContext();
  if (context.status !== "allowed") {
    return context.status === "unavailable" || context.status === "unconfigured"
      ? { status: "error", message: "No pudimos verificar el acceso administrativo. Volvé a intentar." }
      : denied;
  }

  try {
    const { data, error } = await context.supabase.rpc("moderate_professional", {
      p_professional_id: parsed.data.professionalId,
      p_action: parsed.data.decision,
      p_reason: parsed.data.reason || null,
      p_expected_status: parsed.data.expectedStatus,
      p_expected_is_published: parsed.data.expectedPublished,
    });
    if (error) {
      if (error.code === "40001") return { status: "error", message: "El perfil cambió mientras lo revisabas. Actualizá la página antes de volver a actuar." };
      if (error.code === "55000") return { status: "error", message: "Esa acción no corresponde al estado actual del perfil." };
      if (error.code === "22023") return { status: "error", message: "Revisá el motivo: debe tener entre 5 y 500 caracteres para esta acción." };
      if (error.code === "42501") return denied;
      return { status: "error", message: "No pudimos guardar el cambio de moderación. Actualizá la página y probá otra vez." };
    }
    const result = data?.[0];
    if (!result) return { status: "error", message: "No recibimos confirmación del cambio. Actualizá la página para revisar el estado." };
    revalidatePath("/admin/moderacion");
    revalidatePath("/buscar");
    revalidatePath(`/profesional/${result.slug}`);
    revalidatePath("/");
    const messages = {
      approve: "Perfil aprobado y publicado.",
      reject: "Solicitud rechazada; el motivo quedó registrado.",
      hide: "Perfil ocultado de la búsqueda pública.",
      publish: "Perfil publicado nuevamente.",
      suspend: "Perfil suspendido y oculto de la búsqueda pública.",
      restore: "Perfil restablecido y publicado.",
    } as const;
    return { status: "success", message: messages[parsed.data.decision] };
  } catch {
    return { status: "error", message: "No pudimos conectar con Supabase. El estado no se confirmó; actualizá la página." };
  }
}
