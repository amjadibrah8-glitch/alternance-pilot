import Link from "next/link";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { Status } from "@/components/status";

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });
const FILTERS = [
  { key: "", label: "Toutes" },
  { key: "envoye", label: "Envoyées" },
  { key: "a_postuler", label: "À postuler" },
  { key: "en_file", label: "En attente" },
  { key: "echoue", label: "Échouées" },
  { key: "reponse", label: "Réponses" },
];

export default async function Envois({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "" } = await searchParams;
  const user = (await currentUser())!;
  const db = await supabaseServer();
  let q = db
    .from("applications")
    .select("id, company, recipient, subject, status, channel, test_mode, sent_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (f) q = q.eq("status", f);
  const { data: rows } = await q;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Candidatures</h1>
        <p className="mt-1 text-sm text-muted">Tout ce qui a été préparé ou envoyé, avec le contenu exact.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link key={x.key} href={x.key ? `/envois?f=${x.key}` : "/envois"} className={f === x.key ? "btn-primary py-1.5" : "btn"}>
            {x.label}
          </Link>
        ))}
      </div>

      {!rows?.length ? (
        <p className="text-sm text-muted">Aucune candidature dans cette vue.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Entreprise</th>
                <th className="px-4 py-3 font-medium">Objet</th>
                <th className="px-4 py-3 font-medium">Destinataire</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-bg">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/envois/${r.id}`} className="hover:underline">{r.company}</Link>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3">{r.subject}</td>
                  <td className="max-w-[14rem] truncate px-4 py-3 text-muted">
                    {r.channel === "manual_link" ? "Lien de l’offre" : r.recipient}
                    {r.test_mode && r.channel === "gmail" ? " (test)" : ""}
                  </td>
                  <td className="num whitespace-nowrap px-4 py-3 text-muted">{fmt.format(new Date(r.sent_at ?? r.created_at))}</td>
                  <td className="px-4 py-3"><Status value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
