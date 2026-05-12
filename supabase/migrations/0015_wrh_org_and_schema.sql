-- 0015_wrh_org_and_schema.sql
-- Add White River Holdings as a tenant org and stand up an empty `wrh` schema
-- that received a one-shot data copy from the pinnacleds Supabase project.
-- Tables themselves are NOT created here — they were loaded by a pg_dump from
-- pinnacleds. RLS + policies live in 0016_wrh_rls.sql, which ran after the
-- data copy.
--
-- (This migration was applied to the live ccm-demo DB on 2026-05-11. It's
-- idempotent — re-running is a no-op.)

INSERT INTO public.organizations (slug, name)
VALUES ('wrh', 'White River Holdings')
ON CONFLICT (slug) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS wrh;

GRANT USAGE ON SCHEMA wrh TO authenticated, service_role;

-- Default privileges so any tables/views the dump creates afterwards get the
-- right grant baseline (SELECT to authenticated). RLS still gates row access.
ALTER DEFAULT PRIVILEGES IN SCHEMA wrh
  GRANT SELECT ON TABLES TO authenticated;
