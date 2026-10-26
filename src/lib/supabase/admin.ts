import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminContext =
  | { status: "unconfigured" }
  | { status: "unavailable" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "allowed"; supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>; userId: string };

/** Revalidates the session and admin roster on each protected server request. */
export async function getAdminContext(): Promise<AdminContext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "unconfigured" };
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) return { status: "unavailable" };
    if (!user) return { status: "unauthenticated" };
    const { data: isAdmin, error: roleError } = await supabase.rpc("is_current_user_admin");
    if (roleError) return { status: "unavailable" };
    if (!isAdmin) return { status: "forbidden" };
    return { status: "allowed", supabase, userId: user.id };
  } catch {
    return { status: "unavailable" };
  }
}
