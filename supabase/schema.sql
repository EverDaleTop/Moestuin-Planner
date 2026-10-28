-- Pluktuintje — Supabase schema
-- Voer dit uit in de Supabase SQL-editor (eenmalig).
-- De server slaat complete JSON-documenten op (zelfde vorm als data/db.json),
-- zodat migreren simpel blijft. RLS staat uit voor de service-role;
-- de Express-server is de enige schrijver (met SUPABASE_SERVICE_ROLE_KEY).

create table if not exists app_users (
  id text primary key,
  data jsonb not null
);

create table if not exists app_sessions (
  token text primary key,
  data jsonb not null
);

create table if not exists app_gardens (
  id text primary key,
  data jsonb not null
);

create table if not exists app_state (
  key text primary key,
  data jsonb not null
);

-- Handige indexen (optioneel)
create index if not exists app_gardens_data_owner_idx
  on app_gardens ((data ->> 'ownerId'));
create index if not exists app_users_data_username_idx
  on app_users ((data ->> 'username'));

-- ---------------------------------------------------------------------------
-- Google login instellen (Supabase Auth):
--  1. Supabase Dashboard → Authentication → Providers → Google → Enabled
--  2. Maak in Google Cloud Console een OAuth Client ID (type Web):
--       Authorized redirect URI: https://<jouw-project>.supabase.co/auth/v1/callback
--  3. Plak Client ID + Client Secret in Supabase.
--  4. Zet in je frontend .env:
--       VITE_SUPABASE_URL=https://<jouw-project>.supabase.co
--       VITE_SUPABASE_ANON_KEY=<anon/public key>
--       VITE_GOOGLE_CLIENT_ID=<zelfde Google Client ID>  (voor directe GIS-button)
-- ---------------------------------------------------------------------------
