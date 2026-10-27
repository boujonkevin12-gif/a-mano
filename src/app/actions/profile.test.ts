import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { saveProfessionalAction, updateProfileAction } from "@/app/actions/profile";

const ownerId = "8d045cd0-d33e-4ea5-9e47-45daf4c43f10";
const otherId = "da37c815-2a88-41cb-805f-2d604a944211";

function validProfessionalForm() {
  const form = new FormData();
  form.set("businessName", "Taller del barrio");
  form.set("description", "Reparo e instalo equipos en distintos barrios de la ciudad.");
  form.set("whatsappNationalNumber", "3442 123456");
  form.set("whatsappKind", "mobile");
  form.set("city", "Concepción del Uruguay");
  form.set("serviceArea", "Centro y alrededores");
  form.append("categorySlugs", "tecnologia");
  form.append("categorySlugs", "hogar-construccion");
  return form;
}

describe("acciones de perfil con identidad del servidor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("guarda el perfil profesional usando solo la identidad autenticada, ignorando IDs enviados por el cliente", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ownerId, error: null });
    const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: ownerId } }, error: null }) }, rpc };
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    const form = validProfessionalForm();
    form.set("user_id", otherId);
    form.set("professionalId", otherId);
    form.set("is_published", "true");
    form.set("status", "approved");

    const result = await saveProfessionalAction({ status: "idle" }, form);

    expect(result.status).toBe("success");
    expect(result.professionalId).toBe(ownerId);
    expect(rpc).toHaveBeenCalledWith("submit_own_professional_profile", expect.objectContaining({
      p_slug: `taller-del-barrio-${ownerId}`,
      p_business_name: "Taller del barrio",
      p_whatsapp_phone: "+5493442123456",
      p_category_slugs: ["tecnologia", "hogar-construccion"],
    }));
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args).not.toHaveProperty("p_user_id");
    expect(args).not.toHaveProperty("p_is_published");
    expect(args).not.toHaveProperty("p_status");
  });

  it("no guarda ni envía a la base un perfil sin rubros", async () => {
    const rpc = vi.fn();
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn() }, rpc });
    const form = validProfessionalForm();
    form.delete("categorySlugs");

    const result = await saveProfessionalAction({ status: "idle" }, form);

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.categorySlugs?.[0]).toContain("al menos una");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("actualiza el perfil personal con el ID del usuario autenticado, no con el ID enviado", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: ownerId }, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: ownerId } }, error: null }) },
      from: vi.fn().mockReturnValue({ update }),
    };
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    const form = new FormData();
    form.set("displayName", "María López");
    form.set("phone", "");
    form.set("city", "Concepción del Uruguay");
    form.set("id", otherId);

    const result = await updateProfileAction({ status: "idle" }, form);

    expect(result.status).toBe("success");
    expect(client.from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", ownerId);
  });
});
