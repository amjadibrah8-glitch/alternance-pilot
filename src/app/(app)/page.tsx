import Link from "next/link";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function Dashboard() {
  const user = (await currentUser())!;
  const db = await supabaseServer();
  const count = async (table: string, f: (q: any) => any) => {
    const { count } = await f(db.from(table).select("id", { count: "exact", head: true }).eq("user_id", user.id));
    return count ?? 0;
  };

  const [sent, replies, opps, relevant, toApply, failed] = await Promise.all([
    count("applications", (q) => q.in("status", ["envoye", "reponse"]).eq("test_mode", false)),
    count("applications", (q) => q.eq("status", "reponse")),
    count("opportunities", (q) => q),
    count("opportunities", (q) => q.eq("verdict", "recommandee")),
    count("applications", (q) => q.eq("status", "a_postuler")),
    count("applications", (q) => q.eq("status", "echoue")),
  ]);
  const { data: log } = await db
    .from("activity_log")
    .select("id, level, message, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12);
  const { data: gmail } = await db.from("connections").select("status").eq("user_id", user.id).maybeSingle();

  const stats = [
    { label: "Candidatures envoyées", value: sent, href: "/envois" },
    { label: "Réponses reçues", value: replies, href: "/envois" },
    { label: "Opportunités détectées", value: opps, href: "/opportunites" },
    { label: "Jugées pertinentes", value: relevant, href: "/opportunites" },
  ];

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted">Collecte chaque matin à 7 h, suivi des réponses chaque soir.</p>
      </header>

      {(gmail?.status !== "active" || failed > 0 || toApply > 0) && (
        <div className="space-y-2">
          {gmail?.status !== "active" && (
            <Link href="/parametres" className="block rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
              {gmail ? "Gmail doit être reconnecté : les envois sont suspendus." : "Connecte Gmail pour activer les envois et la lecture des alertes LinkedIn."}
            </Link>
          )}
          {toApply > 0 && (
            <Link href="/envois?f=a_postuler" className="block rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
              {toApply} candidature(s) prête(s) à envoyer via le lien de l’offre.
            </Link>
          )}
          {failed > 0 && (
            <Link href="/envois?f=echoue" className="block rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
              {failed} envoi(s) en échec à vérifier.
            </Link>
          )}
        </div>
      )}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="bg-surface p-5 transition-colors hover:bg-bg">
            <p className="num text-3xl font-semibold">{s.value}</p>
            <p className="mt-1 text-sm text-muted">{s.label}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-sm font-medium">Dernières activités</h2>
        {log?.length ? (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {log.map((l) => (
              <li key={l.id} className="flex gap-4 px-4 py-3 text-sm">
                <time className="num w-28 shrink-0 text-muted">{fmt.format(new Date(l.created_at))}</time>
                <span className={l.level === "error" ? "text-bad" : l.level === "warn" ? "text-warn" : ""}>{l.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Rien pour l’instant. Complète ton profil dans <Link className="underline" href="/parametres">Paramètres</Link>, puis lance une première collecte.
          </p>
        )}
      </section>
    </div>
  );
}
