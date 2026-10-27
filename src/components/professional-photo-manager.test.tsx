import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfessionalPhotoManager } from "@/components/professional-photo-manager";

describe("selector de imágenes del perfil profesional", () => {
  it("mantiene separado el selector del avatar del selector múltiple de trabajos", () => {
    const markup = renderToStaticMarkup(createElement(ProfessionalPhotoManager, { professionalId: "60000000-0000-4000-8000-000000000001" }));

    expect(markup).toContain('id="professional-profile-photo-file"');
    expect(markup).toContain('id="professional-portfolio-files"');
    expect(markup).toMatch(/id="professional-portfolio-files"[^>]*multiple=""/);
    expect(markup).toContain("Foto de perfil");
    expect(markup).toContain("Fotos de trabajos");
    expect(markup).toContain("JPEG, PNG o WebP");
  });
});
