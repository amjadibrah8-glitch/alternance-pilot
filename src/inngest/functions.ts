import { NonRetriableError } from "inngest";
import { inngest } from "@/inngest/client";
import { supabaseAdmin, logActivity } from "@/lib/supabase/admin";
import { searchLba, applyViaLba, type SourcedOpportunity } from "@/lib/sources/lba";
import { fetchLinkedInAlerts } from "@/lib/sources/linkedin-alerts";
import { getAccess, sendRaw, threadHasReply, ReconnectRequiredError } from "@/lib/gmail";
import { scoreOpportunity, draftApplication } from "@/lib/ai";
import { fingerprint } from "@/lib/dedup";
import { canSend, canSubmit, shouldAutoAccept, startOfParisDay, isValidEmail } from "@/lib/guards";
import { buildMime } from "@/lib/mime";
import { env } from "@/env";

type Settings = {
  user_id: string;
  mode: "test" | "production";
  auto_send: boolean;
  automation_paused: boolean;
  score_threshold: number;
  daily_cap: number;
  romes: string[];
  latitude: number;
  longitude: number;
  radius_km: number;
  profile_summary: string;
  preferences: string;
  first_name: string;
  last_name: string;
  phone: string;
  formation_description: string;
  rythm_description: string;
  contract_start: string;
  cv_path: string | null;
};

async function loadSettings(userId: string): Promise<Settings> {
  const { data, error } = await supabaseAdmin().from("settings").select("*").eq("user_id", userId).single();
  if (error || !data) throw new NonRetriableError(`Paramètres introuvables pour ${userId}`);
  return data as Settings;
}

async function hasGmail(userId: string) {
  const { data } = await supabaseAdmin()
    .from("connections")
    .select("status")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  return data?.status === "active";
}

// ─────────────────────────────────────────────────────────────
// 1. Collecte quotidienne (7 h, heure de Paris) ou à la demande
// ─────────────────────────────────────────────────────────────
export const collectOpportunities = inngest.createFunction(
  { id: "collect-opportunities", concurrency: 1, retries: 2 },
  [{ cron: "TZ=Europe/Paris 0 7 * * *" }, { event: "app/collect.requested" }],
  async ({ step }) => {
    const users = await step.run("list-users", async () => {
      const { data } = await supabaseAdmin().from("settings").select("user_id, automation_paused");
      return (data ?? []).filter((u) => !u.automation_paused).map((u) => u.user_id as string);
    });

    for (const userId of users) {
      const s = await step.run(`settings-${userId}`, () => loadSettings(userId));

      const lba = await step.run(`lba-${userId}`, async () => {
        try {
          return await searchLba({ romes: s.romes, latitude: s.latitude, longitude: s.longitude, radiusKm: s.radius_km });
        } catch (e) {
          await logActivity(userId, "collecte", `La bonne alternance indisponible : ${(e as Error).message}`, "warn");
          return { items: [] as SourcedOpportunity[], skipped: 0 };
        }
      });

      const linkedin = await step.run(`linkedin-${userId}`, async () => {
        if (!(await hasGmail(userId))) return [] as SourcedOpportunity[];
        try {
          const { token } = await getAccess(userId);
          return await fetchLinkedInAlerts(token);
        } catch (e) {
          await logActivity(userId, "collecte", `Alertes LinkedIn non lues : ${(e as Error).message}`, "warn");
          return [] as SourcedOpportunity[];
        }
      });

      const newIds = await step.run(`store-${userId}`, async () => {
        const rows = [...lba.items, ...linkedin].map((o) => ({
          user_id: userId,
          ...o,
          fingerprint: fingerprint(o.company, o.title),
        }));
        // Dédoublonnage par lot puis en base (contrainte unique user_id + fingerprint).
        const unique = [...new Map(rows.map((r) => [r.fingerprint, r])).values()];
        if (!unique.length) return [] as string[];
        const { data, error } = await supabaseAdmin()
          .from("opportunities")
          .upsert(unique, { onConflict: "user_id,fingerprint", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        const ids = (data ?? []).map((r) => r.id as string);
        await logActivity(
          userId,
          "collecte",
          `${ids.length} nouvelle(s) opportunité(s) sur ${unique.length} trouvée(s) (LBA ${lba.items.length}, LinkedIn ${linkedin.length}).`,
        );
        return ids;
      });

      if (newIds.length) {
        await step.sendEvent(
          `score-${userId}`,
          newIds.map((id) => ({ name: "opportunity/created" as const, data: { opportunityId: id } })),
        );
      }

      // Candidatures restées en file (plafond atteint hier, par ex.) : on les relance.
      const queued = await step.run(`queued-${userId}`, async () => {
        const { data } = await supabaseAdmin()
          .from("applications")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "en_file");
        return (data ?? []).map((r) => r.id as string);
      });
      if (queued.length) {
        await step.sendEvent(
          `requeue-${userId}`,
          queued.map((id) => ({ name: "application/send" as const, data: { applicationId: id } })),
        );
      }
    }
    return { users: users.length };
  },
);

// ─────────────────────────────────────────────────────────────
// 2. Score IA d'une opportunité (+ acceptation automatique si seuil)
// ─────────────────────────────────────────────────────────────
export const scoreOpportunityFn = inngest.createFunction(
  { id: "score-opportunity", concurrency: 3, retries: 3, idempotency: "event.data.opportunityId" },
  { event: "opportunity/created" },
  async ({ event, step }) => {
    const opp = await step.run("load", async () => {
      const { data } = await supabaseAdmin().from("opportunities").select("*").eq("id", event.data.opportunityId).single();
      if (!data) throw new NonRetriableError("Opportunité introuvable");
      return data;
    });
    const s = await step.run("settings", () => loadSettings(opp.user_id));

    const past = await step.run("past-decisions", async () => {
      const { data } = await supabaseAdmin()
        .from("opportunities")
        .select("title, company, status")
        .eq("user_id", opp.user_id)
        .eq("decided_by", "user")
        .in("status", ["acceptee", "refusee"])
        .order("decided_at", { ascending: false })
        .limit(20);
      return (data ?? []).map((d) => ({ title: d.title, company: d.company, decision: d.status as "acceptee" | "refusee" }));
    });

    const score = await step.run("ai-score", () =>
      scoreOpportunity({ profile: s.profile_summary, preferences: s.preferences, offer: opp, pastDecisions: past }),
    );

    const auto = shouldAutoAccept({
      autoSend: s.auto_send,
      paused: s.automation_paused,
      threshold: s.score_threshold,
      score: score.score,
      verdict: score.verdict,
    });

    await step.run("save", async () => {
      await supabaseAdmin()
        .from("opportunities")
        .update({
          score: score.score,
          verdict: score.verdict,
          score_reason: score.reason,
          missing_info: score.missing_info,
          ...(auto ? { status: "acceptee", decided_by: "auto", decided_at: new Date().toISOString() } : {}),
        })
        .eq("id", opp.id)
        .eq("status", "nouvelle"); // ne jamais écraser une décision déjà prise
    });

    if (auto) {
      await step.sendEvent("prepare", { name: "application/prepare", data: { opportunityId: opp.id } });
    }
    return { score: score.score, auto };
  },
);

// ─────────────────────────────────────────────────────────────
// 3. Préparation de la candidature (rédaction IA + choix du canal)
// ─────────────────────────────────────────────────────────────
export const prepareApplication = inngest.createFunction(
  { id: "prepare-application", concurrency: 2, retries: 3, idempotency: "event.data.opportunityId" },
  { event: "application/prepare" },
  async ({ event, step }) => {
    const opp = await step.run("load", async () => {
      const { data } = await supabaseAdmin().from("opportunities").select("*").eq("id", event.data.opportunityId).single();
      if (!data) throw new NonRetriableError("Opportunité introuvable");
      if (data.status !== "acceptee") throw new NonRetriableError("Opportunité non acceptée");
      return data;
    });
    const s = await step.run("settings", () => loadSettings(opp.user_id));
    if (s.automation_paused) return { skipped: "automatisations arrêtées" };

    const draft = await step.run("ai-draft", () =>
      draftApplication({
        profile: s.profile_summary,
        fullName: `${s.first_name} ${s.last_name}`.trim(),
        offer: { company: opp.company, title: opp.title, description: opp.description },
      }),
    );

    // Canal : e-mail si l'offre fournit une adresse, sinon API LBA si habilitée,
    // sinon « à postuler » avec le lien (l'app n'invente jamais de destinataire).
    const channel: "gmail" | "lba_api" | "manual_link" = isValidEmail(opp.contact_email)
      ? "gmail"
      : opp.lba_recipient_id && env().LBA_APPLY_ENABLED
        ? "lba_api"
        : "manual_link";

    const app = await step.run("insert", async () => {
      const { data, error } = await supabaseAdmin()
        .from("applications")
        .upsert(
          {
            user_id: opp.user_id,
            opportunity_id: opp.id,
            channel,
            recipient: channel === "gmail" ? opp.contact_email : channel === "lba_api" ? "La bonne alternance" : opp.url,
            company: opp.company,
            subject: draft.subject,
            body: draft.body,
            status: channel === "manual_link" ? "a_postuler" : "en_file",
            test_mode: s.mode === "test",
          },
          { onConflict: "opportunity_id", ignoreDuplicates: true },
        )
        .select("id, status")
        .maybeSingle();
      if (error) throw error;
      return data; // null si une candidature existait déjà (doublon)
    });

    if (!app) return { skipped: "doublon" };
    if (app.status === "en_file") {
      await step.sendEvent("send", { name: "application/send", data: { applicationId: app.id } });
    } else {
      await step.run("log", () =>
        logActivity(opp.user_id, "candidature", `Prête à envoyer via le lien : ${opp.title} chez ${opp.company}.`),
      );
    }
    return { channel };
  },
);

// ─────────────────────────────────────────────────────────────
// 4. Envoi (file d'attente : 1 à la fois, espacés, reprises sur erreur)
// ─────────────────────────────────────────────────────────────
export const sendApplication = inngest.createFunction(
  {
    id: "send-application",
    concurrency: { limit: 1 },
    throttle: { limit: 1, period: "2m" },
    retries: 4,
    onFailure: async ({ event, error }) => {
      const id = event.data.event.data.applicationId;
      await supabaseAdmin()
        .from("applications")
        .update({ status: "echoue", error: error.message.slice(0, 500) })
        .eq("id", id)
        .neq("status", "envoye");
    },
  },
  { event: "application/send" },
  async ({ event, step, attempt }) => {
    const app = await step.run("load", async () => {
      const { data } = await supabaseAdmin().from("applications").select("*").eq("id", event.data.applicationId).single();
      if (!data) throw new NonRetriableError("Candidature introuvable");
      return data;
    });
    if (app.status === "envoye" || app.status === "reponse") return { skipped: "déjà envoyée" };

    const s = await step.run("settings", () => loadSettings(app.user_id));
    const sentToday = await step.run("count-today", async () => {
      const { count } = await supabaseAdmin()
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", app.user_id)
        .eq("status", "envoye")
        .gte("sent_at", startOfParisDay());
      return count ?? 0;
    });

    await step.run("attempt", () =>
      supabaseAdmin().from("applications").update({ attempts: attempt + 1 }).eq("id", app.id),
    );

    // ── Canal API La bonne alternance ──
    if (app.channel === "lba_api") {
      if (s.mode === "test") {
        await step.run("lba-test", async () => {
          await supabaseAdmin()
            .from("applications")
            .update({ status: "brouillon", error: "Mode test : candidature LBA préparée mais non transmise." })
            .eq("id", app.id);
        });
        return { simulated: true };
      }
      const gate = canSubmit(s, sentToday);
      if (!gate.ok && "reason" in gate) return await step.run("hold", () => holdOrFail(app.id, app.user_id, gate));

      const result = await step.run("lba-apply", async () => {
        const { email } = await getAccess(app.user_id);
        const cv = await downloadCv(s.cv_path);
        const opp = await supabaseAdmin().from("opportunities").select("lba_recipient_id").eq("id", app.opportunity_id).single();
        return applyViaLba({
          recipientId: opp.data!.lba_recipient_id!,
          firstName: s.first_name,
          lastName: s.last_name,
          email,
          phone: s.phone,
          cvFilename: cv.filename,
          cvBase64: cv.data.toString("base64"),
          formationDescription: s.formation_description,
          rythmDescription: s.rythm_description,
          contractStart: s.contract_start,
        });
      });
      await step.run("mark-sent", () => markSent(app.id, app.user_id, result.id, null, `${app.company} (via La bonne alternance)`));
      return { sent: true };
    }

    // ── Canal Gmail ──
    const sent = await step.run("gmail-send", async () => {
      let access;
      try {
        access = await getAccess(app.user_id);
      } catch (e) {
        if (e instanceof ReconnectRequiredError) throw new NonRetriableError(e.message);
        throw e;
      }
      const gate = canSend({
        settings: s,
        sentToday,
        recipient: app.recipient,
        ownEmail: access.email,
        alreadySent: false,
      });
      if (!gate.ok) return { held: gate };

      const cv = await downloadCv(s.cv_path);
      const subject = s.mode === "test" ? `[TEST → ${app.recipient}] ${app.subject}` : app.subject;
      const raw = buildMime({
        from: `${s.first_name} ${s.last_name} <${access.email}>`,
        to: gate.recipient,
        subject,
        text: app.body,
        attachment: { filename: cv.filename, contentType: "application/pdf", data: cv.data },
      });
      try {
        const r = await sendRaw(access.token, raw);
        return { sent: r };
      } catch (e) {
        if (e instanceof ReconnectRequiredError) throw new NonRetriableError(e.message);
        throw e;
      }
    });

    if ("held" in sent) return await step.run("hold", () => holdOrFail(app.id, app.user_id, sent.held));
    await step.run("mark-sent", () => markSent(app.id, app.user_id, sent.sent.id, sent.sent.threadId, app.recipient));
    return { sent: true };
  },
);

async function holdOrFail(id: string, userId: string, gate: { reason: string; retryable: boolean }) {
  await supabaseAdmin()
    .from("applications")
    .update({ status: gate.retryable ? "en_file" : "echoue", error: gate.reason })
    .eq("id", id);
  await logActivity(userId, "envoi", `Envoi suspendu : ${gate.reason}`, gate.retryable ? "info" : "warn");
  return { held: gate.reason };
}

async function markSent(id: string, userId: string, messageId: string | null, threadId: string | null, to: string | null) {
  await supabaseAdmin()
    .from("applications")
    .update({ status: "envoye", provider_message_id: messageId, thread_id: threadId, sent_at: new Date().toISOString(), error: null })
    .eq("id", id);
  await logActivity(userId, "envoi", `Candidature envoyée à ${to ?? "destinataire"}.`);
}

async function downloadCv(path: string | null) {
  if (!path) throw new NonRetriableError("Aucun CV : dépose ton CV en PDF dans Paramètres.");
  const { data, error } = await supabaseAdmin().storage.from("cv").download(path);
  if (error || !data) throw new Error(`CV illisible : ${error?.message}`);
  return { filename: path.split("/").pop() ?? "CV.pdf", data: Buffer.from(await data.arrayBuffer()) };
}

// ─────────────────────────────────────────────────────────────
// 5. Suivi des réponses (Gmail uniquement), chaque soir
// ─────────────────────────────────────────────────────────────
export const checkReplies = inngest.createFunction(
  { id: "check-replies", concurrency: 1, retries: 1 },
  { cron: "TZ=Europe/Paris 0 19 * * *" },
  async ({ step }) => {
    const apps = await step.run("load", async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data } = await supabaseAdmin()
        .from("applications")
        .select("id, user_id, thread_id, company, test_mode")
        .eq("channel", "gmail")
        .eq("status", "envoye")
        .eq("test_mode", false)
        .not("thread_id", "is", null)
        .gte("sent_at", since);
      return data ?? [];
    });

    let replies = 0;
    for (const a of apps) {
      const replied = await step.run(`thread-${a.id}`, async () => {
        const { token, email } = await getAccess(a.user_id);
        return threadHasReply(token, a.thread_id!, email);
      });
      if (replied) {
        replies++;
        await step.run(`mark-${a.id}`, async () => {
          await supabaseAdmin().from("applications").update({ status: "reponse", replied_at: new Date().toISOString() }).eq("id", a.id);
          await logActivity(a.user_id, "reponse", `Réponse reçue de ${a.company}.`);
        });
      }
    }
    return { checked: apps.length, replies };
  },
);

export const functions = [collectOpportunities, scoreOpportunityFn, prepareApplication, sendApplication, checkReplies];
