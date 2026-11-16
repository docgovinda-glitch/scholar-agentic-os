-- Coursework Stage 4 mirror: which revision is a section's current text.
--
-- assignment_draft_revisions is keyed by content hash, so returning to earlier
-- text (undo, or a failed revision that restores the old draft) hits the existing
-- row and created_at keeps pointing at the newer, discarded text. Every save now
-- stamps last_current_at on the rows holding each section's current text, so
-- "latest revision" is the row with the newest last_current_at.

alter table public.assignment_draft_revisions
  add column if not exists last_current_at timestamptz not null default now();

update public.assignment_draft_revisions
  set last_current_at = created_at
  where last_current_at <> created_at;

create index if not exists assignment_draft_revisions_current_idx
  on public.assignment_draft_revisions (project_id, section_id, last_current_at desc);
