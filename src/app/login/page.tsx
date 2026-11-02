import { sendMagicLink } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; sent?: string }> }) {
  const { e, sent } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Alternance Pilot</h1>
        <p className="mt-2 text-sm text-muted">Reçois un lien de connexion sur ton adresse.</p>
        {sent ? (
          <p className="mt-8 rounded-lg border border-line p-4 text-sm">
            Lien envoyé. Ouvre l’e-mail sur cet appareil pour te connecter.
          </p>
        ) : (
          <form action={sendMagicLink} className="mt-8 space-y-3">
            <label className="block text-sm font-medium" htmlFor="email">Adresse e-mail</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="field" />
            <button className="btn-primary w-full">Recevoir le lien</button>
          </form>
        )}
        {e === "refuse" && <p className="mt-4 text-sm text-bad">Cette adresse n’a pas accès à l’application.</p>}
        {e === "lien" && <p className="mt-4 text-sm text-bad">Lien invalide ou expiré. Demande-en un nouveau.</p>}
      </div>
    </main>
  );
}
