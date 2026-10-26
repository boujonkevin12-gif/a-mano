"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { IMAGE_BUCKET, MAX_IMAGE_BYTES } from "@/lib/images/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { StorageImage } from "@/components/storage-image";

type Photo = { id: string; object_path: string | null; upload_path: string | null; image_kind: "profile" | "portfolio"; mime_type: string; size_bytes: number; width: number; height: number; state: "uploading" | "ready" | "deleting" | "cleanup_pending"; created_at: string };
type Props = { professionalId: string };

function fileFormat(file: File) {
  const ext = file.name.toLowerCase().split(/[\\/]/).at(-1)?.split(".").at(-1);
  if (file.type === "image/jpeg" && (ext === "jpg" || ext === "jpeg")) return { mimeType: file.type, extension: "jpg" };
  if (file.type === "image/png" && ext === "png") return { mimeType: file.type, extension: "png" };
  if (file.type === "image/webp" && ext === "webp") return { mimeType: file.type, extension: "webp" };
  return null;
}

export function ProfessionalPhotoManager({ professionalId }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function refresh() {
    const response = await fetch("/api/professional-images", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "No pudimos cargar las fotos.");
    setPhotos(payload.images ?? []);
  }
  useEffect(() => {
    let active = true;
    void fetch("/api/professional-images", { cache: "no-store" })
      .then(async (response) => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error ?? "No pudimos cargar las fotos."); if (active) setPhotos(payload.images ?? []); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No pudimos cargar las fotos."); });
    return () => { active = false; };
  }, []);

  const profilePhoto = photos.find((photo) => photo.image_kind === "profile");
  const portfolio = photos.filter((photo) => photo.image_kind === "portfolio");
  const canAddProfile = !profilePhoto;
  const canAddPortfolio = portfolio.length < 8;

  async function upload(kind: "profile" | "portfolio") {
    if (!file) { setError("Elegí una imagen antes de cargarla."); return; }
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) { setError("La imagen debe pesar como máximo 5 MiB."); return; }
    const format = fileFormat(file);
    if (!format) { setError("Elegí una imagen JPEG, PNG o WebP con extensión compatible."); return; }
    const client = createSupabaseBrowserClient();
    if (!client) { setError("No está configurada la conexión con Storage."); return; }
    setBusy(true); setError(""); setMessage("");
    let reservationId: string | null = null;
    let finalized = false;
    try {
      const reserve = await fetch("/api/professional-images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, kind, mimeType: format.mimeType, extension: format.extension, sizeBytes: file.size }),
      });
      const reservation = await reserve.json().catch(() => null);
      if (!reserve.ok || typeof reservation?.id !== "string" || typeof reservation?.uploadPath !== "string") throw new Error(reservation?.error ?? "No se pudo preparar la carga.");
      reservationId = reservation.id;
      const { error: uploadError } = await client.storage.from(IMAGE_BUCKET).upload(reservation.uploadPath, file, {
        contentType: format.mimeType, cacheControl: "0", upsert: false,
      });
      if (uploadError) throw new Error("No se pudo subir la foto a Storage. Volvé a intentar.");
      const finalize = await fetch("/api/professional-images/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: reservationId }),
      });
      const result = await finalize.json().catch(() => null);
      if (!finalize.ok) throw new Error(result?.error ?? "No se pudo validar y guardar la imagen.");
      finalized = true;
      setFile(null); if (inputRef.current) inputRef.current.value = "";
      await refresh();
      setMessage(result.cleanupPending ? "La foto está lista; quedó una limpieza temporal pendiente." : "La imagen se guardó correctamente.");
    } catch (cause) {
      if (reservationId && !finalized) await fetch("/api/professional-images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: reservationId }) }).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la imagen.");
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function remove(photo: Photo) {
    const prompt = photo.state === "cleanup_pending" ? "¿Reintentar la limpieza y quitar esta foto?" : "¿Borrar esta foto?";
    if (!window.confirm(prompt)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/professional-images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: photo.id }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo borrar la imagen.");
      await refresh(); setMessage("La imagen se borró correctamente.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo borrar la imagen."); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  }

  async function retryStagingCleanup(photo: Photo) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/professional-images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: photo.id }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo limpiar el archivo temporal.");
      await refresh(); setMessage("Se limpió el archivo temporal.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo limpiar el archivo temporal."); }
    finally { setBusy(false); }
  }

  return <section className="photo-manager" aria-labelledby="professional-photos-title">
    <div><h3 id="professional-photos-title">Fotos del perfil</h3><p>Una imagen principal y hasta 8 fotos de trabajos. JPEG, PNG o WebP; máximo 5 MiB y 20 megapíxeles por foto.</p></div>
    <div className="photo-upload-control">
      <label className="form-label" htmlFor="professional-photo-file">Elegí una foto</label>
      <input ref={inputRef} id="professional-photo-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); setMessage(""); }} disabled={busy} />
      {file && previewUrl && <div className="photo-preview"><Image unoptimized width={68} height={68} src={previewUrl} alt="Vista previa de la imagen seleccionada" /><span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MiB</span></div>}
      {file && <div className="photo-upload-actions">
        {canAddProfile && <button className="button" type="button" disabled={busy} onClick={() => void upload("profile")}>{busy ? "Subiendo y validando…" : "Usar como foto principal"}</button>}
        {canAddPortfolio && <button className="button button-quiet" type="button" disabled={busy} onClick={() => void upload("portfolio")}>{busy ? "Subiendo y validando…" : "Agregar a trabajos"}</button>}
        {!canAddProfile && !canAddPortfolio && <p className="field-help">Ya alcanzaste el máximo de fotos. Borrá una para agregar otra.</p>}
      </div>}
    </div>
    {(error || message) && <p className={`form-alert${error ? " form-alert-error" : ""}`} role={error ? "alert" : "status"}>{error || message}</p>}
    <div className="photo-grid">
      {photos.map((photo) => <article className="photo-item" key={photo.id}>
        {photo.state === "ready" && photo.object_path ? <StorageImage path={photo.object_path} width={photo.width} height={photo.height} alt={photo.image_kind === "profile" ? "Foto principal del perfil" : "Trabajo del profesional"} /> : <div className="photo-unavailable">{photo.state === "cleanup_pending" ? "Limpieza pendiente" : "Procesando imagen"}</div>}
        <div className="photo-item-meta"><span>{photo.image_kind === "profile" ? "Foto principal" : "Trabajo"} · {photo.width} × {photo.height}</span><div>{photo.state === "ready" && photo.upload_path && <button className="text-link photo-delete" type="button" disabled={busy} onClick={() => void retryStagingCleanup(photo)}>Limpiar original temporal</button>}<button className="text-link photo-delete" type="button" disabled={busy} onClick={() => void remove(photo)}>{photo.state === "cleanup_pending" ? "Reintentar limpieza y borrar" : "Borrar"}</button></div></div>
      </article>)}
      {photos.length === 0 && <p className="photo-empty">Todavía no agregaste fotos.</p>}
    </div>
  </section>;
}
