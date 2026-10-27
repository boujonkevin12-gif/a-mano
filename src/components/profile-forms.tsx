"use client";

import { useActionState, useMemo, useState } from "react";
import { categories } from "@/lib/categories";
import { idleActionState, type ActionState } from "@/lib/validation";
import type { OwnProfessional } from "@/lib/supabase/database.types";
import { FormSubmit } from "@/components/form-submit";
import { saveProfessionalAction, updateProfileAction } from "@/app/actions/profile";
import { ProfessionalPhotoManager } from "@/components/professional-photo-manager";
import { parseArgentinaWhatsapp, type ArgentinaPhoneKind } from "@/lib/whatsapp";

function ActionFeedback({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return <p className={`form-alert${state.status === "error" ? " form-alert-error" : ""}`} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>;
}

function FieldError({ state, name }: { state: ActionState; name: string }) {
  const error = state.fieldErrors?.[name]?.[0];
  return error ? <span className="field-error" id={`${name}-error`}>{error}</span> : null;
}

export function ProfileForm({ initial }: { initial: { displayName: string; phone: string; city: string } }) {
  const [state, action] = useActionState(updateProfileAction, idleActionState);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [phone, setPhone] = useState(initial.phone);
  const [city, setCity] = useState(initial.city);
  return <form className="form-card" action={action}>
    <div className="form-grid">
      <div className="form-field form-field-full"><label htmlFor="profile-name">Nombre y apellido</label><input id="profile-name" name="displayName" autoComplete="name" autoCapitalize="words" required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} aria-describedby={state.fieldErrors?.displayName ? "displayName-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.displayName)} /><FieldError state={state} name="displayName" /></div>
      <div className="form-field"><label htmlFor="profile-phone">Teléfono <span className="field-help">(opcional)</span></label><input id="profile-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+54 9 3442 123456" maxLength={32} pattern="(\+|00)[0-9+() .-]{6,30}" title="Ingresá un número internacional con código de país, por ejemplo +54 9 3442 123456." value={phone} onChange={(event) => setPhone(event.target.value)} aria-describedby={state.fieldErrors?.phone ? "phone-error" : undefined} /><FieldError state={state} name="phone" /></div>
      <div className="form-field"><label htmlFor="profile-city">Ciudad</label><input id="profile-city" name="city" autoComplete="address-level2" autoCapitalize="words" required minLength={2} maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} aria-describedby={state.fieldErrors?.city ? "city-error" : undefined} /><FieldError state={state} name="city" /></div>
    </div>
    <ActionFeedback state={state} />
    <FormSubmit pendingLabel="Guardando…">Guardar cambios</FormSubmit>
  </form>;
}

export function ProfessionalForm({ initial }: { initial: OwnProfessional | null }) {
  const [state, action] = useActionState(saveProfessionalAction, idleActionState);
  const initialWhatsapp = useMemo(() => parseArgentinaWhatsapp(initial?.whatsapp_phone), [initial?.whatsapp_phone]);
  const [businessName, setBusinessName] = useState(initial?.business_name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [whatsappNationalNumber, setWhatsappNationalNumber] = useState(initialWhatsapp.nationalNumber);
  const [whatsappKind, setWhatsappKind] = useState<ArgentinaPhoneKind>(initialWhatsapp.kind);
  const [city, setCity] = useState(initial?.city ?? "Concepción del Uruguay");
  const [serviceArea, setServiceArea] = useState(initial?.service_area ?? "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initial?.category_slugs ?? []);
  const toggleCategory = (slug: string) => setSelectedCategories((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
  const professionalId = initial?.id ?? (state.status === "success" ? state.professionalId : undefined);

  return <form className="form-card" action={action}>
    <div className="form-grid">
      <div className="form-field form-field-full"><label htmlFor="business-name">Nombre comercial</label><input id="business-name" name="businessName" autoComplete="organization" autoCapitalize="words" required minLength={2} maxLength={100} placeholder="¿Cómo conocen tu trabajo?" value={businessName} onChange={(event) => setBusinessName(event.target.value)} aria-describedby={state.fieldErrors?.businessName ? "businessName-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.businessName)} /><FieldError state={state} name="businessName" /></div>
      <div className="form-field form-field-full"><label htmlFor="business-description">¿Qué servicios ofrecés?</label><textarea id="business-description" name="description" required minLength={20} maxLength={2000} placeholder="Contá qué hacés, en qué podés ayudar y cómo trabajás." value={description} onChange={(event) => setDescription(event.target.value)} aria-describedby={state.fieldErrors?.description ? "description-error" : "description-help"} aria-invalid={Boolean(state.fieldErrors?.description)} /><span className="field-help" id="description-help">Entre 20 y 2000 caracteres. No incluyas información sensible.</span><FieldError state={state} name="description" /></div>
      <div className="form-field form-field-full"><span className="form-label" id="category-title">Rubros</span><span className="field-help">Elegí entre 1 y 5 categorías.</span><div className="category-picker" role="group" aria-labelledby="category-title" aria-describedby={state.fieldErrors?.categorySlugs ? "categorySlugs-error" : undefined}>{categories.map((category) => <div className="category-option" key={category.slug}><input id={`category-${category.slug}`} type="checkbox" name="categorySlugs" value={category.slug} required={selectedCategories.length === 0 && category.slug === categories[0].slug} disabled={!selectedCategories.includes(category.slug) && selectedCategories.length >= 5} checked={selectedCategories.includes(category.slug)} onChange={() => toggleCategory(category.slug)} /><label htmlFor={`category-${category.slug}`}>{category.name}</label></div>)}</div><FieldError state={state} name="categorySlugs" /></div>
      <div className="form-field"><label htmlFor="professional-city">Ciudad</label><input id="professional-city" name="city" autoComplete="address-level2" autoCapitalize="words" required minLength={2} maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} aria-describedby={state.fieldErrors?.city ? "city-error" : undefined} /><FieldError state={state} name="city" /></div>
      <div className="form-field"><label htmlFor="service-area">Zona de atención</label><input id="service-area" name="serviceArea" autoComplete="address-level3" autoCapitalize="words" required minLength={2} maxLength={250} placeholder="Barrios o localidades" value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} aria-describedby={state.fieldErrors?.serviceArea ? "serviceArea-error" : undefined} /><FieldError state={state} name="serviceArea" /></div>
      <div className="form-field form-field-full">
        <label htmlFor="whatsapp-national-number">WhatsApp <span className="field-help">(opcional)</span></label>
        <div className="whatsapp-number-row">
          <span className="whatsapp-country-code" aria-label="Prefijo de Argentina">+54</span>
          <input id="whatsapp-national-number" name="whatsappNationalNumber" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="3442 123456" maxLength={16} value={whatsappNationalNumber} onChange={(event) => setWhatsappNationalNumber(event.target.value)} aria-describedby={state.fieldErrors?.whatsappNationalNumber ? "whatsappNationalNumber-error" : "whatsapp-help"} aria-invalid={Boolean(state.fieldErrors?.whatsappNationalNumber)} />
        </div>
        <fieldset className="whatsapp-kind-picker">
          <legend>Tipo de número</legend>
          <label><input type="radio" name="whatsappKind" value="mobile" checked={whatsappKind === "mobile"} onChange={() => setWhatsappKind("mobile")} /> Celular</label>
          <label><input type="radio" name="whatsappKind" value="landline" checked={whatsappKind === "landline"} onChange={() => setWhatsappKind("landline")} /> Fijo</label>
        </fieldset>
        <span className="field-help" id="whatsapp-help">Ingresá 10 dígitos de código de área y número, sin el 0 inicial ni el 15. Ejemplo: 3442 123456. Para celulares se aplica el 9 internacional; para fijos, no.</span>
        {initialWhatsapp.unsupported && <span className="field-help">El número guardado no tiene formato argentino. Ingresá uno nuevo o dejá el campo vacío para quitarlo.</span>}
        <FieldError state={state} name="whatsappNationalNumber" />
      </div>
    </div>
    {initial && <div className="professional-status-card"><span className="status-pill">{initial.status === "approved" && initial.is_published ? "Publicado" : initial.status === "rejected" ? "Necesita cambios" : initial.status === "suspended" ? "Suspendido" : initial.status === "draft" ? "Borrador" : "Pendiente de revisión"}</span><p>{initial.status === "approved" && initial.is_published ? "Si modificás y guardás el perfil, volverá a revisión y dejará de aparecer hasta que se apruebe la versión nueva." : initial.status === "rejected" ? "Actualizá la información y volvé a enviarla para una nueva revisión." : initial.status === "suspended" ? "El perfil está pausado. Contactá al equipo antes de volver a enviarlo." : "Un perfil nuevo no se publica automáticamente. Te vamos a indicar en la cuenta cuando esté disponible."}</p></div>}
    <ActionFeedback state={state} />
    <FormSubmit pendingLabel="Enviando a revisión…">Guardar y enviar a revisión</FormSubmit>
    <p className="form-legal">Las publicaciones pasan por revisión antes de aparecer en búsquedas. Al editar un perfil publicado, las fotos también quedan ocultas hasta una nueva aprobación.</p>
    {professionalId && <ProfessionalPhotoManager professionalId={professionalId} />}
    {!professionalId && <p className="field-help">Guardá el perfil primero para habilitar la carga de fotos. Al guardarlo, vas a poder cargar la foto principal y los trabajos.</p>}
  </form>;
}
