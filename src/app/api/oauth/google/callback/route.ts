import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/supabase/server";
import { exchangeCode, emailFromIdToken, saveConnection } from "@/lib/gmail";
import { logActivity } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const back = (msg: string) =>
    NextResponse.redirect(new URL(`/parametres?gmail=${encodeURIComponent(msg)}`, process.env.NEXT_PUBLIC_APP_URL));

  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));

  const store = await cookies();
  const expected = store.get("oauth_state")?.value;
  store.delete("oauth_state");
  const { searchParams } = req.nextUrl;
  if (searchParams.get("error")) return back(`Connexion annulée : ${searchParams.get("error")}`);
  if (!expected || searchParams.get("state") !== expected) return back("Lien de connexion expiré, recommence.");

  try {
    const tokens = await exchangeCode(searchParams.get("code") ?? "");
    const email = emailFromIdToken(tokens.id_token ?? "");
    const missing = ["gmail.send", "gmail.readonly"].filter((s) => !tokens.scope.includes(s));
    if (missing.length) return back(`Autorisations manquantes : ${missing.join(", ")}. Coche toutes les cases.`);
    await saveConnection(user.id, tokens, email);
    await logActivity(user.id, "connexion", `Gmail connecté (${email}).`);
    return back("ok");
  } catch (e) {
    return back((e as Error).message.slice(0, 200));
  }
}
