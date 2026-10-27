"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { IMAGE_BUCKET, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_IMAGE_DIMENSION, MAX_PORTFOLIO_IMAGES } from "@/lib/images/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { StorageImage } from "@/components/storage-image";

type Photo = { id: string; object_path: string | null; upload_path: string | null; image_kind: "profile" | "portfolio"; mime_type: string; size_bytes: number; width: number; height: number; state: "uploading" | "ready" | "deleting" | "cleanup_pending"; created_at: string };
type QueuedFile = { id: string; file: File };
type Props = { professionalId: string };

function fileFormat(file: File) {
  const extension = file.name.toLowerCase().split(/[\\/]/).at(-1)?.split(".").at(-1);
  if (file.type === "image/jpeg" && (extension === "jpg" || extension === "jpeg")) return { mimeType: file.type, extension: "jpg" as const };
  if (file.type === "image/png" && extension === "png") return { mimeType: file.type, extension: "png" as const };
  if (file.type === "image/webp" && extension === "webp") return { mimeType: file.type, extension: "webp" as const };
  return null;
}

async function clientFileError(file: File): Promise<string | null> {
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return "La imagen debe pesar como máximo 5 MiB.";
  if (!fileFormat(file)) return "Elegí una imagen JPEG, PNG o WebP con extensión compatible.";
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width > 0 && bitmap.height > 0
        && bitmap.width <= MAX_IMAGE_DIMENSION && bitmap.height <= MAX_IMAGE_DIMENSION
        && bitmap.width * bitmap.height <= MAX_IMAGE_PIXELS;
      bitmap.close();
      if (!valid) return "La imagen supera el máximo permitido de 20 megapíxeles.";
    } catch {
      return "No pudimos leer la imagen. Probá con un archivo JPEG, PNG o WebP válido.";
    }
  }
  return null;
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export function ProfessionalPhotoManager({ professionalId }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [portfolioFiles, setPortfolioFiles] = useState<QueuedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const profileInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);
  const profilePreview = useMemo(() => profileFile ? URL.createObjectURL(profileFile) : null, [profileFile]);
  const portfolioPreviews = useMemo(() => portfolioFiles.map(({ id, file }) => ({ id, file, url: URL.createObjectURL(file) })), [portfolioFiles]);

  useEffect(() => () => { if (profilePreview) URL.revokeObjectURL(profilePreview); }, [profilePreview]);
  useEffect(() => () => portfolioPreviews.forEach(({ url }) => URL.revokeObjectURL(url)), [portfolioPreviews]);

  async function refresh() {
    const response = await fetch("/api/professional-images", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "No pudimos cargar las fotos.");
    setPhotos(payload.images ?? []);
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/professional-images", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "No pudimos cargar las fotos.");
        if (active) setPhotos(payload.images ?? []);
      })
      .catch((cause: unknown) => { if (active) setError(messageOf(cause, "No pudimos cargar las fotos.")); });
    return () => { active = false; };
  }, []);

  const profilePhoto = photos.find((photo) => photo.image_kind === "profile");
  const portfolio = photos.filter((photo) => photo.image_kind === "portfolio");
  const portfolioSlots = Math.max(0, MAX_PORTFOLIO_IMAGES - portfolio.length);

  async function uploadOne(file: File, kind: "profile" | "portfolio") {
    const validationError = await clientFileError(file);
    if (validationError) throw new Error(validationError);
    const format = fileFormat(file);
    if (!format) throw new Error("Elegí una imagen JPEG, PNG o WebP con extensión compatible.");
    const client = createSupabaseBrowserClient();
    if (!client) throw new Error("No está configurada la conexión con Storage.");

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
      return Boolean(result.cleanupPending);
    } catch (cause) {
      if (reservationId && !finalized) {
        await fetch("/api/professional-images", {
          method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: reservationId }),
        }).catch(() => undefined);
      }
      throw cause;
    }
  }

  async function deletePhoto(photo: Photo) {
    const response = await fetch("/api/professional-images", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: photo.id }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "No se pudo borrar la imagen.");
  }

  async function replaceProfile() {
    if (!profileFile) { setError("Elegí una foto de perfil antes de continuar."); return; }
    const validationError = await clientFileError(profileFile);
    if (validationError) { setError(validationError); return; }
    const replacing = Boolean(profilePhoto);
    if (profilePhoto && !window.confirm("La foto principal actual se va a quitar antes de subir la nueva. Si la carga falla, vas a poder reintentar con el archivo seleccionado.")) return;

    setBusy(true); setError(""); setMessage("");
    try {
      if (profilePhoto) {
        await deletePhoto(profilePhoto);
        await refresh();
      }
      const cleanupPending = await uploadOne(profileFile, "profile");
      setProfileFile(null);
      if (profileInputRef.current) profileInputRef.current.value = "";
      await refresh();
      setMessage(cleanupPending ? "La foto está lista; quedó una limpieza temporal pendiente." : replacing ? "Reemplazamos la foto principal." : "Guardamos la foto principal.");
    } catch (cause) {
      setError(messageOf(cause, "No se pudo guardar la foto principal. La selección sigue disponible para reintentar."));
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function uploadPortfolio() {
    if (!portfolioFiles.length) { setError("Elegí al menos una foto de trabajos."); return; }
    setBusy(true); setError(""); setMessage("");
    let uploaded = 0;
    let pendingCleanup = false;
    let uploadError = "";
    for (const selected of portfolioFiles) {
      try {
        pendingCleanup = (await uploadOne(selected.file, "portfolio")) || pendingCleanup;
        uploaded++;
        setPortfolioFiles((current) => current.filter((item) => item.id !== selected.id));
      } catch (cause) {
        uploadError = messageOf(cause, "No se pudo cargar una foto de trabajos.");
        break;
      }
    }
    await refresh().catch((cause: unknown) => { uploadError ||= messageOf(cause, "No pudimos actualizar la galería."); });
    if (portfolioInputRef.current && uploaded === portfolioFiles.length) portfolioInputRef.current.value = "";
    if (uploadError) setError(uploaded ? `Subimos ${uploaded} foto${uploaded === 1 ? "" : "s"}. ${uploadError} La selección restante sigue disponible para reintentar.` : uploadError);
    else setMessage(pendingCleanup ? `Subimos ${uploaded} foto${uploaded === 1 ? "" : "s"}; quedó una limpieza temporal pendiente.` : `Subimos ${uploaded} foto${uploaded === 1 ? "" : "s"} de trabajos.`);
    setBusy(false);
  }

  function queuePortfolioFiles(files: File[]) {
    const available = Math.max(0, portfolioSlots - portfolioFiles.length);
    const accepted = files.slice(0, available).map((file) => ({ id: crypto.randomUUID(), file }));
    setPortfolioFiles((current) => [...current, ...accepted]);
    setError(files.length > available ? `Podés seleccionar hasta ${portfolioSlots} foto${portfolioSlots === 1 ? "" : "s"} más.` : "");
    setMessage("");
  }

  async function remove(photo: Photo) {
    if (!window.confirm(photo.state === "cleanup_pending" ? "¿Reintentar la limpieza y quitar esta foto?" : "¿Borrar esta foto?")) return;
    setBusy(true); setError(""); setMessage("");
    try { await deletePhoto(photo); await refresh(); setMessage("La imagen se borró correctamente."); }
    catch (cause) { setError(messageOf(cause, "No se pudo borrar la imagen.")); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  }

  async function retryStagingCleanup(photo: Photo) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/professional-images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: photo.id }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo limpiar el archivo temporal.");
      await refresh(); setMessage("Se limpió el archivo temporal.");
    } catch (cause) { setError(messageOf(cause, "No se pudo limpiar el archivo temporal.")); }
    finally { setBusy(false); }
  }

  return <section className="photo-manager" aria-labelledby="professional-photos-title">
    <div className="photo-manager-heading"><h3 id="professional-photos-title">Fotos del perfil</h3><p>Una imagen principal y hasta {MAX_PORTFOLIO_IMAGES} fotos de trabajos. JPEG, PNG o WebP; máximo 5 MiB y 20 megapíxeles por foto.</p></div>
    <div className="photo-editor-grid">
      <section className="photo-upload-control" aria-labelledby="profile-photo-upload-title">
        <h4 id="profile-photo-upload-title">Foto de perfil</h4>
        <label className="form-label" htmlFor="professional-profile-photo-file">Elegí una imagen principal</label>
        <input ref={profileInputRef} id="professional-profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setProfileFile(event.target.files?.[0] ?? null); event.target.value = ""; setError(""); setMessage(""); }} disabled={busy} />
        {profileFile && profilePreview && <div className="photo-preview"><Image unoptimized width={72} height={72} src={profilePreview} alt="Vista previa de la foto de perfil" /><span>{profileFile.name} · {(profileFile.size / 1024 / 1024).toFixed(2)} MiB</span><button type="button" className="text-link photo-delete" disabled={busy} onClick={() => setProfileFile(null)}>Quitar selección</button></div>}
        {profileFile && <button className="button" type="button" disabled={busy} onClick={() => void replaceProfile()}>{busy ? "Subiendo y validando…" : profilePhoto ? "Reemplazar foto de perfil" : "Guardar foto de perfil"}</button>}
        {!profileFile && <p className="field-help">La foto se almacena de forma privada y solo se muestra cuando el perfil está publicado.</p>}
      </section>

      <section className="photo-upload-control" aria-labelledby="portfolio-photo-upload-title">
        <h4 id="portfolio-photo-upload-title">Fotos de trabajos</h4>
        <label className="form-label" htmlFor="professional-portfolio-files">Elegí una o varias imágenes</label>
        <input ref={portfolioInputRef} id="professional-portfolio-files" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { queuePortfolioFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} disabled={busy || portfolioSlots === portfolioFiles.length} />
        <p className="field-help">Podés seleccionar hasta {portfolioSlots} más. Revisá la vista previa y quitá las que no quieras subir.</p>
        {portfolioPreviews.length > 0 && <div className="photo-pending-grid">{portfolioPreviews.map(({ id, file, url }) => <div className="photo-pending-item" key={id}><Image unoptimized width={96} height={76} src={url} alt={`Vista previa: ${file.name}`} /><span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MiB</span><button className="text-link photo-delete" type="button" disabled={busy} onClick={() => setPortfolioFiles((current) => current.filter((item) => item.id !== id))}>Quitar selección</button></div>)}</div>}
        {portfolioFiles.length > 0 && <button className="button button-quiet" type="button" disabled={busy} onClick={() => void uploadPortfolio()}>{busy ? "Subiendo fotos…" : `Subir ${portfolioFiles.length} foto${portfolioFiles.length === 1 ? "" : "s"} de trabajos`}</button>}
      </section>
    </div>
    {(error || message) && <p className={`form-alert${error ? " form-alert-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{error || message}</p>}
    <div className="photo-grid">
      {photos.map((photo) => <article className="photo-item" key={photo.id}>
        {photo.state === "ready" && photo.object_path ? <StorageImage path={photo.object_path} width={photo.width} height={photo.height} alt={photo.image_kind === "profile" ? "Foto principal del perfil" : "Trabajo del profesional"} /> : <div className="photo-unavailable">{photo.state === "cleanup_pending" ? "Limpieza pendiente" : "Procesando imagen"}</div>}
        <div className="photo-item-meta"><span>{photo.image_kind === "profile" ? "Foto principal" : "Trabajo"} · {photo.width} × {photo.height}</span><div>{photo.state === "ready" && photo.upload_path && <button className="text-link photo-delete" type="button" disabled={busy} onClick={() => void retryStagingCleanup(photo)}>Limpiar original temporal</button>}<button className="text-link photo-delete" type="button" disabled={busy} onClick={() => void remove(photo)}>{photo.state === "cleanup_pending" ? "Reintentar limpieza y borrar" : "Borrar"}</button></div></div>
      </article>)}
      {photos.length === 0 && <p className="photo-empty">Todavía no agregaste fotos.</p>}
    </div>
  </section>;
}
