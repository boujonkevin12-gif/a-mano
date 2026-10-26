import { describe, expect, it } from "vitest";
import { moderationSchema, newPasswordSchema, professionalSchema, profileSchema, signInSchema, signUpSchema, slugify } from "@/lib/validation";
import { safeInternalPath } from "@/lib/redirects";
import { normalizeSearchOptions, readSearchOptions } from "@/lib/search-params";
import { whatsappDigits } from "@/lib/whatsapp";

describe("validación de cuenta", () => {
  it("acepta registro con correo, nombre y contraseña válidos", () => {
    expect(signUpSchema.safeParse({ displayName: "María López", email: "maria@example.com", password: "una-clave-segura-12" }).success).toBe(true);
  });

  it("rechaza correo inválido y contraseñas cortas", () => {
    expect(signInSchema.safeParse({ email: "no-es-correo", password: "clave" }).success).toBe(false);
    expect(signUpSchema.safeParse({ displayName: "M", email: "maria@example.com", password: "clave" }).success).toBe(false);
  });

  it("exige que la contraseña nueva y su repetición coincidan", () => {
    expect(newPasswordSchema.safeParse({ password: "otra-clave-segura", passwordConfirmation: "otra-clave-segura" }).success).toBe(true);
    expect(newPasswordSchema.safeParse({ password: "otra-clave-segura", passwordConfirmation: "distinta" }).success).toBe(false);
  });

  it("valida teléfono opcional y ciudad del perfil", () => {
    expect(profileSchema.safeParse({ displayName: "María López", phone: "", city: "Concepción del Uruguay" }).success).toBe(true);
    expect(profileSchema.safeParse({ displayName: "María López", phone: "abc", city: "C. del Uruguay" }).success).toBe(false);
    expect(profileSchema.safeParse({ displayName: "María López", phone: "++++++", city: "C. del Uruguay" }).success).toBe(false);
  });
});

describe("validación del perfil profesional", () => {
  const validProfile = {
    businessName: "Taller del barrio",
    description: "Reparo e instalo equipos con atención en distintos barrios de la ciudad.",
    whatsappPhone: "+54 9 3442 123456",
    city: "Concepción del Uruguay",
    serviceArea: "Centro y alrededores",
    categorySlugs: ["tecnologia"],
  };

  it("acepta un perfil completo y exige por lo menos una categoría", () => {
    expect(professionalSchema.safeParse(validProfile).success).toBe(true);
    expect(professionalSchema.safeParse({ ...validProfile, categorySlugs: [] }).success).toBe(false);
  });

  it("limpia tildes y separa palabras en slugs", () => {
    expect(slugify("  Reparación de celulares  ")).toBe("reparacion-de-celulares");
  });
});

describe("redirecciones internas", () => {
  it("conserva una ruta interna y rechaza destinos externos o ambiguos", () => {
    expect(safeInternalPath("/cuenta?tab=perfil")).toBe("/cuenta?tab=perfil");
    expect(safeInternalPath("https://sitio-inseguro.example")).toBe("/cuenta");
    expect(safeInternalPath("//sitio-inseguro.example")).toBe("/cuenta");
    expect(safeInternalPath("/\\sitio-inseguro.example")).toBe("/cuenta");
  });
});

describe("búsqueda pública y contacto", () => {
  it("normaliza filtros, limita páginas y descarta categorías desconocidas", () => {
    expect(normalizeSearchOptions({ query: "  plomería   urgente ", city: " C. del Uruguay ", categorySlug: "no-existe", page: 999, sort: "recent" })).toEqual({
      query: "plomería urgente", city: "C. del Uruguay", categorySlug: "", page: 100, sort: "recent",
    });
    expect(normalizeSearchOptions({ query: "x".repeat(120), page: -4 }).page).toBe(1);
    expect(normalizeSearchOptions({ query: "x".repeat(120) }).query).toHaveLength(100);
    expect(readSearchOptions({ orden: "arbitrary" }).sort).toBe("name");
  });

  it("normaliza teléfonos internacionales plausibles y oculta los incompletos", () => {
    expect(whatsappDigits("+54 9 (3442) 123-456")).toBe("5493442123456");
    expect(whatsappDigits("0054 9 3442 123456")).toBe("5493442123456");
    expect(whatsappDigits("123456")).toBeNull();
    expect(whatsappDigits(null)).toBeNull();
  });
});

describe("validación de moderación", () => {
  it("acepta acciones y estados esperados válidos, y rechaza referencias inválidas", () => {
    expect(moderationSchema.safeParse({
      professionalId: "60000000-0000-4000-8000-000000000001",
      decision: "approve",
      reason: "",
      expectedStatus: "pending",
      expectedPublished: "false",
    }).success).toBe(true);
    expect(moderationSchema.safeParse({
      professionalId: "no-es-uuid",
      decision: "make-admin",
      reason: "",
      expectedStatus: "pending",
      expectedPublished: "false",
    }).success).toBe(false);
  });
});
