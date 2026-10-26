import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseStorageAdminClient } from "@/lib/supabase/storage-admin";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { IMAGE_BUCKET, isUuid, validateImageFile } from "@/lib/images/validation";
import { sanitizeImage } from "@/lib/images/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function originAllowed(request: Request) {
  const config = getSupabaseConfig();
  const origin = request.headers.get("origin");
  return Boolean(config && origin && origin === new URL(config.appUrl).origin);
}
async function readId(request: Request): Promise<string> {
  const maxBytes = 1024;
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error("Solicitud demasiado grande");
  if (!request.body) throw new Error("Solicitud vacía");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error("Solicitud demasiado grande"); }
    chunks.push(value);
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks.map((part) => Buffer.from(part)), total).toString("utf8"));
  const result = z.object({ id: z.string().uuid() }).safeParse(body);
  if (!result.success) throw new Error("Solicitud inválida");
  return result.data.id;
}

/** Validates the browser's private staging object, strips metadata, and writes only sanitized bytes. */
export async function POST(request: Request) {
  if (!originAllowed(request)) return jsonError("Origen de solicitud no permitido.", 403);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("El servicio no está configurado.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Iniciá sesión para finalizar la carga.", 401);
  let id: string;
  try { id = await readId(request); } catch { return jsonError("Solicitud inválida.", 400); }

  const { data: rows, error: lookupError } = await supabase.rpc("get_professional_image_upload", { p_image_id: id });
  const image = rows?.[0];
  if (lookupError || !image) return jsonError("No encontramos una reserva de imagen propia.", 404);
  if (image.state === "ready") return NextResponse.json({ ok: true, cleanupPending: Boolean(image.upload_path) }, { headers: { "Cache-Control": "no-store" } });
  const stageMatch = image.upload_path?.match(/^uploading\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp)$/i);
  const finalMatch = image.object_path.match(/^professionals\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp)$/i);
  const extensionMatches = (image.mime_type === "image/jpeg" && image.extension === "jpg")
    || (image.mime_type === "image/png" && image.extension === "png")
    || (image.mime_type === "image/webp" && image.extension === "webp");
  if (!stageMatch || !finalMatch || !isUuid(stageMatch[1]) || !isUuid(finalMatch[2])
      || stageMatch[2] !== id || stageMatch[3] !== image.extension
      || finalMatch[1] !== stageMatch[1] || finalMatch[3] !== image.extension || !extensionMatches) {
    return jsonError("La reserva contiene rutas o metadatos inválidos.", 409);
  }
  if (image.state !== "uploading" || !image.upload_path) return jsonError("La carga ya no está disponible. Volvé a intentarlo.", 409);

  const { data: original, error: downloadError } = await supabase.storage.from(IMAGE_BUCKET).download(image.upload_path);
  if (downloadError || !original) return jsonError("No encontramos el archivo cargado. Volvé a intentarlo.", 400);
  let sanitized;
  let validated;
  try {
    const bytes = Buffer.from(await original.arrayBuffer());
    validated = validateImageFile({ name: image.upload_path, type: image.mime_type, size: image.size_bytes }, bytes);
    sanitized = await sanitizeImage(bytes, validated.mimeType);
  } catch (cause) {
    const { error: cleanupError } = await supabase.storage.from(IMAGE_BUCKET).remove([image.upload_path]);
    await supabase.rpc("cancel_professional_image_upload", { p_image_id: id });
    return jsonError(cleanupError
      ? "La imagen no es válida y quedó privada para limpiar. Borrala desde tus fotos para reintentar."
      : (cause instanceof Error ? cause.message : "La imagen no es válida."), 400);
  }

  const storageAdmin = createSupabaseStorageAdminClient();
  if (!storageAdmin) return jsonError("Falta configurar la clave privada de Storage en el servidor.", 503);
  const { error: writeError } = await storageAdmin.storage.from(IMAGE_BUCKET).upload(image.object_path, sanitized.bytes, {
    contentType: validated.mimeType, cacheControl: "0", upsert: false,
  });
  if (writeError) {
    const { error: cleanupError } = await supabase.storage.from(IMAGE_BUCKET).remove([image.upload_path]);
    await supabase.rpc("cancel_professional_image_upload", { p_image_id: id });
    return jsonError(cleanupError
      ? "No pudimos procesar la foto; el original quedó privado para limpiar. Reintentá desde tus fotos."
      : "No pudimos guardar la imagen procesada. Volvé a intentarlo.", 502);
  }

  const { error: markError } = await supabase.rpc("mark_professional_image_uploaded", {
    p_image_id: id, p_mime_type: validated.mimeType, p_extension: validated.extension,
    p_size_bytes: sanitized.bytes.length, p_width: sanitized.width, p_height: sanitized.height,
  });
  if (markError) {
    // The final object is private and not readable under the row state. Compensate server-side.
    await storageAdmin.storage.from(IMAGE_BUCKET).remove([image.object_path]);
    await supabase.storage.from(IMAGE_BUCKET).remove([image.upload_path]);
    await supabase.rpc("cancel_professional_image_upload", { p_image_id: id });
    return jsonError("La imagen no pudo finalizarse y no se publicó. Actualizá tus fotos para revisar la limpieza.", 502);
  }

  const { error: stagingRemovalError } = await supabase.storage.from(IMAGE_BUCKET).remove([image.upload_path]);
  if (!stagingRemovalError) {
    const { error: clearError } = await supabase.rpc("clear_professional_image_upload_path", { p_image_id: id });
    if (!clearError) return NextResponse.json({ ok: true, cleanupPending: false }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, cleanupPending: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
