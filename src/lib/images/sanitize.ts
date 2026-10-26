import sharp from "sharp";
import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "@/lib/images/validation";

const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;

/** Fully decodes and re-encodes an accepted raster image; Sharp strips EXIF by default. */
export async function sanitizeImage(bytes: Buffer, mimeType: keyof typeof formats) {
  const image = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning", animated: false });
  const metadata = await image.metadata();
  if (metadata.format !== formats[mimeType] || (metadata.pages ?? 1) > 1) throw new Error("Usá una imagen estática JPEG, PNG o WebP válida.");
  const output = await image.rotate().toFormat(formats[mimeType]).toBuffer({ resolveWithObject: true });
  const { width, height } = output.info;
  if (output.data.length < 1 || output.data.length > MAX_IMAGE_BYTES) throw new Error("La imagen procesada supera el máximo permitido de 5 MiB.");
  if (width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error("La imagen supera el máximo permitido de 20 megapíxeles.");
  }
  return { bytes: output.data, width, height };
}
