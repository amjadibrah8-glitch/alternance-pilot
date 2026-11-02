import "server-only";
import { generateObject, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { env } from "@/env";

/** Fournisseur interchangeable : AI_PROVIDER + AI_MODEL. */
function model(): LanguageModel {
  const e = env();
  if (e.AI_PROVIDER === "openai") return createOpenAI({ apiKey: e.OPENAI_API_KEY })(e.AI_MODEL);
  return createAnthropic({ apiKey: e.ANTHROPIC_API_KEY })(e.AI_MODEL);
}

export const ScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(["recommandee", "a_voir", "deconseillee"]),
  reason: z.string().max(400).describe("Deux phrases maximum, en français, concrètes."),
  missing_info: z.array(z.string()).max(5).describe("Infos absentes de l'offre utiles pour décider."),
});
export type Score = z.infer<typeof ScoreSchema>;

export type PastDecision = { title: string; company: string; decision: "acceptee" | "refusee" };

export async function scoreOpportunity(input: {
  profile: string;
  preferences: string;
  offer: { company: string; title: string; location: string | null; description: string | null };
  pastDecisions: PastDecision[];
}): Promise<Score> {
  const history = input.pastDecisions.length
    ? input.pastDecisions.map((d) => `- ${d.decision === "acceptee" ? "ACCEPTÉE" : "REFUSÉE"} : ${d.title} chez ${d.company}`).join("\n")
    : "(aucune décision pour l'instant)";

  const { object } = await generateObject({
    model: model(),
    schema: ScoreSchema,
    system:
      "Tu évalues des offres d'alternance pour un étudiant. Tu es exigeant et honnête : " +
      "un score élevé uniquement si le poste correspond vraiment au profil et aux préférences. " +
      "Tiens compte des décisions passées de l'étudiant pour comprendre ses goûts réels. " +
      "N'invente aucune information absente de l'offre.",
    prompt:
      `PROFIL DE L'ÉTUDIANT\n${input.profile || "(non renseigné)"}\n\n` +
      `PRÉFÉRENCES\n${input.preferences || "(non renseignées)"}\n\n` +
      `DÉCISIONS PASSÉES\n${history}\n\n` +
      `OFFRE\nEntreprise : ${input.offer.company}\nIntitulé : ${input.offer.title}\n` +
      `Lieu : ${input.offer.location ?? "non précisé"}\nDescription : ${input.offer.description ?? "non fournie"}\n\n` +
      "Donne un score sur 100, un verdict (recommandee ≥ 75, a_voir 50-74, deconseillee < 50) et la raison.",
  });
  return object;
}

export const DraftSchema = z.object({
  subject: z.string().max(120),
  body: z.string().max(2500),
});

export async function draftApplication(input: {
  profile: string;
  fullName: string;
  offer: { company: string; title: string; description: string | null };
}) {
  const { object } = await generateObject({
    model: model(),
    schema: DraftSchema,
    system:
      "Tu rédiges des candidatures d'alternance en français, sobres et naturelles, 120 à 200 mots. " +
      "Pas de formules creuses (« je me permets », « dynamique et motivé »), pas de flatterie. " +
      "Relie 2 éléments précis du profil à 2 éléments précis de l'offre. " +
      "N'invente aucune expérience, compétence ou fait sur l'entreprise. " +
      "Termine par une proposition d'échange et la signature. Le CV est joint.",
    prompt:
      `PROFIL\n${input.profile}\n\nNOM POUR LA SIGNATURE\n${input.fullName}\n\n` +
      `OFFRE\n${input.offer.title} chez ${input.offer.company}\n${input.offer.description ?? ""}`,
  });
  return object;
}

const AlertOffers = z.object({
  offers: z
    .array(
      z.object({
        title: z.string(),
        company: z.string(),
        location: z.string().nullable(),
        url: z.string().nullable(),
      }),
    )
    .max(30),
});

export async function extractOffersFromAlert(text: string) {
  const { object } = await generateObject({
    model: model(),
    schema: AlertOffers,
    system:
      "Extrais les offres d'emploi listées dans cet e-mail d'alerte LinkedIn. " +
      "Pour chaque offre : intitulé, entreprise, lieu, et le lien vers l'offre (linkedin.com/comm/jobs/view ou /jobs/view) s'il est présent. " +
      "Ignore les publicités, suggestions de profils et liens de désinscription. N'invente rien.",
    prompt: text,
  });
  return object.offers;
}
