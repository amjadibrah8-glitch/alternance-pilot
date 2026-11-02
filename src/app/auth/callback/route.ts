import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Retour du lien magique Supabase. Crée la ligne de paramètres au premier passage. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const app = process.env.NEXT_PUBLIC_APP_URL!;
  if (!code) return NextResponse.redirect(new URL("/login?e=lien", app));

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(new URL("/login?e=lien", app));
  if (data.user.email?.toLowerCase() !== process.env.ALLOWED_EMAIL?.toLowerCase()) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?e=refuse", app));
  }
  await supabaseAdmin().from("settings").upsert({ user_id: data.user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  return NextResponse.redirect(new URL("/", app));
}
