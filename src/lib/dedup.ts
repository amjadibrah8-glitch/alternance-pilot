import { createHash } from "node:crypto";

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(?\b[hfm]\s*\/\s*[hfm](\s*\/\s*x)?\b\)?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Empreinte d'une offre : même entreprise + même intitulé = même offre,
 * quelle que soit la source (une offre vue sur LBA et dans une alerte LinkedIn
 * ne crée qu'une seule opportunité).
 */
export function fingerprint(company: string, title: string): string {
  return createHash("sha256")
    .update(`${normalize(company)}|${normalize(title)}`)
    .digest("hex")
    .slice(0, 32);
}
