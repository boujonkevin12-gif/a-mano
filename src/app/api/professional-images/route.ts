import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { IMAGE_BUCKET, isUuid, MAX_IMAGE_BYTES } from "@/lib/images/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reservationSchema = z.object({
  professionalId: z.string().uuid(),
  kind: z.enum(["profile", "portfolio"]),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  extension: z.enum(["jpg", "png", "webp"]),
  sizeBytes: z.number().int().min(1).max(MAX_IMAGE_BYTES),
}).refine((v) => (v.mimeType === "image/jpeg" && v.extension === "jpg")
  || (v.mimeType === "image/png" && v.extension === "png")
  || (v.mimeType === "image/webp" && v.extension === "webp"), "Formato incompatible");

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function originAllowed(request: Request) {
  const config = getSupabaseConfig();
  const origin = request.headers.get("origin");
  return Boolean(config && origin && origin === new URL(config.appUrl).origin);
}

async function smallJson(request: Request): Promise<unknown> {
  const maxBytes = 4096;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Solicitud demasiado grande");
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
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  return JSON.parse(bytes.toString("utf8")) as unknown;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("El servicio no está configurado.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Iniciá sesión para administrar tus imágenes.", 401);
  const { data, error } = await supabase.rpc("get_own_professional_images");
  if (error) return jsonError("No pudimos cargar las imágenes del perfil.", 500);
  return NextResponse.json({ images: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Reserves a private staging key. File bytes go directly from the browser to Storage. */
export async function POST(request: Request) {
  if (!originAllowed(request)) return jsonError("Origen de solicitud no permitido.", 403);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("El servicio no está configurado.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Iniciá sesión para cargar imágenes.", 401);
  let body: unknown;
  try { body = await smallJson(request); } catch { return jsonError("Solicitud inválida.", 400); }
  const parsed = reservationSchema.safeParse(body);
  if (!parsed.success) return jsonError("Revisá el formato y tamaño de la imagen.", 400);
  const input = parsed.data;
  const { data, error } = await supabase.rpc("reserve_professional_image", {
    p_professional_id: input.professionalId, p_kind: input.kind, p_mime_type: input.mimeType,
    p_extension: input.extension, p_size_bytes: input.sizeBytes, p_width: 1, p_height: 1,
  });
  if (error) {
    if (error.code === "42501") return jsonError("No tenés permiso para modificar este perfil.", 403);
    if (error.code === "23505" || error.code === "23514") return jsonError(input.kind === "profile" ? "El perfil ya tiene una foto principal." : "Alcanzaste el máximo de 8 fotos de trabajos.", 409);
    return jsonError("No pudimos reservar espacio para la imagen. Revisá el estado del perfil.", 400);
  }
  const reservation = data?.[0];
  if (!reservation || !isUuid(reservation.image_id)
      || reservation.object_path !== `uploading/${input.professionalId}/${reservation.image_id}.${input.extension}`) {
    return jsonError("No pudimos preparar la carga.", 500);
  }
  return NextResponse.json({ id: reservation.image_id, uploadPath: reservation.object_path }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

/** Removes both the sanitized object and any private staging object, owner-only via RPC + Storage RLS. */
export async function DELETE(request: Request) {
  if (!originAllowed(request)) return jsonError("Origen de solicitud no permitido.", 403);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("El servicio no está configurado.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Iniciá sesión para borrar imágenes.", 401);
  let body: unknown;
  try { body = await smallJson(request); } catch { return jsonError("Solicitud inválida.", 400); }
  const id = body && typeof body === "object" && "id" in body && typeof body.id === "string" ? body.id : "";
  if (!isUuid(id)) return jsonError("Imagen inválida.", 400);
  const { data: rows, error: beginError } = await supabase.rpc("begin_professional_image_delete_paths", { p_image_id: id });
  const paths = rows?.[0];
  if (beginError || !paths?.object_path) return jsonError("No encontramos una imagen que puedas borrar.", 404);
  const toRemove = [paths.object_path, paths.upload_path].filter((path): path is string => Boolean(path));
  const { error: removeError } = await supabase.storage.from(IMAGE_BUCKET).remove(toRemove);
  if (removeError) {
    await supabase.rpc("mark_professional_image_cleanup_pending", { p_image_id: id });
    return jsonError("No pudimos borrar todos los archivos; quedaron marcados para reintentar.", 502);
  }
  const { error: finishError } = await supabase.rpc("finish_professional_image_delete", { p_image_id: id });
  const { data: remaining, error: listError } = await supabase.rpc("get_own_professional_images");
  if (finishError || listError || remaining?.some((image) => image.id === id)) {
    await supabase.rpc("mark_professional_image_cleanup_pending", { p_image_id: id });
    return jsonError("Los archivos se borraron, pero falta cerrar su registro. Actualizá para reintentar.", 502);
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/** Retries deletion of the private browser-upload staging object without removing the ready photo. */
export async function PATCH(request: Request) {
  if (!originAllowed(request)) return jsonError("Origen de solicitud no permitido.", 403);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("El servicio no está configurado.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Iniciá sesión para limpiar imágenes.", 401);
  let body: unknown;
  try { body = await smallJson(request); } catch { return jsonError("Solicitud inválida.", 400); }
  const id = body && typeof body === "object" && "id" in body && typeof body.id === "string" ? body.id : "";
  if (!isUuid(id)) return jsonError("Imagen inválida.", 400);
  const { data: rows, error: lookupError } = await supabase.rpc("get_professional_image_upload", { p_image_id: id });
  const image = rows?.[0];
  if (lookupError || !image || image.state !== "ready") return jsonError("No encontramos una imagen lista que puedas limpiar.", 404);
  if (!image.upload_path) return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  const { error: removeError } = await supabase.storage.from(IMAGE_BUCKET).remove([image.upload_path]);
  if (removeError) return jsonError("No pudimos borrar el original temporal. Sigue privado; podés reintentar.", 502);
  const { error: clearError } = await supabase.rpc("clear_professional_image_upload_path", { p_image_id: id });
  if (clearError) return jsonError("Se borró el original temporal, pero falta actualizar su registro. Volvé a intentar.", 502);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
