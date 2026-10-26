import { describe, expect, it } from "vitest";
import { validateImageFile } from "@/lib/images/validation";
import sharp from "sharp";
import { sanitizeImage } from "@/lib/images/sanitize";

function png(width = 2, height = 3) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.write("IHDR", 12, "ascii"); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return bytes;
}
function jpeg() { return Buffer.from([0xff,0xd8,0xff,0xc0,0,8,8,0,1,0,1,3,1,0,0xff,0xd9]); }
function webp(width = 2, height = 3) {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WEBP", 8, "ascii"); bytes.write("VP8X", 12, "ascii");
  bytes.writeUIntLE(width - 1, 24, 3); bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

describe("validación de imágenes profesionales", () => {
  it("reconoce la firma, extensión y dimensiones de PNG, JPEG y WebP", () => {
    expect(validateImageFile({ name: "foto.png", type: "image/png", size: 24 }, png())).toMatchObject({ mimeType: "image/png", width: 2, height: 3 });
    expect(validateImageFile({ name: "foto.jpeg", type: "image/jpeg", size: 16 }, jpeg())).toMatchObject({ mimeType: "image/jpeg", extension: "jpg", width: 1, height: 1 });
    expect(validateImageFile({ name: "foto.webp", type: "image/webp", size: 30 }, webp())).toMatchObject({ mimeType: "image/webp", width: 2, height: 3 });
  });
  it("rechaza MIME o extensión que no coincide con la firma", () => {
    expect(() => validateImageFile({ name: "foto.png", type: "image/jpeg", size: 24 }, png())).toThrow(/no parece/);
    expect(() => validateImageFile({ name: "foto.jpg", type: "image/png", size: 24 }, png())).toThrow(/no parece/);
  });
  it("rechaza archivos vacíos, truncados y mayores al límite", () => {
    expect(() => validateImageFile({ name: "vacio.png", type: "image/png", size: 0 }, Buffer.alloc(0))).toThrow(/5 MiB/);
    expect(() => validateImageFile({ name: "corto.png", type: "image/png", size: 10 }, Buffer.alloc(10))).toThrow(/no parece/);
    expect(() => validateImageFile({ name: "grande.png", type: "image/png", size: 5 * 1024 * 1024 + 1 }, Buffer.alloc(5 * 1024 * 1024 + 1))).toThrow(/5 MiB/);
  });
  it("rechaza dimensiones desproporcionadas", () => {
    expect(() => validateImageFile({ name: "grande.png", type: "image/png", size: 24 }, png(5000, 5000))).toThrow(/20 megapíxeles/);
  });
  it("decodifica y vuelve a codificar la imagen para retirar metadatos", async () => {
    const source = await sharp({ create: { width: 3, height: 2, channels: 3, background: "red" } }).png().withMetadata({ exif: { IFD0: { Artist: "fixture" } } }).toBuffer();
    const sanitized = await sanitizeImage(source, "image/png");
    const outputMetadata = await sharp(sanitized.bytes).metadata();
    expect(sanitized).toMatchObject({ width: 3, height: 2 });
    expect(outputMetadata.exif).toBeUndefined();
  });
  it("rechaza un archivo que tiene cabecera PNG pero no se puede decodificar", async () => {
    await expect(sanitizeImage(png(), "image/png")).rejects.toThrow();
  });
});
