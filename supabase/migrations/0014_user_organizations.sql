-- 0014_user_organizations.sql
-- Many-to-many between public.users and public.organizations so a single auth
-- identity can belong to multiple orgs. Backfills from the existing
-- users.organization_id (treated as "home org") and leaves that column in
-- place so current_org_id() keeps working unchanged for donation-portal.
--
-- Companion to the wrh.pinnacledatascience.com satellite app: WRH is just
-- another org row, and a user gets in if there's a user_organizations row
-- linking them to it. Also enables the upcoming Analysis report and any
-- future per-app gating.
--
-- (This migration was applied to the live ccm-demo DB on 2026-05-11 from a
-- working copy that has since been renumbered to avoid colliding with the
-- CSV-import 0012/0013 slots. It's idempotent.)

CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id         uuid NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member',
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS user_organizations_user_idx ON public.user_organizations(user_id);
CREATE INDEX IF NOT EXISTS user_organizations_org_idx  ON public.user_organizations(organization_id);

-- Backfill: every existing user gets a membership row for their home org.
INSERT INTO public.user_organizations (user_id, organization_id, role)
SELECT u.id,
       u.organization_id,
       CASE WHEN u.role = 'admin' THEN 'admin' ELSE 'member' END
FROM public.users u
WHERE u.organization_id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Membership predicate keyed by org slug — handy in RLS without hardcoding UUIDs.
CREATE OR REPLACE FUNCTION public.is_member_of_slug(target_slug citext)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    JOIN public.users u         ON u.id = uo.user_id
    JOIN public.organizations o  ON o.id = uo.organization_id
    WHERE u.auth_user_id = auth.uid()
      AND u.removed_at IS NULL
      AND o.slug = target_slug
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_member_of_slug(citext) TO authenticated;

ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_orgs_self_read ON public.user_organizations;
CREATE POLICY user_orgs_self_read ON public.user_organizations
  FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS user_orgs_admin_all ON public.user_organizations;
CREATE POLICY user_orgs_admin_all ON public.user_organizations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DO $$
DECLARE
  user_count int;
  membership_count int;
BEGIN
  SELECT count(*) INTO user_count       FROM public.users WHERE organization_id IS NOT NULL;
  SELECT count(*) INTO membership_count FROM public.user_organizations;
  IF membership_count < user_count THEN
    RAISE EXCEPTION 'user_organizations backfill missed rows: % memberships vs % users', membership_count, user_count;
  END IF;
END$$;
