import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getSupabaseConfig: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseConfig: mocks.getSupabaseConfig }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { registerAction, signInAction, signOutAction } from "@/app/actions/auth";

describe("acciones de autenticación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registra con nombre de perfil y callback interno de confirmación", async () => {
    const signUp = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signUp } });
    mocks.getSupabaseConfig.mockReturnValue({ appUrl: "https://amano.example" });
    const form = new FormData();
    form.set("displayName", "María López");
    form.set("email", "maria@example.com");
    form.set("password", "una-clave-segura-12");

    const result = await registerAction({ status: "idle" }, form);

    expect(result.status).toBe("success");
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "maria@example.com",
      options: expect.objectContaining({
        data: { display_name: "María López" },
        emailRedirectTo: "https://amano.example/auth/callback?next=%2Fcuenta",
      }),
    }));
  });

  it("registra solo código y estado del error de Supabase y conserva el mensaje genérico", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const signUp = vi.fn().mockResolvedValue({
      error: {
        code: "over_email_send_rate_limit",
        status: 429,
        message: "Sensitive upstream details",
      },
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signUp } });
    mocks.getSupabaseConfig.mockReturnValue({ appUrl: "https://amano.example" });
    const form = new FormData();
    form.set("displayName", "Private User Name");
    form.set("email", "private-user@example.invalid");
    form.set("password", "Sensitive-Password-123!");

    try {
      const result = await registerAction({ status: "idle" }, form);

      expect(result).toEqual({
        status: "error",
        message: "No pudimos crear la cuenta. Revisá el correo, la contraseña o intentá más tarde.",
      });
      expect(diagnostic).toHaveBeenCalledOnce();
      expect(diagnostic).toHaveBeenCalledWith("[auth.register] Supabase signUp failed", {
        code: "over_email_send_rate_limit",
        status: 429,
      });

      const loggedOutput = JSON.stringify(diagnostic.mock.calls);
      expect(loggedOutput).not.toContain("private-user@example.invalid");
      expect(loggedOutput).not.toContain("Sensitive-Password-123!");
      expect(loggedOutput).not.toContain("Private User Name");
      expect(loggedOutput).not.toContain("Sensitive upstream details");
    } finally {
      diagnostic.mockRestore();
    }
  });

  it("inicia sesión y redirige solo a una ruta interna validada", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signInWithPassword } });
    const form = new FormData();
    form.set("email", "maria@example.com");
    form.set("password", "una-clave-segura-12");
    form.set("next", "https://sitio-inseguro.example");

    await signInAction({ status: "idle" }, form);

    expect(signInWithPassword).toHaveBeenCalledWith({ email: "maria@example.com", password: "una-clave-segura-12" });
    expect(mocks.redirect).toHaveBeenCalledWith("/cuenta");
  });

  it("cierra sesión en Supabase antes de volver al inicio", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signOut } });

    await signOutAction();

    expect(signOut).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
