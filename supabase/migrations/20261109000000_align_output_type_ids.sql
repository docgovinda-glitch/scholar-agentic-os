-- Align stored output-type ids with the Atlas catalog.
--
-- The Research Proposal workspace was stored as OT-19 (catalog: Case Study) and
-- the Thesis workspace as OT-09 (catalog: Book / Monograph). The app now uses
-- the catalog ids OT-15 (Research Proposal) and OT-07 (Master's Thesis), and
-- the server also maps the old ids on read (src/app/atlas/legacyIds.ts), so
-- this migration is safe to apply before or after the deploy.
update public.projects set output_type_id = 'OT-15' where output_type_id = 'OT-19';
update public.projects set output_type_id = 'OT-07' where output_type_id = 'OT-09';
