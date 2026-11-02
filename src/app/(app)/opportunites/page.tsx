import Link from "next/link";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { Score } from "@/components/score";
import { decide } from "./actions";

const TABS = [
  { key: "nouvelle", label: "À trier" },
  { key: "en_attente", label: "En attente" },
  { key: "acceptee", label: "Acceptées" },
  { key: "refusee", label: "Refusées" },
] as const;

const VERDICT: Record<string, string> = { recommandee: "Recommandée", a_voir: "À voir", deconseillee: "Déconseillée" };
const SOURCE: Record<string, string> = { lba: "La bonne alternance", linkedin_alert: "Alerte LinkedIn" };

export default async function Opportunites({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s = "nouvelle" } = await searchParams;
  const user = (await currentUser())!;
  const db = await supabaseServer();
  const { data: items } = await db
    .from("opportunities")
    .select("id, source, company, title, location, url, score, verdict, score_reason, missing_info, status, decided_by")
    .eq("user_id", user.id)
    .eq("status", s)
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(60);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Opportunités</h1>
        <p className="mt-1 text-sm text-muted">Triées par score. Tes choix affinent les scores suivants.</p>
      </header>

      <div className="flex gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/opportunites?s=${t.key}`}
            role="tab"
            aria-selected={s === t.key}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${s === t.key ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {!items?.length ? (
        <p className="text-sm text-muted">Aucune opportunité ici pour le moment.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((o) => (
            <li key={o.id} className="panel flex gap-5 p-5">
              <Score value={o.score} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-medium">{o.title}</h2>
                  {o.verdict && <span className="text-xs text-muted">{VERDICT[o.verdict]}</span>}
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {o.company}
                  {o.location ? `, ${o.location}` : ""}
                </p>
                {o.score_reason && <p className="mt-3 max-w-prose text-sm">{o.score_reason}</p>}
                {o.missing_info?.length > 0 && (
                  <p className="mt-2 max-w-prose text-xs text-muted">Non précisé dans l’offre : {o.missing_info.join(", ")}.</p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {o.status !== "acceptee" && (
                    <form action={decide}>
                      <input type="hidden" name="id" value={o.id} />
                      <button name="decision" value="acceptee" className="btn-primary py-1.5">Accepter et postuler</button>
                    </form>
                  )}
                  {o.status === "nouvelle" && (
                    <form action={decide}>
                      <input type="hidden" name="id" value={o.id} />
                      <button name="decision" value="en_attente" className="btn">Mettre en attente</button>
                    </form>
                  )}
                  {o.status !== "refusee" && o.status !== "acceptee" && (
                    <form action={decide}>
                      <input type="hidden" name="id" value={o.id} />
                      <button name="decision" value="refusee" className="btn">Refuser</button>
                    </form>
                  )}
                  {o.status === "acceptee" && (
                    <span className="text-xs text-muted">{o.decided_by === "auto" ? "Acceptée automatiquement (score ≥ seuil)" : "Acceptée par toi"}</span>
                  )}
                  {o.url && (
                    <a href={o.url} target="_blank" rel="noreferrer" className="ml-auto text-sm text-muted underline-offset-4 hover:underline">
                      Voir l’offre sur {SOURCE[o.source]}
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
