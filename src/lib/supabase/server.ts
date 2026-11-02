import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/env";

/** Client lié à la session de l'utilisateur (RLS appliquée). */
export async function supabaseServer() {
  const store = await cookies();
  const e = env();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Appel depuis un Server Component : le middleware rafraîchit la session.
        }
      },
    },
  });
}

/** Utilisateur connecté, ou null. Vérifie aussi l'adresse autorisée. */
export async function currentUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.email?.toLowerCase() !== env().ALLOWED_EMAIL.toLowerCase()) return null;
  return user;
}
