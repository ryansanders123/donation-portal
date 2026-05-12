-- 0017_pds_schema_and_tables.sql
-- Stand up the `pds` schema and the two report tables for the Analysis
-- report on the donation-portal site (https://ccm.pinnacledatascience.com).
--
-- - pds.ar_vr_vh_summary: county-level rollup of pds.arkansas (voter
--   registration + voting history) aggregated by gender (joined from
--   pds.gender), age_segment bucket, party flags, and voting_recency bucket.
--   Sourced from a SELECT against the read-only `pinnacleds` Supabase
--   project; never written from donation-portal.
-- - pds.accudata_ubi: ZIP-level "underbanked" index. Copied from
--   pinnacleds 1:1 via pg_dump.
--
-- 0018_pds_rls.sql adds the RLS (any logged-in donation-portal user can read).
--
-- Idempotent: CREATE IF NOT EXISTS on schema and tables.

CREATE SCHEMA IF NOT EXISTS pds;
GRANT USAGE ON SCHEMA pds TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pds
  GRANT SELECT ON TABLES TO authenticated;

CREATE TABLE IF NOT EXISTS pds.ar_vr_vh_summary (
  county         text,
  gender         text,
  age_segment    text,
  flg_dem        text,
  flg_rep        text,
  voting_recency text,
  records        integer NOT NULL
);
CREATE INDEX IF NOT EXISTS ar_vr_vh_summary_county_idx ON pds.ar_vr_vh_summary (county);

CREATE TABLE IF NOT EXISTS pds.accudata_ubi (
  state      text NOT NULL,
  zip        text,
  ubi        integer NOT NULL,
  households integer NOT NULL
);
CREATE INDEX IF NOT EXISTS accudata_ubi_state_zip_idx ON pds.accudata_ubi (state, zip);
