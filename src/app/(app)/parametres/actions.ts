"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin, logActivity } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";

async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

const Profile = z.object({
  first_name: z.string().trim().max(80),
  last_name: z.string().trim().max(80),
  phone: z.string().trim().max(30),
  profile_summary: z.string().trim().max(6000),
  preferences: z.string().trim().max(2000),
  formation_description: z.string().trim().max(200),
  rythm_description: z.string().trim().max(200),
  contract_start: z.string().trim().max(60),
});

export async function saveProfile(form: FormData) {
  const user = await requireUser();
  const data = Profile.parse(Object.fromEntries(form));
  const db = await supabaseServer();
  const { error } = await db.from("settings").update({ ...data, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) throw error;
  revalidatePath("/parametres");
}

const Automation = z.object({
  mode: z.enum(["test", "production"]),
  auto_send: z.preprocess((v) => v === "on", z.boolean()),
  score_threshold: z.coerce.number().int().min(50).max(100),
  daily_cap: z.coerce.number().int().min(0).max(20),
  romes: z
    .string()
    .transform((s) => s.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[A-N]\d{4}$/, "Code ROME invalide (ex. M1403)")).min(1).max(20)),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().int().min(5).max(100),
});

export async function saveAutomation(form: FormData) {
  const user = await requireUser();
  const data = Automation.parse(Object.fromEntries(form));
  const db = await supabaseServer();
  const { error } = await db.from("settings").update({ ...data, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) throw error;
  await logActivity(
    user.id,
    "parametres",
    `Mode ${data.mode}, envoi auto ${data.auto_send ? `activé (seuil ${data.score_threshold})` : "désactivé"}, plafond ${data.daily_cap}/jour.`,
  );
  revalidatePath("/", "layout");
}

export async function uploadCv(form: FormData) {
  const user = await requireUser();
  const file = form.get("cv");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choisis un fichier PDF.");
  if (file.type !== "application/pdf") throw new Error("Le CV doit être un PDF.");
  if (file.size > 3 * 1024 * 1024) throw new Error("PDF trop lourd (3 Mo maximum).");
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const path = `${user.id}/${safeName}`;
  const db = await supabaseServer();
  const { error } = await db.storage.from("cv").upload(path, file, { upsert: true, contentType: "application/pdf" });
  if (error) throw error;
  await db.from("settings").update({ cv_path: path }).eq("user_id", user.id);
  revalidatePath("/parametres");
}

export async function togglePause() {
  const user = await requireUser();
  const db = await supabaseServer();
  const { data } = await db.from("settings").select("automation_paused").eq("user_id", user.id).single();
  const paused = !data?.automation_paused;
  await db.from("settings").update({ automation_paused: paused }).eq("user_id", user.id);
  await logActivity(user.id, "parametres", paused ? "Automatisations arrêtées." : "Automatisations relancées.", paused ? "warn" : "info");
  revalidatePath("/", "layout");
}

export async function runNow() {
  const user = await requireUser();
  await inngest.send({ name: "app/collect.requested", data: { userId: user.id } });
  await logActivity(user.id, "collecte", "Collecte lancée manuellement.");
  revalidatePath("/");
}

export async function disconnectGmail() {
  const user = await requireUser();
  await supabaseAdmin().from("connections").delete().eq("user_id", user.id).eq("provider", "google");
  await logActivity(user.id, "connexion", "Gmail déconnecté.");
  revalidatePath("/", "layout");
}
