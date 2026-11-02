import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { Status } from "@/components/status";
import { CopyButton } from "@/components/copy-button";

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function Envoi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  const db = await supabaseServer();
  const { data: a } = await db
    .from("applications")
    .select("*, opportunities(title, url, score)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!a) notFound();
  const opp = a.opportunities as { title: string; url: string | null; score: number | null } | null;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/envois" className="text-sm text-muted hover:text-ink">Retour aux candidatures</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{a.company}</h1>
          <p className="mt-1 text-sm text-muted">{opp?.title}{opp?.score != null ? `, score ${opp.score}` : ""}</p>
        </div>
        <Status value={a.status} />
      </header>

      <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-muted">Canal</dt>
        <dd>{a.channel === "gmail" ? "E-mail (Gmail)" : a.channel === "lba_api" ? "API La bonne alternance" : "Lien de l’offre"}</dd>
        <dt className="text-muted">Destinataire</dt>
        <dd className="break-all">{a.recipient ?? "non renseigné"}{a.test_mode && a.channel === "gmail" ? " (mode test : envoyé à ton adresse)" : ""}</dd>
        <dt className="text-muted">Date</dt>
        <dd>{a.sent_at ? fmt.format(new Date(a.sent_at)) : "pas encore envoyé"}</dd>
        {a.error && (<><dt className="text-muted">Erreur</dt><dd className="text-bad">{a.error}</dd></>)}
      </dl>

      <article className="panel p-6">
        <p className="text-sm text-muted">Objet</p>
        <p className="mt-1 font-medium">{a.subject}</p>
        <div className="mt-5 max-w-prose whitespace-pre-wrap text-[15px] leading-7">{a.body}</div>
      </article>

      {a.status === "a_postuler" && opp?.url && (
        <div className="flex flex-wrap gap-2">
          <CopyButton text={a.body} />
          <a href={opp.url} target="_blank" rel="noreferrer" className="btn-primary">Ouvrir l’offre pour postuler</a>
        </div>
      )}
    </div>
  );
}
