import "server-only";
import { z } from "zod";
import { env } from "@/env";

/**
 * Source : API La bonne alternance (service public, usage non commercial).
 * Recherche : GET {base}/job/v1/search?romes=&latitude=&longitude=&radius=
 * La réponse contient `jobs` (offres) et `recruiters` (entreprises sans offre).
 *
 * Le schéma est volontairement tolérant (champs optionnels) : une offre
 * incomplète est ignorée plutôt que de faire échouer toute la collecte.
 */
const Job = z
  .object({
    identifier: z.object({ id: z.string().nullish(), partner_label: z.string().nullish() }).passthrough(),
    offer: z
      .object({
        title: z.string(),
        description: z.string().nullish(),
        desired_skills: z.array(z.string()).nullish(),
        target_diploma: z.object({ label: z.string().nullish() }).passthrough().nullish(),
      })
      .passthrough(),
    workplace: z
      .object({
        name: z.string().nullish(),
        brand: z.string().nullish(),
        legal_name: z.string().nullish(),
        website: z.string().nullish(),
        location: z.object({ address: z.string().nullish() }).passthrough().nullish(),
      })
      .passthrough(),
    apply: z
      .object({ url: z.string().nullish(), recipient_id: z.string().nullish(), phone: z.string().nullish() })
      .passthrough()
      .nullish(),
    contract: z.object({ type: z.array(z.string()).nullish(), start: z.string().nullish() }).passthrough().nullish(),
  })
  .passthrough();

const SearchResponse = z.object({ jobs: z.array(z.unknown()).default([]) }).passthrough();

export type SourcedOpportunity = {
  source: "lba" | "linkedin_alert";
  external_id: string | null;
  company: string;
  title: string;
  location: string | null;
  description: string | null;
  url: string | null;
  contact_email: string | null;
  lba_recipient_id: string | null;
  raw: unknown;
};

export async function searchLba(params: {
  romes: string[];
  latitude: number;
  longitude: number;
  radiusKm: number;
}): Promise<{ items: SourcedOpportunity[]; skipped: number }> {
  const e = env();
  if (!e.LBA_API_KEY) throw new Error("LBA_API_KEY manquante : crée une clé sur l'espace développeurs LBA.");

  const qs = new URLSearchParams({
    romes: params.romes.join(","),
    latitude: String(params.latitude),
    longitude: String(params.longitude),
    radius: String(params.radiusKm),
  });
  const res = await fetch(`${e.LBA_API_BASE}/job/v1/search?${qs}`, {
    headers: { Authorization: `Bearer ${e.LBA_API_KEY}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const err = new Error(`LBA search → ${res.status} : ${(await res.text()).slice(0, 300)}`);
    (err as Error & { retryable?: boolean }).retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  const body = SearchResponse.parse(await res.json());

  let skipped = 0;
  const items: SourcedOpportunity[] = [];
  for (const raw of body.jobs) {
    const parsed = Job.safeParse(raw);
    if (!parsed.success) {
      skipped++;
      continue;
    }
    const j = parsed.data;
    const company = j.workplace.brand || j.workplace.name || j.workplace.legal_name;
    if (!company) {
      skipped++;
      continue;
    }
    const skills = j.offer.desired_skills?.length ? `\n\nCompétences attendues : ${j.offer.desired_skills.join(" ; ")}` : "";
    items.push({
      source: "lba",
      external_id: j.identifier.id ?? null,
      company,
      title: j.offer.title,
      location: j.workplace.location?.address ?? null,
      description: `${j.offer.description ?? ""}${skills}`.trim() || null,
      url: j.apply?.url ?? null,
      contact_email: null, // LBA n'expose pas d'adresse e-mail de recruteur.
      lba_recipient_id: j.apply?.recipient_id ?? null,
      raw,
    });
  }
  return { items, skipped };
}

/**
 * Candidature via l'API LBA (POST {base}/job/v1/apply).
 * Exige l'habilitation `applications:write` : désactivée tant que LBA_APPLY_ENABLED=false.
 * Champs confirmés par la documentation officielle : identité, CV en data URL, recipient_id.
 */
export async function applyViaLba(input: {
  recipientId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cvFilename: string;
  cvBase64: string;
  formationDescription?: string;
  rythmDescription?: string;
  contractStart?: string;
}): Promise<{ id: string | null }> {
  const e = env();
  if (!e.LBA_APPLY_ENABLED || !e.LBA_APPLY_BASE) throw new Error("Candidature LBA non activée.");
  const res = await fetch(`${e.LBA_APPLY_BASE}/job/v1/apply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${e.LBA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient_id: input.recipientId,
      applicant_first_name: input.firstName,
      applicant_last_name: input.lastName,
      applicant_email: input.email,
      applicant_phone: input.phone,
      applicant_attachment_name: input.cvFilename,
      applicant_attachment_content: `data:application/pdf;base64,${input.cvBase64}`,
      ...(input.formationDescription
        ? {
            applicant_inscription_formation: true,
            applicant_formation_description: input.formationDescription.slice(0, 200),
            applicant_rythm_description: (input.rythmDescription ?? "").slice(0, 200),
          }
        : {}),
      ...(input.contractStart ? { applicant_contract_start: [input.contractStart] } : {}),
    }),
  });
  if (!res.ok) {
    const err = new Error(`LBA apply → ${res.status} : ${(await res.text()).slice(0, 300)}`);
    (err as Error & { retryable?: boolean }).retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; _id?: string };
  return { id: body.id ?? body._id ?? null };
}
