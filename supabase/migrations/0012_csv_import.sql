-- 0012_csv_import.sql
-- Source-agnostic CSV import pipeline. Replaces the destructive
-- scripts/import-transactions.mjs with a per-tenant, idempotent,
-- audit-friendly ingest path.
--
-- New tables:
--   import_batches        — one row per upload attempt
--   import_field_mappings — per-org saved column→field mappings, one per source name
--   donee_external_refs   — per-source constituent ids that power donee match step 1
--
-- Donations gain two columns: import_batch_id (traceability + revert)
-- and external_id (cross-batch dedup primary). The immutable-fields
-- trigger learns both so they can't be moved after insert.

-- 1) import_batches
CREATE TABLE public.import_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org_id()
                       REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_name     text NOT NULL,
  file_name       text NOT NULL,
  file_size       int  NOT NULL,
  file_hash       text NOT NULL,
  mapping         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','applied','failed','reverted')),
  rows_total      int  NOT NULL DEFAULT 0,
  rows_inserted   int  NOT NULL DEFAULT 0,
  rows_skipped    int  NOT NULL DEFAULT 0,
  rows_duplicate  int  NOT NULL DEFAULT 0,
  error_log       jsonb,
  created_by      uuid NOT NULL REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  applied_at      timestamptz
);

CREATE INDEX import_batches_org_created_idx
  ON public.import_batches(organization_id, created_at DESC);
CREATE INDEX import_batches_org_hash_idx
  ON public.import_batches(organization_id, file_hash);

-- 2) donations gain external_id + import_batch_id
ALTER TABLE public.donations
  ADD COLUMN import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  ADD COLUMN external_id     text;

-- Cross-batch dedup primary: at most one donation per (org, external_id).
CREATE UNIQUE INDEX donations_org_extid_unique
  ON public.donations(organization_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX donations_import_batch_idx
  ON public.donations(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- 3) import_field_mappings — saved per-org mapping per source name
CREATE TABLE public.import_field_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org_id()
                       REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_name     text NOT NULL,
  mapping         jsonb NOT NULL,
  updated_by      uuid REFERENCES public.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_name)
);

-- 4) donee_external_refs — donee match step 1
CREATE TABLE public.donee_external_refs (
  donee_id        uuid NOT NULL REFERENCES public.donees(id) ON DELETE CASCADE,
  source_name     text NOT NULL,
  external_id     text NOT NULL,
  organization_id uuid NOT NULL DEFAULT public.current_org_id()
                       REFERENCES public.organizations(id) ON DELETE RESTRICT,
  PRIMARY KEY (donee_id, source_name, external_id)
);

CREATE UNIQUE INDEX donee_external_refs_lookup
  ON public.donee_external_refs(organization_id, source_name, external_id);

-- 5) Extend the donations immutable-fields trigger so new columns
--    can't drift between batches/sources after insert.
CREATE OR REPLACE FUNCTION public.donations_immutable_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id  IS DISTINCT FROM OLD.organization_id  THEN RAISE EXCEPTION 'organization_id is immutable'; END IF;
  IF NEW.import_batch_id  IS DISTINCT FROM OLD.import_batch_id  THEN RAISE EXCEPTION 'import_batch_id is immutable'; END IF;
  IF NEW.external_id      IS DISTINCT FROM OLD.external_id      THEN RAISE EXCEPTION 'external_id is immutable'; END IF;
  IF NEW.donee_id         IS DISTINCT FROM OLD.donee_id         THEN RAISE EXCEPTION 'donee_id is immutable'; END IF;
  IF NEW.fund_id          IS DISTINCT FROM OLD.fund_id          THEN RAISE EXCEPTION 'fund_id is immutable'; END IF;
  IF NEW.type             IS DISTINCT FROM OLD.type             THEN RAISE EXCEPTION 'type is immutable'; END IF;
  IF NEW.amount           IS DISTINCT FROM OLD.amount           THEN RAISE EXCEPTION 'amount is immutable'; END IF;
  IF NEW.date_received    IS DISTINCT FROM OLD.date_received    THEN RAISE EXCEPTION 'date_received is immutable'; END IF;
  IF NEW.check_number     IS DISTINCT FROM OLD.check_number     THEN RAISE EXCEPTION 'check_number is immutable'; END IF;
  IF NEW.reference_id     IS DISTINCT FROM OLD.reference_id     THEN RAISE EXCEPTION 'reference_id is immutable'; END IF;
  IF NEW.note             IS DISTINCT FROM OLD.note             THEN RAISE EXCEPTION 'note is immutable'; END IF;
  IF NEW.created_by       IS DISTINCT FROM OLD.created_by       THEN RAISE EXCEPTION 'created_by is immutable'; END IF;
  IF NEW.created_at       IS DISTINCT FROM OLD.created_at       THEN RAISE EXCEPTION 'created_at is immutable'; END IF;
  RETURN NEW;
END;
$$;

-- 6) RLS on the new tables (org-scoped, mirroring the 0011 pattern).

ALTER TABLE public.import_batches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donee_external_refs   ENABLE ROW LEVEL SECURITY;

-- import_batches: app users see/modify their org's batches. Admin-only mutations.
CREATE POLICY import_batches_select ON public.import_batches
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());

CREATE POLICY import_batches_admin_all ON public.import_batches
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- import_field_mappings: same shape.
CREATE POLICY import_field_mappings_select ON public.import_field_mappings
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());

CREATE POLICY import_field_mappings_admin_all ON public.import_field_mappings
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- donee_external_refs: app users can read; only admins write.
CREATE POLICY donee_external_refs_select ON public.donee_external_refs
  FOR SELECT TO authenticated
  USING (public.is_app_user() AND organization_id = public.current_org_id());

CREATE POLICY donee_external_refs_admin_all ON public.donee_external_refs
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- 7) Verification — fail the migration if anything is off.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='donations'
                 AND column_name='external_id') THEN
    RAISE EXCEPTION 'donations.external_id was not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='donations'
                 AND column_name='import_batch_id') THEN
    RAISE EXCEPTION 'donations.import_batch_id was not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='import_batches') THEN
    RAISE EXCEPTION 'import_batches table was not created';
  END IF;
END$$;
