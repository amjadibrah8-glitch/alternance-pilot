import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

/** Client service (contourne RLS). Uniquement côté serveur : workflows Inngest et OAuth. */
export function supabaseAdmin() {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function logActivity(
  userId: string,
  kind: string,
  message: string,
  level: "info" | "warn" | "error" = "info",
  meta?: Record<string, unknown>,
) {
  await supabaseAdmin().from("activity_log").insert({ user_id: userId, kind, message, level, meta });
}
