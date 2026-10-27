import { z } from "zod";
import { normalizeArgentinaWhatsapp } from "@/lib/whatsapp";

const email = z.email({ error: "Ingresá un correo electrónico válido." }).trim().max(254);
const password = z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(64, "La contraseña no puede superar los 64 caracteres.");
const phone = z.string().trim().max(32).refine((value) => value === "" || (/^[0-9+() .-]{6,32}$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6 && (value.match(/\d/g)?.length ?? 0) <= 15), "Ingresá un teléfono con entre 6 y 15 dígitos.");

export const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "Ingresá tu nombre (al menos 2 caracteres).").max(80, "El nombre puede tener hasta 80 caracteres."),
  email,
  password,
});

export const signInSchema = z.object({ email, password: z.string().min(1, "Ingresá tu contraseña.").max(64) });
export const resetRequestSchema = z.object({ email });
export const newPasswordSchema = z.object({ password, passwordConfirmation: z.string() }).refine((data) => data.password === data.passwordConfirmation, {
  path: ["passwordConfirmation"], message: "Las contraseñas no coinciden.",
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Ingresá tu nombre.").max(80, "El nombre puede tener hasta 80 caracteres."),
  phone,
  city: z.string().trim().min(2, "Ingresá tu ciudad.").max(100, "La ciudad puede tener hasta 100 caracteres."),
});

export const professionalSchema = z.object({
  businessName: z.string().trim().min(2, "Ingresá el nombre de tu servicio.").max(100, "El nombre puede tener hasta 100 caracteres."),
  description: z.string().trim().min(20, "Contanos un poco más: escribí al menos 20 caracteres.").max(2000, "La descripción puede tener hasta 2000 caracteres."),
  whatsappNationalNumber: z.string().trim().max(24, "Revisá el código de área y el número."),
  whatsappKind: z.enum(["mobile", "landline"]),
  city: z.string().trim().min(2, "Ingresá tu ciudad.").max(100, "La ciudad puede tener hasta 100 caracteres."),
  serviceArea: z.string().trim().min(2, "Indicá tu zona de atención.").max(250, "La zona puede tener hasta 250 caracteres."),
  categorySlugs: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Elegí una categoría válida.")).min(1, "Elegí al menos una categoría.").max(5, "Podés elegir hasta cinco categorías."),
}).superRefine((data, context) => {
  if (data.whatsappNationalNumber !== "" && !normalizeArgentinaWhatsapp(data.whatsappNationalNumber, data.whatsappKind)) {
    context.addIssue({ code: "custom", path: ["whatsappNationalNumber"], message: "Ingresá 10 dígitos de código de área y número, sin 0 inicial ni 15. Ejemplo: 3442 123456." });
  }
}).transform(({ whatsappNationalNumber, whatsappKind, ...data }) => ({
  ...data,
  whatsappPhone: normalizeArgentinaWhatsapp(whatsappNationalNumber, whatsappKind),
}));

export const moderationSchema = z.object({
  professionalId: z.uuid({ error: "El perfil seleccionado no es válido." }),
  decision: z.enum(["approve", "reject", "hide", "publish", "suspend", "restore"], { error: "Elegí una acción válida." }),
  reason: z.string().trim().max(500, "El motivo puede tener hasta 500 caracteres."),
  expectedStatus: z.enum(["draft", "pending", "approved", "rejected", "suspended"]),
  expectedPublished: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  professionalId?: string;
};

export const idleActionState: ActionState = { status: "idle" };

export function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function readStrings(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === "string");
}

export function formErrors(error: z.ZodError): ActionState {
  return { status: "error", message: "Revisá los datos marcados y volvé a intentar.", fieldErrors: error.flatten().fieldErrors as Record<string, string[]> };
}

export function slugify(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "servicio";
}
