import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";

const bucket = "amano-professional-images";
const root = resolve(process.cwd());
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const workdir = process.env.SUPABASE_TEST_WORKDIR ?? "";

type Identity = {
  id: string;
  client: SupabaseClient;
  cookie: string;
  email: string;
  password: string;
};

type Reservation = { id: string; uploadPath: string };
type OwnedImage = { id: string; object_path: string | null; upload_path: string | null; state: string };
type AdminImage = { id: string };

const createdUsers: string[] = [];
const createdPaths = new Set<string>();
let app: ReturnType<typeof spawn> | undefined;
let appUrl = "";
let owner: Identity;
let other: Identity;
let admin: Identity;
let ownerProfessionalId = "";
let otherProfessionalId = "";
let imageBytes = Buffer.alloc(0);

function requireTestConfig() {
  if (!supabaseUrl || !anonKey || !serviceKey || !workdir) {
    throw new Error("Set local test URL, publishable key, server-only service key, and SUPABASE_TEST_WORKDIR before running this suite.");
  }
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl)) {
    throw new Error("Integration tests accept only a loopback Supabase URL.");
  }
}

async function verifyTemporaryProject() {
  const configPath = join(workdir, "supabase", "config.toml");
  const config = await readFile(configPath, "utf8");
  const projectId = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1] ?? "";
  const apiPort = Number(config.match(/^\[api\][\s\S]*?^\s*port\s*=\s*(\d+)/m)?.[1]);
  const dbPort = Number(config.match(/^\[db\][\s\S]*?^\s*port\s*=\s*(\d+)/m)?.[1]);
  const urlPort = Number(new URL(supabaseUrl).port || (new URL(supabaseUrl).protocol === "https:" ? 443 : 80));
  if (!/^amano-img-integration-[a-f0-9]{32}$/.test(projectId)
      || resolve(workdir) === root
      || !Number.isInteger(apiPort) || !Number.isInteger(dbPort)
      || apiPort === 54321 || dbPort === 54322 || urlPort !== apiPort) {
    throw new Error("Refusing database tests: workdir is not a uniquely identified Supabase test project with its own API and DB ports.");
  }
}

function makeClient(key: string, accessToken?: string) {
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

async function cookieForSession(accessToken: string, refreshToken: string) {
  const cookieValues = new Map<string, string>();
  const serverClient = createServerClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    cookies: {
      getAll: () => [...cookieValues].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => { for (const cookie of cookies) cookieValues.set(cookie.name, cookie.value); },
    },
  });
  const { error } = await serverClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw new Error("Could not create a local SSR cookie from the test session.");
  const cookie = [...cookieValues].map(([name, value]) => `${name}=${value}`).join("; ");
  if (!cookie) throw new Error("No session cookie was created for the local test user.");
  return cookie;
}

async function sessionFromBrowser(identity: Identity) {
  const client = makeClient(anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email: identity.email, password: identity.password });
  if (error || !data.session) throw new Error("Could not restore the local test user's session.");
  identity.client = client;
  identity.cookie = await cookieForSession(data.session.access_token, data.session.refresh_token);
}

async function signOutThroughServerCookie(identity: Identity) {
  const values = new Map(identity.cookie.split(/;\s*/).filter(Boolean).map((item) => {
    const separator = item.indexOf("=");
    return [item.slice(0, separator), item.slice(separator + 1)] as const;
  }));
  const serverClient = createServerClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    cookies: {
      getAll: () => [...values].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const cookie of cookies) {
          if (!cookie.value || cookie.options?.maxAge === 0) values.delete(cookie.name);
          else values.set(cookie.name, cookie.value);
        }
      },
    },
  });
  const { error } = await serverClient.auth.signOut();
  if (error) throw new Error("Could not sign out the local test session.");
  identity.cookie = [...values].map(([name, value]) => `${name}=${value}`).join("; ");
  identity.client = makeClient(anonKey);
}

async function createIdentity(label: string): Promise<Identity> {
  const email = `image-${label}-${randomUUID()}@example.invalid`;
  const password = `Local-Test-${randomUUID()}-Aa9!`;
  const adminClient = makeClient(serviceKey);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error(`Could not create local test user (${label}).`);
  createdUsers.push(created.user.id);

  const client = makeClient(anonKey);
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw new Error(`Could not authenticate local test user (${label}).`);

  const cookie = await cookieForSession(signedIn.session.access_token, signedIn.session.refresh_token);
  return { id: created.user.id, client, cookie, email, password };
}

async function createProfessional(identity: Identity, label: string, whatsappPhone: string | null = null, categorySlugs = ["hogar-construccion"]) {
  const { data, error } = await identity.client.rpc("submit_own_professional_profile", {
    p_slug: `${label}-${identity.id}`,
    p_business_name: `Servicio ${label}`,
    p_description: "Descripción de prueba con suficiente texto para el perfil profesional.",
    p_whatsapp_phone: whatsappPhone,
    p_city: "Ciudad de prueba",
    p_service_area: "Toda la ciudad de prueba",
    p_category_slugs: categorySlugs,
  });
  if (error || typeof data !== "string") throw new Error(`Could not create local professional fixture (${label}).`);
  return data;
}

async function reserve(identity: Identity, professionalId: string, kind: "profile" | "portfolio" = "portfolio") {
  const response = await request(identity, "/api/professional-images", "POST", {
    professionalId,
    kind,
    mimeType: "image/png",
    extension: "png",
    sizeBytes: imageBytes.length,
  });
  expect(response.status, await response.clone().text()).toBe(201);
  const value = await response.json() as Reservation;
  createdPaths.add(value.uploadPath);
  return value;
}

async function request(
  identity: Identity | null,
  path: string,
  method: string,
  body?: unknown,
) {
  return fetch(`${appUrl}${path}`, {
    method,
    headers: {
      Origin: appUrl,
      ...(identity ? { Cookie: identity.cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function upload(identity: Identity, path: string, bytes = imageBytes) {
  const { error } = await identity.client.storage.from(bucket).upload(path, bytes, {
    contentType: "image/png",
    upsert: false,
  });
  if (error) throw new Error(`Storage upload failed for local fixture (${path}).`);
}

async function download(client: SupabaseClient, path: string) {
  return client.storage.from(bucket).download(path);
}

async function localSql(sql: string) {
  const file = join(tmpdir(), `amano-image-test-${randomUUID()}.sql`);
  await writeFile(file, `${sql.trim()}\n`, { encoding: "utf8", flag: "wx" });
  try {
    const cliPath = resolve(root, "node_modules/supabase/dist/supabase.js");
    const result = spawnSync(process.execPath, [cliPath, "db", "query", "--local", "--workdir", workdir, "--file", file], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      stdio: "pipe",
    });
    if (result.error || result.status !== 0) {
      throw new Error(`Local-only SQL fixture failed with exit code ${String(result.status)}.`);
    }
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

async function getFreePort() {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve an application test port.");
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return address.port;
}

async function startApplication() {
  const port = await getFreePort();
  appUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
    NEXT_PUBLIC_APP_URL: appUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  };
  const nextCli = resolve(root, "node_modules/next/dist/bin/next");
  app = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env,
    stdio: "ignore",
    windowsHide: true,
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error(`Next.js test server exited early (${app.exitCode}).`);
    try {
      const response = await fetch(`${appUrl}/api/professional-images`);
      if (response.status === 401) return;
    } catch {
      // Wait for the real Next route to finish compiling.
    }
    await delay(500);
  }
  throw new Error("Next.js test server did not become ready in time.");
}

async function stopApplication() {
  if (!app || app.exitCode !== null) return;
  if (process.platform === "win32" && app.pid) {
    spawnSync("taskkill.exe", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    app.kill("SIGTERM");
  }
  await Promise.race([
    new Promise<void>((resolvePromise) => app?.once("exit", () => resolvePromise())),
    delay(10_000),
  ]);
}

describe("flujo de integración de imágenes profesionales en Supabase local", () => {
  beforeAll(async () => {
    requireTestConfig();
    await verifyTemporaryProject();
    imageBytes = await sharp({ create: { width: 4, height: 3, channels: 3, background: "#24a148" } })
      .png()
      .withMetadata({ exif: { IFD0: { Artist: "integration-fixture" } } })
      .toBuffer();
    await startApplication();
    owner = await createIdentity("owner");
    other = await createIdentity("other");
    admin = await createIdentity("admin");
    ownerProfessionalId = await createProfessional(owner, "integration-owner", "+5493442123456", ["hogar-construccion", "tecnologia"]);
    otherProfessionalId = await createProfessional(other, "integration-other");
  }, 90_000);

  afterAll(async () => {
    await stopApplication();
    if (!supabaseUrl || !serviceKey) return;
    const service = makeClient(serviceKey);
    const paths = [...createdPaths];
    if (paths.length) {
      const { error } = await service.storage.from(bucket).remove([...new Set(paths)]);
      if (error) throw new Error("Could not clean Storage objects created by the integration test.");
    }
    if (createdUsers.length && workdir) {
      const userIds = createdUsers.map((id) => {
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unexpected local test user ID format.");
        return `'${id}'::uuid`;
      });
      const fixtureUsers = `array[${userIds.join(",")}]::uuid[]`;
      await localSql(`delete from private.professional_moderation_events where admin_id = any(${fixtureUsers}) or professional_id in (select id from public.professionals where user_id = any(${fixtureUsers}));`);
      await localSql(`delete from private.professional_images where professional_id in (select id from public.professionals where user_id = any(${fixtureUsers}));`);
      await localSql(`delete from private.admin_users where user_id = any(${fixtureUsers});`);
      await localSql(`delete from private.admin_role_events where target_user_id = any(${fixtureUsers});`);
    }
    for (const id of createdUsers) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) throw new Error("Could not remove an Auth user created by the integration test.");
    }
  }, 60_000);

  it("persists registration, SSR session, and own professional data while handling accounts without a professional", async () => {
    const email = `account-${randomUUID()}@example.invalid`;
    const password = `Local-Test-${randomUUID()}-Aa9!`;
    const signupClient = makeClient(anonKey);
    const { data: signup, error: signupError } = await signupClient.auth.signUp({
      email,
      password,
      options: { data: { display_name: "Cuenta de integración" } },
    });
    expect(signupError).toBeNull();
    expect(signup.user?.id).toBeTruthy();
    if (!signup.user) throw new Error("Local Auth did not return the registered user.");
    createdUsers.push(signup.user.id);

    const service = makeClient(serviceKey);
    const { error: confirmError } = await service.auth.admin.updateUserById(signup.user.id, { email_confirm: true });
    expect(confirmError).toBeNull();
    const { data: basicProfile, error: profileError } = await service.from("profiles")
      .select("id, display_name")
      .eq("id", signup.user.id)
      .maybeSingle();
    expect(profileError).toBeNull();
    expect(basicProfile).toMatchObject({ id: signup.user.id, display_name: "Cuenta de integración" });

    const newIdentity: Identity = { id: signup.user.id, client: signupClient, cookie: "", email, password };
    await sessionFromBrowser(newIdentity);
    const professionalId = await createProfessional(newIdentity, "account-created");
    const own = await newIdentity.client.rpc("get_own_professional_profile");
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    expect(own.data?.[0]).toMatchObject({ id: professionalId, business_name: "Servicio account-created" });
    expect((await other.client.rpc("get_own_professional_profile")).data?.[0]?.id).toBe(otherProfessionalId);

    const crossEdit = await newIdentity.client.rpc("submit_own_professional_profile", {
      p_slug: `intento-ajeno-${other.id}`,
      p_business_name: "Intento ajeno",
      p_description: "Descripción de prueba con texto suficiente para el perfil profesional.",
      p_whatsapp_phone: null,
      p_city: "Ciudad de prueba",
      p_service_area: "Toda la ciudad de prueba",
      p_category_slugs: ["hogar-construccion"],
    });
    expect(crossEdit.error?.code).toBe("22023");
    const untouchedOther = await other.client.rpc("get_own_professional_profile");
    expect(untouchedOther.data?.[0]).toMatchObject({ id: otherProfessionalId, business_name: "Servicio integration-other" });

    const edit = await newIdentity.client.rpc("submit_own_professional_profile", {
      p_slug: `servicio-actualizado-${newIdentity.id}`,
      p_business_name: "Servicio actualizado",
      p_description: "Descripción profesional actualizada con suficiente detalle para revisión.",
      p_whatsapp_phone: "+54 9 3442 123456",
      p_city: "Concepción del Uruguay",
      p_service_area: "Centro y alrededores",
      p_category_slugs: ["tecnologia"],
    });
    expect(edit.error).toBeNull();
    const changed = await newIdentity.client.rpc("get_own_professional_profile");
    expect(changed.data?.[0]).toMatchObject({
      id: professionalId,
      business_name: "Servicio actualizado",
      status: "pending",
      is_published: false,
      whatsapp_phone: "+54 9 3442 123456",
    });

    const publicForm = await request(newIdentity, "/publicar", "GET");
    expect(publicForm.status).toBe(200);
    expect(await publicForm.text()).toContain('value="Servicio actualizado"');
    const accountPage = await request(newIdentity, "/cuenta", "GET");
    expect(accountPage.status).toBe(200);
    expect(await accountPage.text()).toContain("Cuenta de integración");

    await signOutThroughServerCookie(newIdentity);
    const signedOut = await fetch(`${appUrl}/cuenta`, { redirect: "manual", headers: { Cookie: newIdentity.cookie } });
    expect(signedOut.status).toBe(307);
    expect(new URL(signedOut.headers.get("location")!, appUrl).pathname).toBe("/ingresar");
    await sessionFromBrowser(newIdentity);
    const restoredAccount = await request(newIdentity, "/cuenta", "GET");
    expect(restoredAccount.status).toBe(200);
    const restoredAccountHtml = await restoredAccount.text();
    expect(restoredAccountHtml).toContain("Pendiente de revisión");
    const restoredPublishForm = await request(newIdentity, "/publicar", "GET");
    expect(restoredPublishForm.status).toBe(200);
    expect(await restoredPublishForm.text()).toContain('value="Servicio actualizado"');

    const noProfessional = await admin.client.rpc("get_own_professional_profile");
    expect(noProfessional.error).toBeNull();
    expect(noProfessional.data).toEqual([]);
    const emptyPublishPage = await request(admin, "/publicar", "GET");
    expect(emptyPublishPage.status).toBe(200);
    expect(await emptyPublishPage.text()).toContain("Guardá el perfil primero para habilitar la carga de fotos.");
    const emptyAccount = await request(admin, "/cuenta", "GET");
    expect(emptyAccount.status).toBe(200);
    expect(await emptyAccount.text()).toContain("Completar perfil");
  }, 120_000);

  it("covers authenticated upload, staging privacy, finalization, moderation, Storage deletion, retries, and invalid uploads", async () => {
    const anon = makeClient(anonKey);

    const anonymousReservation = await request(null, "/api/professional-images", "POST", {
      professionalId: ownerProfessionalId,
      kind: "profile",
      mimeType: "image/png",
      extension: "png",
      sizeBytes: imageBytes.length,
    });
    expect(anonymousReservation.status).toBe(401);

    const bReservation = await reserve(other, otherProfessionalId, "profile");
    await upload(other, bReservation.uploadPath);
    const anonymousUpload = await anon.storage.from(bucket).upload(bReservation.uploadPath, imageBytes, {
      contentType: "image/png",
      upsert: false,
    });
    expect(anonymousUpload.error).toBeTruthy();
    // Storage may return an empty success for an RLS-filtered DELETE; the object must remain.
    await owner.client.storage.from(bucket).remove([bReservation.uploadPath]);
    const otherReservationState = await other.client.rpc("get_professional_image_upload", { p_image_id: bReservation.id });
    expect(otherReservationState.data?.[0]).toMatchObject({ state: "uploading", upload_path: bReservation.uploadPath });
    expect((await download(other.client, bReservation.uploadPath)).error).toBeNull();
    const authorisedRetry = await request(other, "/api/professional-images", "DELETE", { id: bReservation.id });
    expect(authorisedRetry.status, await authorisedRetry.clone().text()).toBe(200);
    expect((await download(other.client, bReservation.uploadPath)).error).toBeTruthy();

    let reservation = await reserve(owner, ownerProfessionalId, "profile");
    await upload(owner, reservation.uploadPath);
    const anonymousStageRead = await download(anon, reservation.uploadPath);
    expect(anonymousStageRead.error).toBeTruthy();

    const beforeModerationList = await anon.rpc("get_public_professional_images", { p_slug: `integration-owner-${owner.id}` });
    expect(beforeModerationList.error).toBeNull();
    expect(beforeModerationList.data).toEqual([]);

    const finalize = await request(owner, "/api/professional-images/finalize", "POST", { id: reservation.id });
    expect(finalize.status, await finalize.clone().text()).toBe(201);
    expect(await finalize.json()).toMatchObject({ ok: true, cleanupPending: false });

    const ownImages = await owner.client.rpc("get_own_professional_images");
    expect(ownImages.error).toBeNull();
    const ownerImageRows = ownImages.data as OwnedImage[] | null;
    const readyImage = ownerImageRows?.find((image) => image.id === reservation.id);
    expect(readyImage).toMatchObject({ state: "ready", upload_path: null });
    expect(readyImage?.object_path).toMatch(/^professionals\//);
    let finalPath = readyImage?.object_path;
    if (!finalPath) throw new Error("Final object path was not returned for the owner.");
    createdPaths.add(finalPath);
    expect((await download(anon, finalPath)).error).toBeTruthy();
    const sanitizedDownload = await download(owner.client, finalPath);
    expect(sanitizedDownload.error).toBeNull();
    const sanitizedMetadata = await sharp(Buffer.from(await sanitizedDownload.data!.arrayBuffer())).metadata();
    expect(sanitizedMetadata.exif).toBeUndefined();
    expect((await download(anon, reservation.uploadPath)).error).toBeTruthy();

    const removedProfile = await request(owner, "/api/professional-images", "DELETE", { id: reservation.id });
    expect(removedProfile.status, await removedProfile.clone().text()).toBe(200);
    expect((await download(owner.client, finalPath)).error).toBeTruthy();
    reservation = await reserve(owner, ownerProfessionalId, "profile");
    await upload(owner, reservation.uploadPath);
    const replacedFinalize = await request(owner, "/api/professional-images/finalize", "POST", { id: reservation.id });
    expect(replacedFinalize.status, await replacedFinalize.clone().text()).toBe(201);
    const replacedRows = await owner.client.rpc("get_own_professional_images");
    const replacedImage = (replacedRows.data as OwnedImage[] | null)?.find((image) => image.id === reservation.id);
    if (!replacedImage?.object_path) throw new Error("Replacement profile image did not become ready.");
    finalPath = replacedImage.object_path;
    createdPaths.add(finalPath);

    const nonAdminGallery = await owner.client.rpc("get_admin_professional_images", {
      p_professional_ids: [ownerProfessionalId],
    });
    expect(nonAdminGallery.error?.code).toBe("42501");
    const nonAdminModeration = await owner.client.rpc("moderate_professional", {
      p_professional_id: ownerProfessionalId,
      p_action: "approve",
      p_reason: null,
      p_expected_status: "pending",
      p_expected_is_published: false,
    });
    expect(nonAdminModeration.error?.code).toBe("42501");

    const adminBeforeGrant = await admin.client.rpc("get_admin_professional_images", {
      p_professional_ids: [ownerProfessionalId],
    });
    expect(adminBeforeGrant.error?.code).toBe("42501");
    await localSql(`select private.manage_admin_role('${admin.id}'::uuid, true);`);
    const adminGallery = await admin.client.rpc("get_admin_professional_images", {
      p_professional_ids: [ownerProfessionalId],
    });
    expect(adminGallery.error).toBeNull();
    expect((adminGallery.data as AdminImage[] | null)?.some((image) => image.id === reservation.id)).toBe(true);

    const approval = await admin.client.rpc("moderate_professional", {
      p_professional_id: ownerProfessionalId,
      p_action: "approve",
      p_reason: null,
      p_expected_status: "pending",
      p_expected_is_published: false,
    });
    expect(approval.error).toBeNull();
    expect(approval.data?.[0]).toMatchObject({ status: "approved", is_published: true });
    expect((await download(anon, finalPath)).error).toBeNull();

    const hide = await admin.client.rpc("moderate_professional", {
      p_professional_id: ownerProfessionalId,
      p_action: "hide",
      p_reason: "Pausa temporal solicitada.",
      p_expected_status: "approved",
      p_expected_is_published: true,
    });
    expect(hide.error).toBeNull();
    expect((await download(anon, finalPath)).error).toBeTruthy();
    const republish = await admin.client.rpc("moderate_professional", {
      p_professional_id: ownerProfessionalId,
      p_action: "publish",
      p_reason: null,
      p_expected_status: "approved",
      p_expected_is_published: false,
    });
    expect(republish.error).toBeNull();
    expect((await download(anon, finalPath)).error).toBeNull();
    const publicProfile = await request(null, `/profesional/integration-owner-${owner.id}`, "GET");
    expect(publicProfile.status).toBe(200);
    const publicProfileHtml = await publicProfile.text();
    expect(publicProfileHtml).toContain("public-professional-avatar-image");
    expect(publicProfileHtml).toContain("Hogar y construcción");
    expect(publicProfileHtml).toContain("Tecnología");
    expect(publicProfileHtml).toContain("Concepción del Uruguay");
    expect(publicProfileHtml).toContain("https://wa.me/5493442123456");
    expect(publicProfileHtml).not.toContain("public-professional-gallery");
    for (const categorySlug of ["hogar-construccion", "tecnologia"]) {
      const search = await anon.rpc("search_public_professionals_page", {
        p_query: null, p_city: null, p_category_slug: categorySlug, p_limit: 12, p_offset: 0, p_sort: "name",
      });
      expect(search.error).toBeNull();
      expect((search.data as Array<{ id: string }> | null)?.some((row) => row.id === ownerProfessionalId)).toBe(true);
    }
    const noAvatarApproval = await admin.client.rpc("moderate_professional", {
      p_professional_id: otherProfessionalId,
      p_action: "approve",
      p_reason: null,
      p_expected_status: "pending",
      p_expected_is_published: false,
    });
    expect(noAvatarApproval.error).toBeNull();
    const noAvatarPage = await request(null, `/profesional/integration-other-${other.id}`, "GET");
    expect(noAvatarPage.status).toBe(200);
    const noAvatarHtml = await noAvatarPage.text();
    expect(noAvatarHtml).toContain("public-professional-avatar-fallback");
    expect(noAvatarHtml).not.toContain("https://wa.me/");

    const service = makeClient(serviceKey);
    const cleanupReservation = await reserve(owner, ownerProfessionalId);
    await upload(owner, cleanupReservation.uploadPath);
    const cleanupLookup = await owner.client.rpc("get_professional_image_upload", { p_image_id: cleanupReservation.id });
    const cleanupFinalPath = cleanupLookup.data?.[0]?.object_path as string | undefined;
    if (!cleanupFinalPath) throw new Error("Could not find final path for cleanup retry fixture.");
    const cleanupSanitized = await sharp(imageBytes).png().toBuffer();
    const finalUpload = await service.storage.from(bucket).upload(cleanupFinalPath, cleanupSanitized, {
      contentType: "image/png",
      cacheControl: "0",
      upsert: false,
    });
    if (finalUpload.error) throw new Error("Could not create ready-image cleanup fixture.");
    createdPaths.add(cleanupFinalPath);
    const markReady = await owner.client.rpc("mark_professional_image_uploaded", {
      p_image_id: cleanupReservation.id,
      p_mime_type: "image/png",
      p_extension: "png",
      p_size_bytes: cleanupSanitized.length,
      p_width: 4,
      p_height: 3,
    });
    expect(markReady.error).toBeNull();

    const beginCleanupDelete = await owner.client.rpc("begin_professional_image_delete_paths", { p_image_id: cleanupReservation.id });
    expect(beginCleanupDelete.error).toBeNull();
    const markPending = await owner.client.rpc("mark_professional_image_cleanup_pending", { p_image_id: cleanupReservation.id });
    expect(markPending.error).toBeNull();
    const pendingCleanupRows = await owner.client.rpc("get_own_professional_images");
    expect((pendingCleanupRows.data as OwnedImage[] | null)?.find((image) => image.id === cleanupReservation.id)).toMatchObject({
      state: "cleanup_pending",
      upload_path: cleanupReservation.uploadPath,
    });
    expect((await download(owner.client, cleanupReservation.uploadPath)).error).toBeNull();
    expect((await download(anon, cleanupReservation.uploadPath)).error).toBeTruthy();
    const retriedCleanup = await request(owner, "/api/professional-images", "DELETE", { id: cleanupReservation.id });
    expect(retriedCleanup.status).toBe(200);
    const cleanedRows = await owner.client.rpc("get_own_professional_images");
    expect((cleanedRows.data as OwnedImage[] | null)?.some((image) => image.id === cleanupReservation.id)).toBe(false);
    expect((await download(owner.client, cleanupFinalPath)).error).toBeTruthy();

    const patchReservation = await reserve(owner, ownerProfessionalId);
    await upload(owner, patchReservation.uploadPath);
    const patchLookup = await owner.client.rpc("get_professional_image_upload", { p_image_id: patchReservation.id });
    const patchFinalPath = patchLookup.data?.[0]?.object_path as string | undefined;
    if (!patchFinalPath) throw new Error("Could not find final path for staging retry fixture.");
    const patchFinalUpload = await service.storage.from(bucket).upload(patchFinalPath, cleanupSanitized, {
      contentType: "image/png",
      cacheControl: "0",
      upsert: false,
    });
    if (patchFinalUpload.error) throw new Error("Could not create staging-retry fixture.");
    createdPaths.add(patchFinalPath);
    const patchReady = await owner.client.rpc("mark_professional_image_uploaded", {
      p_image_id: patchReservation.id,
      p_mime_type: "image/png",
      p_extension: "png",
      p_size_bytes: cleanupSanitized.length,
      p_width: 4,
      p_height: 3,
    });
    expect(patchReady.error).toBeNull();
    const profileAndWork = await request(null, `/profesional/integration-owner-${owner.id}`, "GET");
    expect(profileAndWork.status).toBe(200);
    const profileAndWorkHtml = await profileAndWork.text();
    expect(profileAndWorkHtml).toContain("public-professional-avatar-image");
    expect(profileAndWorkHtml).toContain("public-professional-gallery");
    const publicImageRows = await owner.client.rpc("get_public_professional_images", { p_slug: `integration-owner-${owner.id}` });
    const publicImages = (publicImageRows.data ?? []) as Array<{ image_kind: string }>;
    expect(publicImages.filter((image) => image.image_kind === "profile")).toHaveLength(1);
    expect(publicImages.filter((image) => image.image_kind === "portfolio")).toHaveLength(1);
    const patchCleanup = await request(owner, "/api/professional-images", "PATCH", { id: patchReservation.id });
    expect(patchCleanup.status).toBe(200);
    const patchRow = await owner.client.rpc("get_professional_image_upload", { p_image_id: patchReservation.id });
    expect(patchRow.data?.[0]).toMatchObject({ state: "ready", upload_path: null });
    expect((await download(owner.client, patchReservation.uploadPath)).error).toBeTruthy();
    expect((await download(owner.client, patchFinalPath)).error).toBeNull();

    const deleteReservation = await reserve(owner, ownerProfessionalId);
    await upload(owner, deleteReservation.uploadPath);
    const deleteFinalize = await request(owner, "/api/professional-images/finalize", "POST", { id: deleteReservation.id });
    expect(deleteFinalize.status).toBe(201);
    const rowsBeforeDelete = await owner.client.rpc("get_own_professional_images");
    const deleteImage = (rowsBeforeDelete.data as OwnedImage[] | null)?.find((image) => image.id === deleteReservation.id);
    if (!deleteImage?.object_path) throw new Error("Could not find the final path for deletion fixture.");
    createdPaths.add(deleteImage.object_path);

    const deleteResult = await request(owner, "/api/professional-images", "DELETE", { id: deleteReservation.id });
    expect(deleteResult.status).toBe(200);
    const rowsAfterDelete = await owner.client.rpc("get_own_professional_images");
    expect((rowsAfterDelete.data as OwnedImage[] | null)?.some((image) => image.id === deleteReservation.id)).toBe(false);
    expect((await download(owner.client, deleteImage.object_path)).error).toBeTruthy();

    const incomplete = await reserve(owner, ownerProfessionalId);
    const incompleteDelete = await request(owner, "/api/professional-images", "DELETE", { id: incomplete.id });
    expect(incompleteDelete.status).toBe(200);
    const afterIncomplete = await owner.client.rpc("get_own_professional_images");
    expect((afterIncomplete.data as OwnedImage[] | null)?.some((image) => image.id === incomplete.id)).toBe(false);

    const invalid = await reserve(owner, ownerProfessionalId);
    const invalidBytes = Buffer.from("not an image");
    await upload(owner, invalid.uploadPath, invalidBytes);
    const invalidFinalize = await request(owner, "/api/professional-images/finalize", "POST", { id: invalid.id });
    expect(invalidFinalize.status).toBe(400);
    const afterInvalid = await owner.client.rpc("get_own_professional_images");
    expect((afterInvalid.data as OwnedImage[] | null)?.some((image) => image.id === invalid.id)).toBe(false);
    expect((await download(owner.client, invalid.uploadPath)).error).toBeTruthy();
  }, 120_000);
});
