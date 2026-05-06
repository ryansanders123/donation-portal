-- 0011_multi_tenant_foundation.sql
-- Demo→Prod cutover companion: introduce a tenant boundary so this app can
-- host many organizations from one codebase. CCMC becomes the first row in
-- public.organizations; every existing row in users / donees / funds /
-- donations / campaigns / appeals is backfilled to CCMC's id.
--
-- Per-org branding, feature flags, the org switcher, and the new-org
-- onboarding flow are deliberately deferred. This migration is schema +
-- RLS only.
--
-- Email scope decision: public.users.email stays UNIQUE globally for now.
-- Cross-org email re-use would also need Supabase Auth changes (one
-- auth.users.id per email today). Defer until a real need surfaces.

-- 1) The tenant table itself
CREATE TABLE public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        citext NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.organizations (slug, name)
VALUES ('ccmc', 'Catholic Campus Ministry');

-- 2) Add organization_id (nullable initially) to every domain table.
--    Done BEFORE creating current_org_id() so the function body can reference
--    public.users.organization_id at create time (sql functions validate
--    their body when they're created).
ALTER TABLE public.users      ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.donees     ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.funds      ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.donations  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.campaigns  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.appeals    ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- 3) Resolver: which org is the current request acting on behalf of?
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT organization_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND removed_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;

-- 4) Backfill — only CCMC exists, so every row gets CCMC's id
WITH ccmc AS (SELECT id FROM public.organizations WHERE slug = 'ccmc')
UPDATE public.users     SET organization_id = (SELECT id FROM ccmc) WHERE organization_id IS NULL;

WITH ccmc AS (SELECT id FROM public.organizations WHERE slug = 'ccmc')
UPDATE public.donees    SET organization_id = (SELECT id FROM ccmc) WHERE organization_id IS NULL;

WITH ccmc AS (SELECT id FROM public.organizations WHERE slug = 'ccmc')
UPDATE public.funds     SET organization_id = (SELECT id FROM ccmc) WHERE organization_id IS NULL;

WITH ccmc AS (SELECT id FROM public.organizations WHERE slug = 'ccmc')
UPDATE public.donations SET organization_id = (SELECT id FROM ccmc) WHERE organization_id IS NULL;

WITH ccmc AS (SELECT id FROM public.organizations WHERE slug = 'ccmc')
UPDATE public.campaigns SET organization_id = (SELECT id FROM ccmc) WHERE organization_id IS NULL;

WITH ccmc AS (SELECT id FROM public.organizations WHERE slug = 'ccmc')
UPDATE public.appeals   SET organization_id = (SELECT id FROM ccmc) WHERE organization_id IS NULL;

-- 5) Enforce NOT NULL + auto-default for future inserts
ALTER TABLE public.users
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
ALTER TABLE public.donees
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
ALTER TABLE public.funds
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
ALTER TABLE public.donations
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
ALTER TABLE public.campaigns
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
ALTER TABLE public.appeals
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();

-- 6) Replace global UNIQUE(name) constraints with per-org composites.
--    Funds, campaigns, and appeals are scoped to an organization, so two
--    orgs can each have a "General" fund or a "Spring 2026" campaign.
ALTER TABLE public.funds      DROP CONSTRAINT funds_name_key;
ALTER TABLE public.campaigns  DROP CONSTRAINT campaigns_name_key;
ALTER TABLE public.appeals    DROP CONSTRAINT appeals_name_key;
ALTER TABLE public.funds      ADD CONSTRAINT funds_org_name_unique     UNIQUE (organization_id, name);
ALTER TABLE public.campaigns  ADD CONSTRAINT campaigns_org_name_unique UNIQUE (organization_id, name);
ALTER TABLE public.appeals    ADD CONSTRAINT appeals_org_name_unique   UNIQUE (organization_id, name);

-- 7) Hot-path indexes for org-scoped reads
CREATE INDEX donations_org_idx ON public.donations(organization_id);
CREATE INDEX donees_org_idx    ON public.donees(organization_id);

-- 8) Extend the donations immutable-fields trigger so organization_id
--    can't be moved between tenants by an UPDATE
CREATE OR REPLACE FUNCTION public.donations_immutable_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'organization_id is immutable'; END IF;
  IF NEW.donee_id        IS DISTINCT FROM OLD.donee_id        THEN RAISE EXCEPTION 'donee_id is immutable'; END IF;
  IF NEW.fund_id         IS DISTINCT FROM OLD.fund_id         THEN RAISE EXCEPTION 'fund_id is immutable'; END IF;
  IF NEW.type            IS DISTINCT FROM OLD.type            THEN RAISE EXCEPTION 'type is immutable'; END IF;
  IF NEW.amount          IS DISTINCT FROM OLD.amount          THEN RAISE EXCEPTION 'amount is immutable'; END IF;
  IF NEW.date_received   IS DISTINCT FROM OLD.date_received   THEN RAISE EXCEPTION 'date_received is immutable'; END IF;
  IF NEW.check_number    IS DISTINCT FROM OLD.check_number    THEN RAISE EXCEPTION 'check_number is immutable'; END IF;
  IF NEW.reference_id    IS DISTINCT FROM OLD.reference_id    THEN RAISE EXCEPTION 'reference_id is immutable'; END IF;
  IF NEW.note            IS DISTINCT FROM OLD.note            THEN RAISE EXCEPTION 'note is immutable'; END IF;
  IF NEW.created_by      IS DISTINCT FROM OLD.created_by      THEN RAISE EXCEPTION 'created_by is immutable'; END IF;
  IF NEW.created_at      IS DISTINCT FROM OLD.created_at      THEN RAISE EXCEPTION 'created_at is immutable'; END IF;
  RETURN NEW;
END;
$$;

-- 9) Replace every existing RLS policy with an org-scoped variant.
--    The donor_list_v view uses security_invoker = true and inherits these
--    policies through donees + donations — no separate view policy needed.

-- USERS
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS users_admin_all ON public.users;
CREATE POLICY users_admin_all ON public.users
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- DONEES
DROP POLICY IF EXISTS donees_select ON public.donees;
CREATE POLICY donees_select ON public.donees
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS donees_insert ON public.donees;
CREATE POLICY donees_insert ON public.donees
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_user() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS donees_update ON public.donees;
CREATE POLICY donees_update ON public.donees
  FOR UPDATE TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_app_user() AND organization_id = public.current_org_id());

-- FUNDS
DROP POLICY IF EXISTS funds_select ON public.funds;
CREATE POLICY funds_select ON public.funds
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS funds_admin_all ON public.funds;
CREATE POLICY funds_admin_all ON public.funds
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- DONATIONS
DROP POLICY IF EXISTS donations_select ON public.donations;
CREATE POLICY donations_select ON public.donations
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS donations_insert ON public.donations;
CREATE POLICY donations_insert ON public.donations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_user()
    AND organization_id = public.current_org_id()
    AND created_by = (public.current_app_user()).id
  );

DROP POLICY IF EXISTS donations_update ON public.donations;
CREATE POLICY donations_update ON public.donations
  FOR UPDATE TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_app_user() AND organization_id = public.current_org_id());

-- CAMPAIGNS
DROP POLICY IF EXISTS campaigns_select ON public.campaigns;
CREATE POLICY campaigns_select ON public.campaigns
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS campaigns_admin_all ON public.campaigns;
CREATE POLICY campaigns_admin_all ON public.campaigns
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- APPEALS
DROP POLICY IF EXISTS appeals_select ON public.appeals;
CREATE POLICY appeals_select ON public.appeals
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS appeals_admin_all ON public.appeals;
CREATE POLICY appeals_admin_all ON public.appeals
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- ORGANIZATIONS — every authenticated app user can read their own org,
-- and only their own org. No mutations from app code; admins manage orgs
-- via the dashboard / a future onboarding flow.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_org_id());

-- 10) Verification — fail the migration if anything is in a broken state.
DO $$
DECLARE
  null_count int;
BEGIN
  SELECT count(*) INTO null_count FROM public.users      WHERE organization_id IS NULL;
  IF null_count > 0 THEN RAISE EXCEPTION 'users has % rows without organization_id', null_count; END IF;

  SELECT count(*) INTO null_count FROM public.donees     WHERE organization_id IS NULL;
  IF null_count > 0 THEN RAISE EXCEPTION 'donees has % rows without organization_id', null_count; END IF;

  SELECT count(*) INTO null_count FROM public.funds      WHERE organization_id IS NULL;
  IF null_count > 0 THEN RAISE EXCEPTION 'funds has % rows without organization_id', null_count; END IF;

  SELECT count(*) INTO null_count FROM public.donations  WHERE organization_id IS NULL;
  IF null_count > 0 THEN RAISE EXCEPTION 'donations has % rows without organization_id', null_count; END IF;

  SELECT count(*) INTO null_count FROM public.campaigns  WHERE organization_id IS NULL;
  IF null_count > 0 THEN RAISE EXCEPTION 'campaigns has % rows without organization_id', null_count; END IF;

  SELECT count(*) INTO null_count FROM public.appeals    WHERE organization_id IS NULL;
  IF null_count > 0 THEN RAISE EXCEPTION 'appeals has % rows without organization_id', null_count; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'ccmc') THEN
    RAISE EXCEPTION 'CCMC organization not seeded';
  END IF;
END$$;
