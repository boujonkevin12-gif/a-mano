"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormSubmit } from "@/components/form-submit";
import { idleActionState, type ActionState } from "@/lib/validation";
import { registerAction, resetRequestAction, setNewPasswordAction, signInAction } from "@/app/actions/auth";

function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return <p className={`form-alert${state.status === "error" ? " form-alert-error" : ""}`} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>;
}

function FieldError({ state, name }: { state: ActionState; name: string }) {
  const error = state.fieldErrors?.[name]?.[0];
  return error ? <span className="field-error" id={`${name}-error`}>{error}</span> : null;
}

export function SignUpForm() {
  const [state, action] = useActionState(registerAction, idleActionState);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return <form className="form-card" action={action}>
    <div className="form-grid">
      <div className="form-field form-field-full"><label htmlFor="displayName">Nombre y apellido</label><input id="displayName" name="displayName" autoComplete="name" autoCapitalize="words" required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} aria-describedby={state.fieldErrors?.displayName ? "displayName-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.displayName)} /><FieldError state={state} name="displayName" /></div>
      <div className="form-field form-field-full"><label htmlFor="signup-email">Correo electrónico</label><input id="signup-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={state.fieldErrors?.email ? "email-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.email)} /><FieldError state={state} name="email" /></div>
      <div className="form-field form-field-full"><label htmlFor="signup-password">Contraseña</label><input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={64} required value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="password-help" /><span className="field-help" id="password-help">Usá al menos 10 caracteres. No reutilices una contraseña de otra cuenta.</span><FieldError state={state} name="password" /></div>
    </div>
    <ActionMessage state={state} />
    <FormSubmit pendingLabel="Creando cuenta…">Crear cuenta</FormSubmit>
    <p className="form-legal">Al crear tu cuenta, aceptás que tu perfil básico quede asociado a ella. La política de privacidad definitiva se publicará antes de habilitar la plataforma.</p>
    <div className="form-divider" />
    <div className="form-links"><span>¿Ya tenés cuenta?</span><Link href="/ingresar">Iniciá sesión</Link></div>
  </form>;
}

export function SignInForm({ next = "/cuenta", initialError = "" }: { next?: string; initialError?: string }) {
  const initialState: ActionState = initialError ? { status: "error", message: initialError } : idleActionState;
  const [state, action] = useActionState(signInAction, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return <form className="form-card" action={action}>
    <input type="hidden" name="next" value={next} />
    <div className="form-grid">
      <div className="form-field form-field-full"><label htmlFor="signin-email">Correo electrónico</label><input id="signin-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" required value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={state.fieldErrors?.email ? "email-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.email)} /><FieldError state={state} name="email" /></div>
      <div className="form-field form-field-full"><label htmlFor="signin-password">Contraseña</label><input id="signin-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby={state.fieldErrors?.password ? "password-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.password)} /><FieldError state={state} name="password" /></div>
    </div>
    <ActionMessage state={state} />
    <FormSubmit pendingLabel="Ingresando…">Iniciar sesión</FormSubmit>
    <div className="form-links"><Link href="/recuperar">¿Te olvidaste la contraseña?</Link><Link href="/registrarse">Crear una cuenta</Link></div>
  </form>;
}

export function ResetRequestForm() {
  const [state, action] = useActionState(resetRequestAction, idleActionState);
  const [email, setEmail] = useState("");
  return <form className="form-card" action={action}>
    <div className="form-field"><label htmlFor="reset-email">Correo electrónico</label><input id="reset-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" required value={email} onChange={(event) => setEmail(event.target.value)} /><FieldError state={state} name="email" /></div>
    <ActionMessage state={state} />
    <FormSubmit pendingLabel="Enviando…">Enviar instrucciones</FormSubmit>
    <div className="form-links"><Link href="/ingresar">Volver a iniciar sesión</Link></div>
  </form>;
}

export function NewPasswordForm() {
  const [state, action] = useActionState(setNewPasswordAction, idleActionState);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  return <form className="form-card" action={action}>
    <div className="form-grid">
      <div className="form-field form-field-full"><label htmlFor="new-password">Nueva contraseña</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={64} required value={password} onChange={(event) => setPassword(event.target.value)} /><FieldError state={state} name="password" /></div>
      <div className="form-field form-field-full"><label htmlFor="new-password-confirm">Repetí la contraseña</label><input id="new-password-confirm" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} maxLength={64} required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /><FieldError state={state} name="passwordConfirmation" /></div>
    </div>
    <ActionMessage state={state} />
    <FormSubmit pendingLabel="Actualizando…">Guardar contraseña</FormSubmit>
  </form>;
}
