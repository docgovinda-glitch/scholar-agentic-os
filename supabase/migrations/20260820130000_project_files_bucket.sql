-- Create project-files bucket if it doesn't exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  52428800, -- 50MB
  null
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove old policies if any
drop policy if exists "project_files_insert" on storage.objects;
drop policy if exists "project_files_select" on storage.objects;
drop policy if exists "project_files_delete" on storage.objects;
drop policy if exists "project_files_update" on storage.objects;

-- Note: Since we are uploading from the backend via service role key to bypass client auth limits,
-- these policies are mainly for defense in depth or if we eventually upload from client.
-- The path structure is project_id/filename. The backend will enforce project_id ownership.
create policy "project_files_insert" on storage.objects for insert
  with check (bucket_id = 'project-files');

create policy "project_files_select" on storage.objects for select
  using (bucket_id = 'project-files');

create policy "project_files_update" on storage.objects for update
  using (bucket_id = 'project-files');

create policy "project_files_delete" on storage.objects for delete
  using (bucket_id = 'project-files');
