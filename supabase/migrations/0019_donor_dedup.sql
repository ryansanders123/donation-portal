-- 0019_donor_dedup.sql
-- Donor de-duplication: similarity-scored candidate pairs, persistent
-- "not a duplicate" rejections, and a merge audit table that preserves
-- every byte of the losing record for undo.
--
-- The candidate engine is a SQL function returning (a_id, b_id, score,
-- reasons) — no materialized cache. pg_trgm (enabled in 0001) handles
-- fuzzy name matching; the trigram GIN index below keeps it fast.

-- pg_trgm-backed similarity index on lower(name)
CREATE INDEX IF NOT EXISTS donees_name_lower_trgm_idx
  ON public.donees USING gin (lower(name) gin_trgm_ops);

-- Persistent "these are not duplicates" decisions. Canonicalized:
-- always (lower_id, higher_id) so (A,B) and (B,A) hit the same row.
CREATE TABLE IF NOT EXISTS public.donee_dup_rejections (
  organization_id uuid NOT NULL DEFAULT public.current_org_id()
                       REFERENCES public.organizations(id) ON DELETE CASCADE,
  donee_a_id      uuid NOT NULL REFERENCES public.donees(id) ON DELETE CASCADE,
  donee_b_id      uuid NOT NULL REFERENCES public.donees(id) ON DELETE CASCADE,
  rejected_by     uuid REFERENCES public.users(id),
  rejected_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, donee_a_id, donee_b_id),
  CHECK (donee_a_id < donee_b_id)
);

CREATE INDEX IF NOT EXISTS donee_dup_rejections_lookup
  ON public.donee_dup_rejections(donee_a_id, donee_b_id);

ALTER TABLE public.donee_dup_rejections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS donee_dup_rejections_select ON public.donee_dup_rejections;
CREATE POLICY donee_dup_rejections_select ON public.donee_dup_rejections
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());
DROP POLICY IF EXISTS donee_dup_rejections_admin_all ON public.donee_dup_rejections;
CREATE POLICY donee_dup_rejections_admin_all ON public.donee_dup_rejections
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- Merge audit + undo. Snapshot column captures everything needed to
-- restore the losing donor and revert the winner's field changes.
-- winner_id is ON DELETE SET NULL so cascade-merges still show in
-- history (with undo disabled in the UI when winner is gone).
CREATE TABLE IF NOT EXISTS public.donee_merges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org_id()
                       REFERENCES public.organizations(id) ON DELETE CASCADE,
  winner_id       uuid REFERENCES public.donees(id) ON DELETE SET NULL,
  loser_id        uuid NOT NULL,  -- not an FK; loser is hard-deleted at merge time
  snapshot        jsonb NOT NULL,
  donations_moved int  NOT NULL DEFAULT 0,
  merged_by       uuid REFERENCES public.users(id),
  merged_at       timestamptz NOT NULL DEFAULT now(),
  undone_at       timestamptz,
  undone_by       uuid REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS donee_merges_org_recent_idx
  ON public.donee_merges(organization_id, merged_at DESC);
CREATE INDEX IF NOT EXISTS donee_merges_winner_idx
  ON public.donee_merges(winner_id) WHERE undone_at IS NULL;

ALTER TABLE public.donee_merges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS donee_merges_select ON public.donee_merges;
CREATE POLICY donee_merges_select ON public.donee_merges
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());
DROP POLICY IF EXISTS donee_merges_admin_all ON public.donee_merges;
CREATE POLICY donee_merges_admin_all ON public.donee_merges
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- The candidate engine. Returns (a_id, b_id, score, reasons) sorted by
-- score desc. Only returns pairs that haven't been rejected. Org-scoped
-- via current_org_id().
CREATE OR REPLACE FUNCTION public.donee_dup_candidates(min_score real DEFAULT 0.4)
RETURNS TABLE (a_id uuid, b_id uuid, score real, reasons text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pairs AS (
    SELECT
      a.id AS a_id,
      b.id AS b_id,
      CASE
        -- Same email, lowercased exact match.
        WHEN a.email IS NOT NULL AND b.email IS NOT NULL
             AND lower(a.email) = lower(b.email) THEN 1.00::real
        -- Same name + same zip + same street line 1.
        WHEN a.zip IS NOT NULL AND a.zip = b.zip
             AND a.address_line1 IS NOT NULL AND b.address_line1 IS NOT NULL
             AND lower(a.address_line1) = lower(b.address_line1)
             AND lower(a.name) = lower(b.name) THEN 0.90::real
        -- Similar name + same zip.
        WHEN a.zip IS NOT NULL AND a.zip = b.zip
             AND similarity(lower(a.name), lower(b.name)) > 0.7 THEN 0.80::real
        -- Similar name + same last-7-digits of phone.
        WHEN a.phone IS NOT NULL AND b.phone IS NOT NULL
             AND length(regexp_replace(a.phone, '\D', '', 'g')) >= 7
             AND length(regexp_replace(b.phone, '\D', '', 'g')) >= 7
             AND right(regexp_replace(a.phone, '\D', '', 'g'), 7)
               = right(regexp_replace(b.phone, '\D', '', 'g'), 7)
             AND similarity(lower(a.name), lower(b.name)) > 0.6 THEN 0.70::real
        -- Similar name + same email domain.
        WHEN a.email IS NOT NULL AND b.email IS NOT NULL
             AND split_part(lower(a.email), '@', 2) = split_part(lower(b.email), '@', 2)
             AND similarity(lower(a.name), lower(b.name)) > 0.5 THEN 0.55::real
        -- Very similar name alone, no other signal.
        WHEN similarity(lower(a.name), lower(b.name)) > 0.7 THEN 0.40::real
        ELSE 0::real
      END AS score,
      array_remove(ARRAY[
        CASE WHEN a.email IS NOT NULL AND b.email IS NOT NULL
             AND lower(a.email) = lower(b.email) THEN 'email exact' END,
        CASE WHEN a.zip IS NOT NULL AND a.zip = b.zip THEN 'same zip' END,
        CASE WHEN a.address_line1 IS NOT NULL AND b.address_line1 IS NOT NULL
             AND lower(a.address_line1) = lower(b.address_line1) THEN 'same address' END,
        CASE WHEN lower(a.name) = lower(b.name) THEN 'exact name' END,
        CASE WHEN lower(a.name) <> lower(b.name)
             AND similarity(lower(a.name), lower(b.name)) > 0.5 THEN 'similar name' END,
        CASE WHEN a.phone IS NOT NULL AND b.phone IS NOT NULL
             AND length(regexp_replace(a.phone, '\D', '', 'g')) >= 7
             AND length(regexp_replace(b.phone, '\D', '', 'g')) >= 7
             AND right(regexp_replace(a.phone, '\D', '', 'g'), 7)
               = right(regexp_replace(b.phone, '\D', '', 'g'), 7) THEN 'same phone' END,
        CASE WHEN a.email IS NOT NULL AND b.email IS NOT NULL
             AND lower(a.email) <> lower(b.email)
             AND split_part(lower(a.email), '@', 2)
               = split_part(lower(b.email), '@', 2) THEN 'same email domain' END
      ], NULL) AS reasons
    FROM public.donees a
    JOIN public.donees b
      ON a.id < b.id
     AND a.organization_id = b.organization_id
     AND a.organization_id = public.current_org_id()
     AND (
       (a.email IS NOT NULL AND b.email IS NOT NULL AND lower(a.email) = lower(b.email))
       OR (similarity(lower(a.name), lower(b.name)) > 0.5)
     )
  )
  SELECT p.a_id, p.b_id, p.score, p.reasons
  FROM pairs p
  WHERE p.score >= min_score
    AND NOT EXISTS (
      SELECT 1 FROM public.donee_dup_rejections r
      WHERE r.organization_id = public.current_org_id()
        AND r.donee_a_id = p.a_id
        AND r.donee_b_id = p.b_id
    )
  ORDER BY p.score DESC, p.a_id, p.b_id;
$$;

GRANT EXECUTE ON FUNCTION public.donee_dup_candidates(real) TO authenticated;

-- Add `dedup` to every org's features, default on. Existing rows get
-- merged; future inserts will need to set it explicitly (handled by
-- the createOrganization server action seeding defaults).
UPDATE public.organizations
SET features = features || jsonb_build_object('dedup', true)
WHERE NOT (features ? 'dedup');

-- Verification: function exists and returns the expected column types
-- without erroring on an empty set.
DO $$
BEGIN
  PERFORM 1 FROM public.donee_dup_candidates(0.99) LIMIT 1;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'donee_dup_candidates verification failed: %', SQLERRM;
END$$;
