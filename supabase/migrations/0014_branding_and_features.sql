-- 0014_branding_and_features.sql
-- Per-org branding and feature flags. Moves what was global env-var
-- configuration (NEXT_PUBLIC_ORG_NAME / LOGO_URL / SUPPORT_EMAIL /
-- ADDRESS / TAX_STATEMENT) into rows on public.organizations so each
-- tenant can have its own. Adds a `features` jsonb so different orgs
-- can hide pieces of the app they don't use (campaigns, appeals,
-- tax-summary, import).
--
-- Backfills CCMC with sensible defaults (burgundy brand, all features
-- on) and WRH with everything off — WRH is a reports-only tenant that
-- shouldn't see donation features if a user lands on this app.
--
-- Adds user_organizations as the many-org membership table. The org
-- switcher updates current_org_id through switch_active_org(), which
-- validates that the user has a membership row for the target org.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url           text,
  ADD COLUMN IF NOT EXISTS primary_color      text,
  ADD COLUMN IF NOT EXISTS support_email      text,
  ADD COLUMN IF NOT EXISTS mailing_address    text,
  ADD COLUMN IF NOT EXISTS tax_statement_text text,
  ADD COLUMN IF NOT EXISTS features           jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('admin', 'member')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS user_organizations_org_idx
  ON public.user_organizations(organization_id);

INSERT INTO public.user_organizations (user_id, organization_id, role)
SELECT id,
       organization_id,
       CASE WHEN role = 'admin' THEN 'admin' ELSE 'member' END
FROM public.users
WHERE removed_at IS NULL
ON CONFLICT (user_id, organization_id) DO UPDATE
SET role = EXCLUDED.role;

ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS users_last_admin_guard_trg ON public.users;

CREATE OR REPLACE FUNCTION public.user_organizations_last_admin_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  other_admin_count int;
BEGIN
  IF OLD.role = 'admin' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT count(*) INTO other_admin_count
      FROM public.user_organizations
      WHERE organization_id = OLD.organization_id
        AND role = 'admin'
        AND user_id <> OLD.user_id;

      IF other_admin_count = 0 THEN
        RAISE EXCEPTION 'cannot remove the last admin for an organization';
      END IF;
    ELSIF NEW.role <> 'admin'
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      SELECT count(*) INTO other_admin_count
      FROM public.user_organizations
      WHERE organization_id = OLD.organization_id
        AND role = 'admin'
        AND user_id <> OLD.user_id;

      IF other_admin_count = 0 THEN
        RAISE EXCEPTION 'cannot remove the last admin for an organization';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_organizations_last_admin_guard_trg
  ON public.user_organizations;
CREATE TRIGGER user_organizations_last_admin_guard_trg
BEFORE UPDATE OR DELETE ON public.user_organizations
FOR EACH ROW EXECUTE FUNCTION public.user_organizations_last_admin_guard();

DROP POLICY IF EXISTS user_organizations_select ON public.user_organizations;
CREATE POLICY user_organizations_select ON public.user_organizations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = user_organizations.user_id
        AND u.auth_user_id = auth.uid()
        AND u.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS user_organizations_admin_all ON public.user_organizations;
CREATE POLICY user_organizations_admin_all ON public.user_organizations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.switch_active_org(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  app_user public.users;
  membership record;
BEGIN
  SELECT *
  INTO app_user
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND removed_at IS NULL
  LIMIT 1;

  IF app_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT uo.organization_id, uo.role
  INTO membership
  FROM public.user_organizations uo
  JOIN public.organizations o ON o.id = uo.organization_id
  WHERE uo.user_id = app_user.id
    AND o.slug = p_slug
  LIMIT 1;

  IF membership.organization_id IS NULL THEN
    RAISE EXCEPTION 'Not a member of %', p_slug;
  END IF;

  UPDATE public.users
  SET organization_id = membership.organization_id,
      role = CASE WHEN membership.role = 'admin' THEN 'admin' ELSE 'user' END
  WHERE id = app_user.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_active_org(text) TO authenticated;

-- Allow members of an org to read its branding so the layout can render
-- it (previous select policy was scoped to current_org_id only, which is
-- right for the active org but doesn't help the org switcher render
-- *other* orgs' names + logos). Widen to: any user_organizations
-- membership grants read.
DROP POLICY IF EXISTS organizations_select ON public.organizations;
CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR
    EXISTS (
      SELECT 1
      FROM public.user_organizations uo
      JOIN public.users u ON u.id = uo.user_id
      WHERE u.auth_user_id = auth.uid()
        AND u.removed_at IS NULL
        AND uo.organization_id = organizations.id
    )
  );

-- Seed CCMC: burgundy brand from the cutover spec; every feature on.
UPDATE public.organizations
SET logo_url       = COALESCE(logo_url, '/logo.png'),
    primary_color  = COALESCE(primary_color, '#751411'),
    features       = features
                     || jsonb_build_object(
                          'campaigns',   true,
                          'appeals',     true,
                          'tax_summary', true,
                          'import',      true,
                          'exports',     true,
                          'donations',   true,
                          'donors',      true,
                          'reports',     true,
                          'analysis',    true,
                          'funds',       true
                        )
WHERE slug = 'ccmc';

-- Seed WRH: reports-only org, no donation features. Branding left blank
-- (WRH portal has its own UI).
UPDATE public.organizations
SET features = features
               || jsonb_build_object(
                    'campaigns',   false,
                    'appeals',     false,
                    'tax_summary', false,
                    'import',      false,
                    'exports',     false,
                    'donations',   false,
                    'donors',      false,
                    'reports',     true,
                    'analysis',    true,
                    'funds',       false
                  )
WHERE slug = 'wrh';

-- Verification: every org has a features object (NOT NULL default
-- ensures this); CCMC has its brand color set.
DO $$
DECLARE
  feat_count int;
BEGIN
  SELECT count(*) INTO feat_count FROM public.organizations WHERE features IS NULL;
  IF feat_count > 0 THEN RAISE EXCEPTION 'organizations has % rows with NULL features', feat_count; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE slug = 'ccmc' AND primary_color IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'CCMC brand not seeded';
  END IF;
END$$;
