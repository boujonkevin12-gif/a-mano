"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { safeInternalPath } from "@/lib/redirects";
import {
  formErrors,
  readString,
  signInSchema,
  signUpSchema,
  resetRequestSchema,
  newPasswordSchema,
  type ActionState,
} from "@/lib/validation";

function unavailable(): ActionState {
  return { status: "error", message: "La cuenta todavía no está conectada. Configurá Supabase para continuar." };
}

export async function registerAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    displayName: readString(formData, "displayName"),
    email: readString(formData, "email"),
    password: readString(formData, "password"),
  });
  if (!parsed.success) return formErrors(parsed.error);

  const config = getSupabaseConfig();
  const supabase = await createSupabaseServerClient();
  if (!config || !supabase) return unavailable();

  try {
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { display_name: parsed.data.displayName },
        emailRedirectTo: `${config.appUrl}/auth/callback?next=%2Fcuenta`,
      },
    });
    if (error) {
      return { status: "error", message: "No pudimos crear la cuenta. Revisá el correo, la contraseña o intentá más tarde." };
    }
    return { status: "success", message: "Si el correo puede registrarse, te va a llegar un mensaje para confirmar la cuenta." };
  } catch {
    return { status: "error", message: "No pudimos conectar con el servicio. Tus datos siguen en el formulario; probá de nuevo." };
  }
}

export async function signInAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({ email: readString(formData, "email"), password: readString(formData, "password") });
  if (!parsed.success) return formErrors(parsed.error);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  try {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { status: "error", message: "No pudimos iniciar sesión con esos datos. Revisá el correo y la contraseña." };
  } catch {
    return { status: "error", message: "No pudimos conectar con el servicio. Tus datos siguen en el formulario; probá de nuevo." };
  }
  redirect(safeInternalPath(readString(formData, "next"), "/cuenta"));
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}

export async function resetRequestAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetRequestSchema.safeParse({ email: readString(formData, "email") });
  if (!parsed.success) return formErrors(parsed.error);
  const config = getSupabaseConfig();
  const supabase = await createSupabaseServerClient();
  if (!config || !supabase) return unavailable();

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${config.appUrl}/auth/callback?next=%2Frestablecer`,
    });
    if (error) return { status: "error", message: "No pudimos enviar el correo. Esperá un momento y volvé a intentar." };
    return { status: "success", message: "Si hay una cuenta asociada, te va a llegar un correo con los pasos para recuperar el acceso." };
  } catch {
    return { status: "error", message: "No pudimos conectar con el servicio. El correo sigue en el formulario; probá de nuevo." };
  }
}

export async function setNewPasswordAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: readString(formData, "password"),
    passwordConfirmation: readString(formData, "passwordConfirmation"),
  });
  if (!parsed.success) return formErrors(parsed.error);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { status: "error", message: "El enlace venció o ya se usó. Pedí uno nuevo para continuar." };
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return { status: "error", message: "No pudimos actualizar la contraseña. El formulario conserva lo ingresado; intentá de nuevo." };
  } catch {
    return { status: "error", message: "No pudimos conectar con el servicio. El formulario conserva lo ingresado; intentá de nuevo." };
  }
  redirect("/cuenta?clave=actualizada");
}

