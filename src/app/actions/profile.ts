"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formErrors, profileSchema, professionalSchema, readString, readStrings, slugify, type ActionState } from "@/lib/validation";

export async function updateProfileAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    displayName: readString(formData, "displayName"),
    phone: readString(formData, "phone"),
    city: readString(formData, "city"),
  });
  if (!parsed.success) return formErrors(parsed.error);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "La cuenta todavía no está conectada. Configurá Supabase para continuar." };
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { status: "error", message: "La sesión venció. Iniciá sesión de nuevo y repetí el cambio." };
    const { data, error } = await supabase.from("profiles").update({
      display_name: parsed.data.displayName,
      phone: parsed.data.phone || null,
      city: parsed.data.city,
    }).eq("id", user.id).select("id").maybeSingle();
    if (error || !data) return { status: "error", message: "No pudimos guardar el perfil. Tus datos siguen en el formulario; revisá que la migración esté aplicada y probá de nuevo." };
    revalidatePath("/cuenta");
    return { status: "success", message: "Guardamos los cambios de tu perfil." };
  } catch {
    return { status: "error", message: "No pudimos conectar con el servicio. Tus datos siguen en el formulario; probá de nuevo." };
  }
}

export async function saveProfessionalAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = professionalSchema.safeParse({
    businessName: readString(formData, "businessName"),
    description: readString(formData, "description"),
    whatsappNationalNumber: readString(formData, "whatsappNationalNumber"),
    whatsappKind: readString(formData, "whatsappKind"),
    city: readString(formData, "city"),
    serviceArea: readString(formData, "serviceArea"),
    categorySlugs: readStrings(formData, "categorySlugs"),
  });
  if (!parsed.success) return formErrors(parsed.error);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "La cuenta todavía no está conectada. Configurá Supabase para continuar." };
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { status: "error", message: "La sesión venció. Iniciá sesión de nuevo y repetí el envío." };
    const { data: professionalId, error } = await supabase.rpc("submit_own_professional_profile", {
      p_slug: `${slugify(parsed.data.businessName)}-${user.id}`,
      p_business_name: parsed.data.businessName,
      p_description: parsed.data.description,
      p_whatsapp_phone: parsed.data.whatsappPhone || null,
      p_city: parsed.data.city,
      p_service_area: parsed.data.serviceArea,
      p_category_slugs: parsed.data.categorySlugs,
    });
    if (error || !professionalId) return { status: "error", message: "No pudimos enviar el perfil para revisión. Revisá las categorías y volvé a intentar." };
    revalidatePath("/cuenta");
    revalidatePath("/publicar");
    return { status: "success", message: "Guardamos tu perfil y quedó pendiente de revisión. Todavía no aparece en los resultados.", professionalId };
  } catch {
    return { status: "error", message: "No pudimos conectar con el servicio. Tus datos siguen en el formulario; probá de nuevo." };
  }
}
