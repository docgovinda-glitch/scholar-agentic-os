-- Indexes for foreign keys that had none.
--
-- These tables are read by project (`?project_id=eq.…`) and are swept when a
-- project is deleted (the foreign keys cascade). Without an index on the
-- referencing column each of those is a full scan of the table.
--
-- Additive only: creates indexes, changes no rows, columns, constraints or
-- policies. Safe to run more than once. Each statement is skipped when its
-- table is absent, so the file applies to any database the history produced.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('peer_review_critiques',          'idx_peer_review_critiques_project_id', 'project_id'),
      ('manuscript_versions',            'idx_manuscript_versions_project_id',   'project_id'),
      ('project_evidence',               'idx_project_evidence_project_id',      'project_id'),
      ('project_evidence',               'idx_project_evidence_source_id',       'source_id'),
      ('project_claim_binding_evidence', 'idx_pcbe_project_id_binding_id',       'project_id, binding_id'),
      ('opportunity_reviews',            'idx_opportunity_reviews_opportunity',  'opportunity_id')
    ) as t(table_name, index_name, columns)
  loop
    if to_regclass('public.' || spec.table_name) is not null then
      execute format('create index if not exists %I on public.%I (%s)', spec.index_name, spec.table_name, spec.columns);
    end if;
  end loop;
end $$;
