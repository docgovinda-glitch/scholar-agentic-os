-- AI Access settings that follow a person across devices: the default provider
-- and the non-secret preferences (chosen models, custom addresses). Keys live in
-- user_provider_keys (encrypted); this table holds nothing secret.
--
-- Written directly by the browser (RLS: own row only) and read by the server
-- (service role) so a device that has not synced yet still uses the person's
-- chosen models. Idempotent: the table already exists wherever
-- supabase/schema_user_settings.sql was applied.

create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'gemini',
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_ai_settings enable row level security;

drop policy if exists user_ai_settings_all_own on public.user_ai_settings;
create policy user_ai_settings_all_own
  on public.user_ai_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
