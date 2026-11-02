"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export async function sendMagicLink(form: FormData) {
  const email = z.string().email().parse(form.get("email"));
  // Réponse identique que l'adresse soit autorisée ou non : pas d'énumération.
  if (email.toLowerCase() === process.env.ALLOWED_EMAIL?.toLowerCase()) {
    const supabase = await supabaseServer();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`, shouldCreateUser: true },
    });
  }
  redirect("/login?sent=1");
}
