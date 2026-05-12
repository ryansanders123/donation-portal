-- 0017_branding_extras.sql
-- More branding knobs: tagline (the NavBar subtitle, currently the
-- hardcoded "Donation Portal") and favicon_url (defaults to logo_url
-- when null). Both optional; the app falls back gracefully.
--
-- Sequenced after 0015/0016 (donor dedup) so the live DB picks this up
-- without renumbering.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tagline     text,
  ADD COLUMN IF NOT EXISTS favicon_url text;
