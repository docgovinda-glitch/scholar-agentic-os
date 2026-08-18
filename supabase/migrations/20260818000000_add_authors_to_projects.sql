-- Migration: Add authors column to projects table
-- Goal: Ensure the authors column exists for all projects

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS authors jsonb not null default '[]'::jsonb;
