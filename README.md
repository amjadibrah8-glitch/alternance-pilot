# Alternance Pilot

Assistant personnel qui trouve des offres d’alternance, les note avec l’IA, rédige
les candidatures et les envoie automatiquement selon tes règles.

## Ce que fait l’application

Chaque matin à 7 h (heure de Paris), elle collecte les nouvelles offres depuis
**La bonne alternance** (API officielle du service public, qui agrège aussi France
Travail, Hellowork, Meteojob…) et depuis **tes alertes emploi LinkedIn** reçues dans
Gmail. Chaque offre est dédoublonnée, puis l’IA lui donne un score sur 100 avec
une explication, en tenant compte de tes décisions passées.

Une offre est acceptée par toi, ou automatiquement si l’envoi auto est activé et
que le score dépasse ton seuil. L’IA rédige alors la candidature, puis le canal
est choisi ainsi :

| Situation | Canal | Ce qui se passe |
|---|---|---|
| L’offre donne une adresse e-mail | Gmail | Envoi automatique avec ton CV, depuis ta boîte |
| Offre LBA « candidature simplifiée » et habilitation LBA obtenue | API LBA | Envoi automatique via La bonne alternance |
| Aucun des deux (cas le plus fréquent) | Lien | Candidature prête : tu copies le message et tu postules via le lien |

L’application n’invente jamais de destinataire et ne fait aucun scraping.

## Limites à connaître

- **LinkedIn ne fournit aucune API aux candidats.** Les offres LinkedIn viennent
  uniquement de tes alertes e-mail, et la candidature se fait via le lien.
- **La bonne alternance n’expose pas l’e-mail des recruteurs.** L’envoi direct passe
  par la route `/job/v1/apply`, qui exige l’habilitation `applications:write`.
  La documentation officielle indique que les demandes pour un usage individuel ne
  sont pas approuvées : ce canal est donc désactivé par défaut (`LBA_APPLY_ENABLED=false`).
- **Gmail** : l’app reste « non validée » par Google. Elle doit être passée en
  production dans la console (voir plus bas) pour que la connexion n’expire pas
  au bout de 7 jours.
- Le suivi des réponses ne fonctionne que pour les candidatures envoyées par Gmail.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth,
Storage, RLS) · Inngest (tâches planifiées, file d’envoi, reprises) · Vercel AI SDK
(Claude par défaut, fournisseur interchangeable) · Zod · Gmail API en REST.

Coût : 0 € pour Vercel, Supabase et Inngest en offre gratuite. Seule l’API de l’IA
est facturée à l’usage (quelques euros par mois avec `claude-haiku-5-5`).

---

## Déploiement pas à pas

Compte environ 45 minutes la première fois. Garde un fichier texte ouvert pour noter
les clés au fur et à mesure.

### 1. Supabase

1. Sur [supabase.com](https://supabase.com), clique sur **New project**. Région : **Paris (eu-west-3)**.
2. Une fois le projet prêt, ouvre **SQL Editor**, colle le contenu de
   `supabase/migrations/0001_init.sql` et clique sur **Run**.
3. **Project Settings → API** : note `Project URL` (`NEXT_PUBLIC_SUPABASE_URL`),
   la clé `anon` (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) et la clé `service_role`
   (`SUPABASE_SERVICE_ROLE_KEY`, à ne jamais partager).
4. **Authentication → URL Configuration** : tu rempliras `Site URL` et
   `Redirect URLs` à l’étape 6, une fois l’URL Vercel connue.

### 2. Google (Gmail)

Dans la [Google Cloud Console](https://console.cloud.google.com) :

1. Crée un projet (menu en haut à gauche → **Nouveau projet**).
2. **API et services → Bibliothèque** : cherche **Gmail API** et clique sur **Activer**.
3. **Google Auth Platform → Branding** : nom de l’app, ton adresse e-mail comme
   contact et support.
4. **Audience** : type **Externe**. Ajoute ton adresse Gmail dans **Utilisateurs test**.
5. **Data Access → Add or remove scopes** : ajoute `gmail.send` et `gmail.readonly`,
   puis enregistre.
6. **Clients → Create client** : type **Application Web**. Dans **URI de redirection
   autorisés**, ajoute :
   - `http://localhost:3000/api/oauth/google/callback`
   - `https://TON-APP.vercel.app/api/oauth/google/callback` (à compléter à l’étape 6)
   Note le `Client ID` et le `Client secret` (affiché une seule fois).
7. **Audience → Publish app** : passe l’app en production. Sans cette étape,
   Google invalide la connexion tous les 7 jours. Tu n’as pas besoin de soumettre
   l’app à la vérification pour un usage personnel ; Google affichera simplement
   « Application non validée » à la connexion.

### 3. La bonne alternance

1. Crée un compte sur l’[espace développeurs](https://api.apprentissage.beta.gouv.fr/fr/compte/profil).
2. Génère une clé API et note-la (`LBA_API_KEY`).
3. Vérifie les codes métier ROME qui correspondent à ce que tu cherches : fais une
   recherche « data analyst » sur le site La bonne alternance et regarde le paramètre
   `romes=` dans l’URL. Les valeurs par défaut (`M1403, M1805`) sont à confirmer.

### 4. Clé IA

Sur [console.anthropic.com](https://console.anthropic.com), crée une clé API
(`ANTHROPIC_API_KEY`) et ajoute quelques euros de crédit.

### 5. Clé de chiffrement

Dans un terminal : `openssl rand -base64 32`. Le résultat va dans `ENCRYPTION_KEY`.
Elle chiffre tes jetons Gmail en base : si tu la perds, il suffit de reconnecter Gmail.

### 6. GitHub et Vercel

1. Crée un dépôt **privé** sur GitHub et pousse ce dossier.
2. Sur Vercel : **Add New → Project**, importe le dépôt.
3. Dans **Environment Variables**, renseigne toutes les variables de `.env.example`.
   `NEXT_PUBLIC_APP_URL` = l’URL de production Vercel (ex. `https://alternance-pilot.vercel.app`).
4. **Deploy**.
5. **Integrations → Browse Marketplace → Inngest → Install** sur ce projet.
   L’intégration ajoute `INNGEST_EVENT_KEY` et `INNGEST_SIGNING_KEY` et synchronise
   l’app. Redéploie ensuite (**Deployments → … → Redeploy**).
6. Retour sur Supabase, **Authentication → URL Configuration** :
   `Site URL` = ton URL Vercel, et ajoute `https://TON-APP.vercel.app/auth/callback`
   dans `Redirect URLs`.
7. Retour sur Google Cloud : complète l’URI de redirection de production (étape 2.6).

### 7. Premier lancement

1. Ouvre ton URL Vercel, entre ton adresse (`ALLOWED_EMAIL`) et clique sur le lien reçu.
2. **Paramètres** : connecte Gmail, dépose ton CV en PDF, remplis ton profil
   (colle le texte de ton CV) et ce que tu recherches.
3. Laisse le **mode Test** et active l’envoi auto avec un seuil de 80.
4. Clique sur **Lancer une collecte maintenant**. Suis l’exécution dans le
   tableau de bord Inngest (onglet **Runs**).

---

## Développement local

```bash
npm install
cp .env.example .env.local   # puis remplis les valeurs
npm run dev                  # http://localhost:3000
npm run inngest:dev          # tableau de bord Inngest local : http://localhost:8288
npm test                     # tests unitaires
npm run typecheck
```

## Plan de tests (phase 3)

À faire dans cet ordre, en **mode Test** :

1. **Connexion** : un lien magique demandé avec une autre adresse ne doit pas
   permettre d’entrer.
2. **Gmail** : connecter, vérifier « connecté » dans Paramètres. Puis retirer
   l’accès sur myaccount.google.com/permissions, relancer un envoi : la candidature
   doit passer en « Échoué » et le bandeau « Gmail doit être reconnecté » doit apparaître.
3. **Collecte** : « Lancer une collecte maintenant », vérifier les opportunités et
   le journal. Relancer : aucun doublon ne doit apparaître.
4. **Score** : les opportunités passent de « en analyse » à un score avec explication.
5. **Envoi** : ajouter à la main une adresse de contact sur une opportunité de test
   (SQL : `update opportunities set contact_email='toi@exemple.fr' where id=...`),
   l’accepter : l’e-mail doit arriver **dans ta boîte**, objet préfixé `[TEST → …]`,
   CV joint.
6. **Doublon** : accepter à nouveau la même opportunité : aucune seconde candidature.
7. **Plafond** : mettre le plafond à 1, accepter deux offres avec contact : la
   seconde reste « En attente » et repart le lendemain.
8. **Arrêt** : cliquer sur « Tout arrêter » : plus aucune collecte ni aucun envoi.

Ne passe en **Production** qu’après avoir relu plusieurs candidatures générées.

## Sécurité et RGPD

- Une seule adresse peut se connecter (`ALLOWED_EMAIL`), vérifiée dans le middleware,
  les pages et le retour de connexion.
- Jetons Gmail chiffrés en AES-256-GCM ; colonnes de jetons non lisibles depuis le navigateur.
- RLS sur toutes les tables ; les écritures automatiques passent par la clé service, côté serveur uniquement.
- Une candidature n’est marquée « Envoyé » qu’après confirmation du fournisseur (identifiant de message reçu).
- Contrainte unique par opportunité : impossible d’envoyer deux fois la même candidature.
- Les données de recruteurs se limitent à celles publiées dans les offres.
  Pour tout supprimer : supprime le projet Supabase.
