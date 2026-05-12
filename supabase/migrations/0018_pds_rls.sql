-- 0018_pds_rls.sql
-- RLS for the PDS Analysis tables. Any logged-in donation-portal user
-- (anyone with a public.users row, gated by public.is_app_user()) can read.
-- Data is non-tenant-scoped reference data: AR voter rollup + AR ZIP UBI.

DO $$
DECLARE
  t text;
  pds_tables text[] := ARRAY['ar_vr_vh_summary', 'accudata_ubi'];
BEGIN
  FOREACH t IN ARRAY pds_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='pds' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE pds.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_select ON pds.%I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_select ON pds.%I FOR SELECT TO authenticated USING (public.is_app_user())',
        t, t
      );
      EXECUTE format('GRANT SELECT ON pds.%I TO authenticated', t);
    END IF;
  END LOOP;
END$$;
