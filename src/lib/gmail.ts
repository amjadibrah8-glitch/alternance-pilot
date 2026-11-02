import "server-only";
import { env } from "@/env";
import { decrypt, encrypt } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Le jeton a été révoqué ou a expiré : il faut reconnecter Gmail (non retentable). */
export class ReconnectRequiredError extends Error {}

export function redirectUri() {
  return `${env().NEXT_PUBLIC_APP_URL}/api/oauth/google/callback`;
}

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env().GOOGLE_CLIENT_ID,
      client_secret: env().GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Échange du code Google refusé (${res.status}) : ${await res.text()}`);
  return res.json();
}

/** Adresse du compte, lue dans l'id_token (JWT signé par Google, reçu directement en HTTPS). */
export function emailFromIdToken(idToken: string): string {
  const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
  if (!payload.email) throw new Error("id_token sans adresse e-mail.");
  return payload.email as string;
}

export async function saveConnection(userId: string, t: TokenResponse, accountEmail: string) {
  if (!t.refresh_token) {
    throw new Error(
      "Google n'a pas renvoyé de refresh_token. Retire l'accès de l'app sur myaccount.google.com/permissions puis reconnecte.",
    );
  }
  const key = env().ENCRYPTION_KEY;
  const { error } = await supabaseAdmin()
    .from("connections")
    .upsert({
      user_id: userId,
      provider: "google",
      account_email: accountEmail,
      refresh_token_enc: encrypt(t.refresh_token, key),
      access_token_enc: encrypt(t.access_token, key),
      access_token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
      scopes: t.scope,
      status: "active",
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

/** Jeton d'accès valide (rafraîchi si besoin) + adresse du compte. */
export async function getAccess(userId: string): Promise<{ token: string; email: string }> {
  const db = supabaseAdmin();
  const key = env().ENCRYPTION_KEY;
  const { data: c, error } = await db
    .from("connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (error) throw error;
  if (!c) throw new ReconnectRequiredError("Gmail n'est pas connecté.");
  if (c.status !== "active") throw new ReconnectRequiredError("Gmail doit être reconnecté.");

  if (c.access_token_enc && c.access_token_expires_at && new Date(c.access_token_expires_at) > new Date()) {
    return { token: decrypt(c.access_token_enc, key), email: c.account_email };
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env().GOOGLE_CLIENT_ID,
      client_secret: env().GOOGLE_CLIENT_SECRET,
      refresh_token: decrypt(c.refresh_token_enc, key),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && body.includes("invalid_grant")) {
      await db.from("connections").update({ status: "reconnect_required" }).eq("user_id", userId).eq("provider", "google");
      throw new ReconnectRequiredError("Google a invalidé l'accès (invalid_grant) : reconnecte Gmail.");
    }
    throw new Error(`Rafraîchissement Google échoué (${res.status}) : ${body}`);
  }
  const t: TokenResponse = await res.json();
  await db
    .from("connections")
    .update({
      access_token_enc: encrypt(t.access_token, key),
      access_token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google");
  return { token: t.access_token, email: c.account_email };
}

async function gmailFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 401) throw new ReconnectRequiredError("Accès Gmail refusé (401).");
  if (!res.ok) {
    const err = new Error(`Gmail ${path} → ${res.status} : ${await res.text()}`);
    // 429 et 5xx sont temporaires : on laisse Inngest retenter.
    (err as Error & { retryable?: boolean }).retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  return res.json() as Promise<T>;
}

/** Envoi. Ne renvoie qu'une fois que Gmail a accepté le message (id fourni). */
export async function sendRaw(token: string, raw: string) {
  const r = await gmailFetch<{ id: string; threadId: string }>(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
  if (!r.id) throw new Error("Gmail n'a pas confirmé l'envoi.");
  return r;
}

export async function listMessageIds(token: string, q: string, max = 20) {
  const r = await gmailFetch<{ messages?: { id: string }[] }>(
    token,
    `/messages?${new URLSearchParams({ q, maxResults: String(max) })}`,
  );
  return (r.messages ?? []).map((m) => m.id);
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

function collectText(part: Part, out: { plain: string[]; html: string[] }) {
  const data = part.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";
  if (part.mimeType === "text/plain" && data) out.plain.push(data);
  if (part.mimeType === "text/html" && data) out.html.push(data);
  part.parts?.forEach((p) => collectText(p, out));
}

/** Texte d'un message (texte brut si présent, sinon HTML débarrassé des balises, liens conservés). */
export async function getMessageText(token: string, id: string) {
  const m = await gmailFetch<{ id: string; payload: Part; internalDate: string }>(
    token,
    `/messages/${id}?format=full`,
  );
  const out = { plain: [] as string[], html: [] as string[] };
  collectText(m.payload, out);
  const text = out.plain.length
    ? out.plain.join("\n")
    : out.html
        .join("\n")
        .replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, " [$1] ")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");
  return { id: m.id, text, receivedAt: new Date(Number(m.internalDate)).toISOString() };
}

/** Un fil contient-il un message qui ne vient pas de nous ? (détection de réponse) */
export async function threadHasReply(token: string, threadId: string, ownEmail: string) {
  const t = await gmailFetch<{ messages: { payload: { headers: { name: string; value: string }[] } }[] }>(
    token,
    `/threads/${threadId}?format=metadata&metadataHeaders=From`,
  );
  return t.messages.some((m) => {
    const from = m.payload.headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
    return !from.toLowerCase().includes(ownEmail.toLowerCase());
  });
}
