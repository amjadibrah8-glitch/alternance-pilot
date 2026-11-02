-- Alternance Pilot : schéma initial
-- Toutes les écritures automatiques passent par la clé service (Inngest).
-- Le dashboard lit avec la session de l'utilisateur, protégée par RLS.

create extension if not exists pgcrypto;

-- ── Paramètres ─────────────────────────────────────────
create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'test' check (mode in ('test', 'production')),
  auto_send boolean not null default false,
  automation_paused boolean not null default false,
  score_threshold int not null default 80 check (score_threshold between 0 and 100),
  daily_cap int not null default 5 check (daily_cap between 0 and 50),
  romes text[] not null default array['M1403','M1805'],
  latitude double precision not null default 50.6292,
  longitude double precision not null default 3.0573,
  radius_km int not null default 30,
  -- Profil utilisé par l'IA (texte du CV, compétences, ce que tu cherches)
  profile_summary text not null default '',
  preferences text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  formation_description text not null default '',
  rythm_description text not null default '',
  contract_start text not null default '',
  cv_path text,
  updated_at timestamptz not null default now()
);

-- ── Connexions OAuth (jetons chiffrés en AES-256-GCM côté serveur) ──
create table public.connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  account_email text not null,
  refresh_token_enc text not null,
  access_token_enc text,
  access_token_expires_at timestamptz,
  scopes text not null,
  status text not null default 'active' check (status in ('active', 'reconnect_required')),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- ── Opportunités ───────────────────────────────────────
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('lba', 'linkedin_alert')),
  external_id text,
  fingerprint text not null,
  company text not null,
  title text not null,
  location text,
  description text,
  url text,
  contact_email text,
  lba_recipient_id text,
  raw jsonb,
  score int check (score between 0 and 100),
  verdict text check (verdict in ('recommandee', 'a_voir', 'deconseillee')),
  score_reason text,
  missing_info text[] not null default '{}',
  status text not null default 'nouvelle'
    check (status in ('nouvelle', 'acceptee', 'refusee', 'en_attente')),
  decided_by text check (decided_by in ('user', 'auto')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index opportunities_user_status_idx on public.opportunities (user_id, status, created_at desc);

-- ── Candidatures / e-mails ─────────────────────────────
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Une seule candidature par opportunité : protection anti-doublon en base.
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  channel text not null check (channel in ('gmail', 'lba_api', 'manual_link')),
  recipient text,
  company text not null,
  subject text not null,
  body text not null,
  status text not null default 'brouillon'
    check (status in ('brouillon', 'en_file', 'envoye', 'echoue', 'reponse', 'a_postuler')),
  test_mode boolean not null default true,
  provider_message_id text,
  thread_id text,
  error text,
  attempts int not null default 0,
  sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index applications_user_created_idx on public.applications (user_id, created_at desc);

-- ── Journal ────────────────────────────────────────────
create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  kind text not null,
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_user_created_idx on public.activity_log (user_id, created_at desc);

-- ── RLS ────────────────────────────────────────────────
alter table public.settings enable row level security;
alter table public.connections enable row level security;
alter table public.opportunities enable row level security;
alter table public.applications enable row level security;
alter table public.activity_log enable row level security;

create policy "own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Les jetons ne sont jamais lisibles depuis le navigateur : seulement l'état.
create policy "own connections read" on public.connections
  for select using (auth.uid() = user_id);

create policy "own opportunities read" on public.opportunities
  for select using (auth.uid() = user_id);
create policy "own opportunities decide" on public.opportunities
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own applications read" on public.applications
  for select using (auth.uid() = user_id);

create policy "own log read" on public.activity_log
  for select using (auth.uid() = user_id);

-- Les colonnes de jetons ne sont pas exposées à l'API publique :
-- on retire le droit sur la table entière puis on ne rend que les colonnes d'état.
revoke all on public.connections from anon, authenticated;
grant select (user_id, provider, account_email, scopes, status, updated_at)
  on public.connections to authenticated;

-- ── Stockage du CV (bucket privé) ──────────────────────
insert into storage.buckets (id, name, public) values ('cv', 'cv', false)
  on conflict (id) do nothing;

create policy "own cv" on storage.objects
  for all using (bucket_id = 'cv' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cv' and (storage.foldername(name))[1] = auth.uid()::text);
