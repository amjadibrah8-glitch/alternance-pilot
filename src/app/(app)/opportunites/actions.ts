"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

const Input = z.object({ id: z.string().uuid(), decision: z.enum(["acceptee", "refusee", "en_attente"]) });

export async function decide(form: FormData) {
  const user = await currentUser();
  if (!user) throw new Error("Non connecté");
  const { id, decision } = Input.parse({ id: form.get("id"), decision: form.get("decision") });

  const db = await supabaseServer(); // RLS : seulement tes propres opportunités
  const { error } = await db
    .from("opportunities")
    .update({ status: decision, decided_by: "user", decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  if (decision === "acceptee") {
    await inngest.send({ name: "application/prepare", data: { opportunityId: id } });
  }
  revalidatePath("/opportunites");
  revalidatePath("/");
}
