"use client";

import { useFormStatus } from "react-dom";

export function FormSubmit({ children, pendingLabel = "Guardando…" }: { children: React.ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending} aria-live="polite">{pending ? <><span className="loading-indicator" aria-hidden="true" />{pendingLabel}</> : children}</button>;
}
