import { z } from "zod";

const configSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
  appUrl: z.url(),
});

export type SupabaseConfig = z.infer<typeof configSchema>;

export function getSupabaseConfig(): SupabaseConfig | null {
  const parsed = configSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined),
  });
  return parsed.success ? parsed.data : null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
