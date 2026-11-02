const LABELS: Record<string, { label: string; cls: string }> = {
  brouillon: { label: "Brouillon", cls: "bg-bg text-muted" },
  en_file: { label: "En attente", cls: "bg-warn-soft text-warn" },
  envoye: { label: "Envoyé", cls: "bg-accent-soft text-accent" },
  echoue: { label: "Échoué", cls: "bg-bad-soft text-bad" },
  reponse: { label: "Réponse reçue", cls: "bg-accent text-accent-ink" },
  a_postuler: { label: "À postuler via le lien", cls: "bg-warn-soft text-warn" },
};

export function Status({ value }: { value: string }) {
  const s = LABELS[value] ?? { label: value, cls: "bg-bg text-muted" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
