-- 0013_csv_import_hardening.sql
-- Follow-up to the live CSV import feature.
--
-- Fixes:
--   * source-scope imported donation external ids
--   * persist content hashes for duplicate detection when source ids are missing
--   * allow admin revert for import-created donations only

ALTER TABLE public.donations
  ADD COLUMN source_name  text,
  ADD COLUMN content_hash text;

UPDATE public.donations d
SET source_name = b.source_name
FROM public.import_batches b
WHERE d.import_batch_id = b.id
  AND d.source_name IS NULL;

DROP INDEX IF EXISTS donations_org_extid_unique;

CREATE UNIQUE INDEX donations_org_source_extid_unique
  ON public.donations(organization_id, source_name, external_id)
  WHERE source_name IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX donations_org_content_hash_unique
  ON public.donations(organization_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX donations_org_source_idx
  ON public.donations(organization_id, source_name)
  WHERE source_name IS NOT NULL;

CREATE OR REPLACE FUNCTION public.donations_immutable_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id  IS DISTINCT FROM OLD.organization_id  THEN RAISE EXCEPTION 'organization_id is immutable'; END IF;
  IF NEW.import_batch_id  IS DISTINCT FROM OLD.import_batch_id  THEN RAISE EXCEPTION 'import_batch_id is immutable'; END IF;
  IF NEW.source_name      IS DISTINCT FROM OLD.source_name      THEN RAISE EXCEPTION 'source_name is immutable'; END IF;
  IF NEW.external_id      IS DISTINCT FROM OLD.external_id      THEN RAISE EXCEPTION 'external_id is immutable'; END IF;
  IF NEW.content_hash     IS DISTINCT FROM OLD.content_hash     THEN RAISE EXCEPTION 'content_hash is immutable'; END IF;
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

DROP POLICY IF EXISTS donations_admin_delete_imported ON public.donations;
CREATE POLICY donations_admin_delete_imported ON public.donations
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND organization_id = public.current_org_id()
    AND import_batch_id IS NOT NULL
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='donations'
                 AND column_name='source_name') THEN
    RAISE EXCEPTION 'donations.source_name was not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='donations'
                 AND column_name='content_hash') THEN
    RAISE EXCEPTION 'donations.content_hash was not created';
  END IF;
END$$;
