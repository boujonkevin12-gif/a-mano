export const IMAGE_BUCKET = "amano-professional-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const MAX_IMAGE_DIMENSION = 10_000;
export const MAX_PORTFOLIO_IMAGES = 8;

export type ImageKind = "profile" | "portfolio";
export type ValidatedImage = { mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp"; width: number; height: number };

function dimensions(bytes: Buffer, mime: ValidatedImage["mimeType"]): [number, number] | null {
  if (mime === "image/png") {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (mime === "image/jpeg") {
    if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if ([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7].includes(marker)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) return null;
        return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
      }
      offset += length;
    }
    return null;
  }
  if (bytes.length < 25 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) return null;
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = bytes.readUIntLE(24, 3) + 1;
    const height = bytes.readUIntLE(27, 3) + 1;
    return [width, height];
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b1 = bytes[21], b2 = bytes[22], b3 = bytes[23], b4 = bytes[24];
    return [1 + (((b2 & 0x3f) << 8) | b1), 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))];
  }
  return null;
}

export function validateImageFile(file: { name: string; type: string; size: number }, bytes: Buffer): ValidatedImage {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || bytes.length !== file.size) throw new Error("La imagen debe pesar como máximo 5 MiB.");
  const extension = file.name.toLowerCase().split(".").at(-1);
  const signatures: Array<{ mime: ValidatedImage["mimeType"]; extension: ValidatedImage["extension"] }> = [
    { mime: "image/jpeg", extension: "jpg" }, { mime: "image/png", extension: "png" }, { mime: "image/webp", extension: "webp" },
  ];
  const found = signatures.find(({ mime }) => dimensions(bytes, mime) !== null);
  if (!found || file.type !== found.mime || (extension !== found.extension && !(found.mime === "image/jpeg" && extension === "jpeg"))) {
    throw new Error("El archivo no parece una imagen JPEG, PNG o WebP válida, o su extensión no coincide.");
  }
  const [width, height] = dimensions(bytes, found.mime)!;
  if (width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error("La imagen supera el máximo permitido de 20 megapíxeles.");
  }
  return { mimeType: found.mime, extension: found.extension, width, height };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
