-- 0016_wrh_rls.sql
-- Run AFTER the wrh.* tables have been loaded from pinnacleds via pg_dump.
-- Enables membership-gated SELECT on every wrh table so only authenticated
-- users with a user_organizations row for the WRH org can read. Views are
-- recreated as security_invoker = true so they pick up the same gate from
-- their underlying tables.
--
-- (Applied to the live ccm-demo DB on 2026-05-11. Idempotent.)

DO $$
DECLARE
  t text;
  wrh_tables text[] := ARRAY['constituents', 'employees', 'payroll_deductions', 'payroll_metrics', 'rawk_invoices', 'vendors'];
BEGIN
  FOREACH t IN ARRAY wrh_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='wrh' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE wrh.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_select ON wrh.%I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_select ON wrh.%I FOR SELECT TO authenticated USING (public.is_member_of_slug(''wrh''::citext))',
        t, t
      );
      EXECUTE format('GRANT SELECT ON wrh.%I TO authenticated', t);
    END IF;
  END LOOP;
END$$;

DO $$
DECLARE
  v text;
  wrh_views text[] := ARRAY['employees_vw', 'store_transactions_vw'];
BEGIN
  FOREACH v IN ARRAY wrh_views LOOP
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='wrh' AND table_name=v) THEN
      EXECUTE format('ALTER VIEW wrh.%I SET (security_invoker = true)', v);
      EXECUTE format('GRANT SELECT ON wrh.%I TO authenticated', v);
    END IF;
  END LOOP;
END$$;
