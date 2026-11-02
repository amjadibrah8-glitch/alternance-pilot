import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { saveProfile, saveAutomation, uploadCv, runNow, disconnectGmail } from "./actions";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-8 md:grid-cols-[14rem_1fr]">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {help && <span className="block text-xs text-muted">{help}</span>}
    </label>
  );
}

export default async function Parametres({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const { gmail } = await searchParams;
  const user = (await currentUser())!;
  const db = await supabaseServer();
  const { data: s } = await db.from("settings").select("*").eq("user_id", user.id).single();
  const { data: conn } = await db.from("connections").select("account_email, status").eq("user_id", user.id).maybeSingle();
  if (!s) return <p className="text-sm text-muted">Paramètres introuvables : reconnecte-toi.</p>;

  return (
    <div className="max-w-4xl">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      </header>

      <Section title="Gmail" hint="Envoie tes candidatures et lit tes alertes emploi LinkedIn.">
        {gmail && (
          <p className={`mb-4 text-sm ${gmail === "ok" ? "text-accent" : "text-bad"}`}>
            {gmail === "ok" ? "Gmail connecté." : gmail}
          </p>
        )}
        {conn ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {conn.account_email}{" "}
              <span className={conn.status === "active" ? "text-accent" : "text-bad"}>
                {conn.status === "active" ? "connecté" : "à reconnecter"}
              </span>
            </p>
            <a href="/api/oauth/google/start" className="btn">Reconnecter</a>
            <form action={disconnectGmail}><button className="btn">Déconnecter</button></form>
          </div>
        ) : (
          <a href="/api/oauth/google/start" className="btn-primary">Connecter Gmail</a>
        )}
        <p className="mt-3 text-xs text-muted">
          Google affichera « Application non validée » : c’est normal pour une app personnelle. Clique sur Paramètres avancés puis Accéder à l’application.
        </p>
      </Section>

      <Section title="CV" hint="PDF de 3 Mo maximum, joint à chaque candidature.">
        <form action={uploadCv} className="flex flex-wrap items-center gap-3">
          <input type="file" name="cv" accept="application/pdf" required className="text-sm" />
          <button className="btn">Enregistrer le CV</button>
        </form>
        <p className="mt-2 text-sm text-muted">{s.cv_path ? `Actuel : ${s.cv_path.split("/").pop()}` : "Aucun CV pour l’instant."}</p>
      </Section>

      <Section title="Profil" hint="Ce que l’IA sait de toi pour scorer les offres et rédiger. Elle n’invente rien au-delà.">
        <form action={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom"><input name="first_name" defaultValue={s.first_name} className="field" /></Field>
          <Field label="Nom"><input name="last_name" defaultValue={s.last_name} className="field" /></Field>
          <Field label="Téléphone"><input name="phone" defaultValue={s.phone} className="field" /></Field>
          <Field label="Début souhaité"><input name="contract_start" defaultValue={s.contract_start} placeholder="Dès que possible" className="field" /></Field>
          <Field label="Formation"><input name="formation_description" defaultValue={s.formation_description} placeholder="École, diplôme, ville" className="field" /></Field>
          <Field label="Rythme"><input name="rythm_description" defaultValue={s.rythm_description} placeholder="3 semaines entreprise / 1 semaine école" className="field" /></Field>
          <div className="sm:col-span-2">
            <Field label="Profil" help="Colle le texte de ton CV : formation, projets, compétences, outils.">
              <textarea name="profile_summary" defaultValue={s.profile_summary} rows={10} className="field" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Ce que tu recherches" help="Postes visés, secteurs, ce que tu veux éviter.">
              <textarea name="preferences" defaultValue={s.preferences} rows={4} className="field" />
            </Field>
          </div>
          <div><button className="btn-primary">Enregistrer le profil</button></div>
        </form>
      </Section>

      <Section title="Automatisation" hint="Le mode test envoie tout à ta propre adresse. Passe en production quand tu as relu plusieurs envois.">
        <form action={saveAutomation} className="grid gap-4 sm:grid-cols-2">
          <Field label="Mode">
            <select name="mode" defaultValue={s.mode} className="field">
              <option value="test">Test (envois vers moi)</option>
              <option value="production">Production (envois réels)</option>
            </select>
          </Field>
          <Field label="Plafond d’envois par jour" help="Entre 0 et 20.">
            <input name="daily_cap" type="number" min={0} max={20} defaultValue={s.daily_cap} className="field num" />
          </Field>
          <label className="flex items-center gap-3 sm:col-span-2">
            <input type="checkbox" name="auto_send" defaultChecked={s.auto_send} className="size-4 accent-[var(--accent)]" />
            <span className="text-sm">Postuler automatiquement aux offres recommandées au-dessus du seuil</span>
          </label>
          <Field label="Seuil de score" help="50 à 100. Plus il est haut, moins il y a d’envois automatiques.">
            <input name="score_threshold" type="number" min={50} max={100} defaultValue={s.score_threshold} className="field num" />
          </Field>
          <Field label="Codes métier ROME" help="Séparés par des virgules. Vérifie-les sur La bonne alternance.">
            <input name="romes" defaultValue={s.romes.join(", ")} className="field" />
          </Field>
          <Field label="Latitude"><input name="latitude" defaultValue={s.latitude} className="field num" /></Field>
          <Field label="Longitude"><input name="longitude" defaultValue={s.longitude} className="field num" /></Field>
          <Field label="Rayon (km)"><input name="radius_km" type="number" min={5} max={100} defaultValue={s.radius_km} className="field num" /></Field>
          <div className="sm:col-span-2"><button className="btn-primary">Enregistrer l’automatisation</button></div>
        </form>
        <form action={runNow} className="mt-6">
          <button className="btn">Lancer une collecte maintenant</button>
        </form>
      </Section>
    </div>
  );
}
