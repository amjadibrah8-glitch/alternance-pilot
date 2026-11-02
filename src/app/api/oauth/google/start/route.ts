import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/supabase/server";
import { authUrl } from "@/lib/gmail";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));
  // Jeton anti-CSRF vérifié au retour de Google.
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(authUrl(state));
}
