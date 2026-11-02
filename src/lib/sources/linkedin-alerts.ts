import "server-only";
import { getMessageText, listMessageIds } from "@/lib/gmail";
import { extractOffersFromAlert } from "@/lib/ai";
import type { SourcedOpportunity } from "@/lib/sources/lba";

/**
 * Source : alertes emploi LinkedIn reçues dans ta boîte Gmail.
 * Aucun accès à LinkedIn : on lit seulement des e-mails qui t'appartiennent.
 * Le format de ces e-mails change souvent, d'où une extraction par l'IA
 * plutôt qu'un parseur HTML fragile.
 */
export const LINKEDIN_ALERT_QUERY = "from:(jobalerts-noreply@linkedin.com) newer_than:2d";

export async function fetchLinkedInAlerts(token: string): Promise<SourcedOpportunity[]> {
  const ids = await listMessageIds(token, LINKEDIN_ALERT_QUERY, 10);
  const out: SourcedOpportunity[] = [];
  for (const id of ids) {
    const msg = await getMessageText(token, id);
    const offers = await extractOffersFromAlert(msg.text.slice(0, 20000));
    for (const o of offers) {
      out.push({
        source: "linkedin_alert",
        external_id: o.url ? o.url.split("?")[0] : null,
        company: o.company,
        title: o.title,
        location: o.location ?? null,
        description: null,
        url: o.url ?? null,
        contact_email: null,
        lba_recipient_id: null,
        raw: { gmail_message_id: id },
      });
    }
  }
  return out;
}
