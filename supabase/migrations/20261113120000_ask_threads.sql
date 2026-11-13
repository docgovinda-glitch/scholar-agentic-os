-- AskScholar conversations that follow a person across sessions and devices.
--
-- Replaces the server's in-memory thread map (lost on every restart, shared by
-- anyone without an id). One row per (user, thread); the server writes with the
-- service role after checking the caller's id, and the owner may also read or
-- delete their own rows directly. `files` keeps the extracted text of documents
-- attached in the thread so a follow-up, or a hand-off to a workspace, never
-- asks for the same upload again.

create table if not exists public.ask_threads (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  title text not null default '' check (char_length(title) <= 200),
  citation_style text,
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint ask_threads_size check (octet_length(messages::text) <= 3000000 and octet_length(files::text) <= 1500000)
);

create index if not exists ask_threads_user_updated_idx
  on public.ask_threads (user_id, updated_at desc);

alter table public.ask_threads enable row level security;

drop policy if exists ask_threads_select_own on public.ask_threads;
create policy ask_threads_select_own
  on public.ask_threads for select
  using (auth.uid() = user_id);

drop policy if exists ask_threads_delete_own on public.ask_threads;
create policy ask_threads_delete_own
  on public.ask_threads for delete
  using (auth.uid() = user_id);

-- Inserts and updates go through the server (service role) only, so size and shape are validated there.
