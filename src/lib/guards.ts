/**
 * Règles d'envoi. Fonctions pures, testées unitairement :
 * aucun envoi ne part sans passer par `canSend`.
 */
export type SendSettings = {
  automation_paused: boolean;
  mode: "test" | "production";
  daily_cap: number;
};

export type SendDecision =
  | { ok: true; recipient: string }
  | { ok: false; reason: string; retryable: boolean };

const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i;

export function isValidEmail(value: string | null | undefined): value is string {
  return !!value && EMAIL_RE.test(value.trim());
}

export function canSend(input: {
  settings: SendSettings;
  sentToday: number;
  recipient: string | null;
  ownEmail: string;
  alreadySent: boolean;
}): SendDecision {
  const { settings, sentToday, recipient, ownEmail, alreadySent } = input;
  if (alreadySent) return { ok: false, reason: "Déjà envoyé : doublon bloqué.", retryable: false };
  if (settings.automation_paused)
    return { ok: false, reason: "Automatisations arrêtées.", retryable: false };
  if (sentToday >= settings.daily_cap)
    return { ok: false, reason: `Plafond quotidien atteint (${settings.daily_cap}).`, retryable: true };
  if (!isValidEmail(recipient)) return { ok: false, reason: "Destinataire invalide.", retryable: false };
  // En mode test, tout part vers ta propre adresse : rien n'atteint un recruteur.
  return { ok: true, recipient: settings.mode === "test" ? ownEmail : recipient.trim() };
}

/** Règles communes aux canaux sans adresse e-mail (API LBA). */
export function canSubmit(settings: SendSettings, sentToday: number): SendDecision | { ok: true } {
  if (settings.automation_paused) return { ok: false, reason: "Automatisations arrêtées.", retryable: false };
  if (sentToday >= settings.daily_cap)
    return { ok: false, reason: `Plafond quotidien atteint (${settings.daily_cap}).`, retryable: true };
  return { ok: true };
}

/** Une opportunité scorée déclenche-t-elle la candidature automatique ? */
export function shouldAutoAccept(input: {
  autoSend: boolean;
  paused: boolean;
  threshold: number;
  score: number;
  verdict: "recommandee" | "a_voir" | "deconseillee";
}): boolean {
  return (
    input.autoSend && !input.paused && input.verdict === "recommandee" && input.score >= input.threshold
  );
}

/** Décalage (ms) entre l'heure de Paris et UTC à un instant donné. */
function parisOffsetMs(at: Date): number {
  const paris = new Date(at.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return paris.getTime() - utc.getTime();
}

/** Minuit (heure de Paris) du jour courant, en ISO UTC : sert à compter les envois du jour. */
export function startOfParisDay(now = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const utcMidnight = new Date(`${ymd}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - parisOffsetMs(utcMidnight)).toISOString();
}
