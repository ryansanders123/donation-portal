# CSV Import

> Historical design. CSV import has since been implemented. See
> `docs/STATUS.md` and `README.md` for the current production state.

**Date:** 2026-05-11
**Status:** Approved (ready for plan)
**Owner:** Ryan Sanders

## Goal

Let any organization's admin upload a CSV of donation transactions from any
source — GiveCentral, Bloomerang's `Donations.csv`, a hand-rolled Excel
sheet, a bank export — and have the rows land cleanly in
`public.donations` with auto-created/matched donees and full traceability
back to the source file. This is task **1** in the seven-task roadmap.

The existing one-off `scripts/import-transactions.mjs` is bespoke to CCMC's
old-system format and is destructive (truncates everything first). This
feature replaces it with a non-destructive, multi-tenant, idempotent
pipeline.

## Why

Going multi-tenant means new orgs onboard without a developer-run import
script. Each org's admin needs a self-service path. Beyond CCMC, we don't
control the upstream source format, so column mapping has to be flexible.

A separate Python pipeline (`process_crm.py` operated by Steve) currently
ingests GiveCentral.csv into a `ccmc.transactions` schema. That schema is
treated as **historical test data only** going forward — the CSV upload
feature is the canonical pipeline for new transactions in `public.donations`.

## Scope

### In scope

1. **Schema** — migration `0012_csv_import.sql` adds `import_batches`,
   `import_field_mappings`, `donee_external_refs` tables and two columns
   on `donations` (`import_batch_id`, `external_id`).
2. **Core library** — `lib/import/*` for parse, auto-detect, normalize,
   dedup, apply. Reusable by UI and CLI.
3. **Admin UI** — `/admin/import` four-step wizard (Upload → Map →
   Preview → Result) and `/admin/import/history` for past batches.
4. **CLI** — `scripts/import-csv.mjs` thin wrapper for large files.
5. **Tests** — unit tests for each library module, e2e against the
   supplied `GiveCentral.csv`.

### Out of scope (deferred)

- Multi-file relational imports (full Bloomerang dump). Users export
  one tab as a single CSV.
- Fuzzy identity resolution ("Bob" ↔ "Robert", "Smith" ↔ "Smyth",
  household consolidation, post-hoc merge tool). Lives in task 4.
- Async/background jobs. The chunked Server Action approach handles
  up to ~50k rows.
- Tax-deductibility flags, fee tracking, anonymous markers from
  source CSVs. Add later if demand surfaces.
- Per-org saved-mapping sharing across tenants.

## Architecture

Three layers. The middle layer is the only place ingest logic lives.

```
UI (Next.js wizard) ─┐
                     ├─→ lib/import/*  ─→  public.donations + donees + donee_external_refs
CLI (node script) ───┘
```

The library is plain TypeScript with no Next.js or Supabase coupling
beyond the client passed to its `apply()` entry point.

### Schema — migration `0012_csv_import.sql`

```sql
-- A row per upload attempt. Survives even if import fails — useful for
-- audit + revert.
CREATE TABLE public.import_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org_id()
                       REFERENCES public.organizations(id),
  source_name     text NOT NULL,
  file_name       text NOT NULL,
  file_size       int  NOT NULL,
  file_hash       text NOT NULL,
  mapping         jsonb NOT NULL,
  status          text NOT NULL
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

-- Donations gain two columns: traceability + the source's transaction id.
ALTER TABLE public.donations
  ADD COLUMN import_batch_id uuid REFERENCES public.import_batches(id)
                                  ON DELETE SET NULL,
  ADD COLUMN external_id     text;

-- Cross-batch dedup primary key for re-imports.
CREATE UNIQUE INDEX donations_org_extid_unique
  ON public.donations(organization_id, external_id)
  WHERE external_id IS NOT NULL;

-- The immutable-fields trigger on donations must learn the two new
-- columns so they can't be moved between batches/sources after insert.
-- (Update 0006_triggers.sql's function — add external_id and
-- import_batch_id to the immutable list.)

-- Saved mappings so quarterly GiveCentral uploads don't re-map every time.
CREATE TABLE public.import_field_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org_id()
                       REFERENCES public.organizations(id),
  source_name     text NOT NULL,
  mapping         jsonb NOT NULL,
  updated_by      uuid REFERENCES public.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_name)
);

-- Per-source constituent IDs for donee matching.
CREATE TABLE public.donee_external_refs (
  donee_id        uuid NOT NULL REFERENCES public.donees(id) ON DELETE CASCADE,
  source_name     text NOT NULL,
  external_id     text NOT NULL,
  organization_id uuid NOT NULL DEFAULT public.current_org_id()
                       REFERENCES public.organizations(id),
  PRIMARY KEY (donee_id, source_name, external_id)
);
CREATE UNIQUE INDEX donee_external_refs_lookup
  ON public.donee_external_refs(organization_id, source_name, external_id);

-- Org-scoped RLS on all three new tables. Pattern mirrors 0011:
-- USING (is_app_user() AND organization_id = current_org_id());
-- Admin-only writes use is_admin() in the WITH CHECK.
```

### Components

```
lib/import/
  types.ts          # TargetField enum, Mapping type, ImportRow, NormalizedRow
  parse.ts          # PapaParse wrapper; sniffs delimiter; preserves raw values
  autoDetect.ts     # fuzzy header → field synonyms map ({amount,amt,txn_amt,
                    #   "gift amount"} → amount). Returns confidence per column.
  normalize.ts      # $200.00 → 200.00; MM/DD/YYYY → YYYY-MM-DD;
                    #   trim, casefold, strip control chars, junk-email blocklist.
  dedup.ts          # external_id lookup (primary) + content hash (fallback).
                    # Content hash = sha256(lower(donee_key) +
                    #                       date_received +
                    #                       amount_cents +
                    #                       fund_name).
  matchDonee.ts     # the four-step waterfall (see "Donee matching" below).
  apply.ts          # given normalized rows + a server-side supabase client,
                    #   upsert donees + insert donations in chunks of 500.
                    #   Idempotent on re-run (external_id unique index).
  hash.ts           # sha256 helper for both file_hash and content_hash.
  __tests__/        # Vitest unit tests for each module.

app/(app)/admin/import/
  page.tsx          # 4-step wizard host (client component, holds wizard state)
  upload-step.tsx
  map-step.tsx
  preview-step.tsx
  result-step.tsx
  actions.ts        # createBatch, validateBatch, importChunk,
                    #   finalizeBatch, revertBatch, listBatches,
                    #   loadSavedMapping, saveSavedMapping
  history/page.tsx  # past batches; status, counts, revert button

scripts/
  import-csv.mjs    # node CLI: --csv path --source name --org slug --apply
```

### Target fields the user can map to

| Target field | Required? | Notes |
|---|---|---|
| `amount` | yes | Number; strip `$` and `,`; parentheses → negative (treated as error). |
| `date_received` | yes | Many formats sniffed: `YYYY-MM-DD`, `MM/DD/YYYY`, `DD-MM-YYYY`, ISO timestamps. |
| `type` | one of column-or-constant | Default constant `online`. Column mapping looks for "check"/"cash"/anything-else heuristic. |
| `external_id` | optional but strongly nudged | Per-row source txn id. Powers re-import idempotency. |
| `check_number` | when `type=check` | Falls back to `external_id` if not separately mapped. |
| `reference_id` | when `type=online` | Falls back to `external_id` if not separately mapped. |
| `note` | optional | Free text. |
| `fund_name` / `campaign_name` / `appeal_name` | at least one | New name → auto-creates the fund/campaign/appeal (admin policy still applies). |
| `donor_name` | yes | Either a single full-name column, or `first_name` + `last_name` (auto-detector picks). `company_name` may also be mapped — wins if present, else first+last is used. |
| `donor_email` | optional | Lowercased; placeholder strings blocked. |
| `donor_phone` | optional | |
| `donor_address_line1` | optional | |
| `donor_address_line2` | optional | |
| `donor_city` / `donor_state` / `donor_zip` | optional | |
| `donor_external_id` | optional but nudged | The source's constituent/profile id. Powers waterfall step 1. |

## Data flow (UI happy path)

1. **Upload step.** Drag-drop CSV. Client parses with PapaParse, computes
   `sha256(rawBytes)`. Shows file name, row count, first 5 rows.
   `actions.createBatch(metadata)` opens a `pending` row in `import_batches`.
   If `file_hash` matches a prior batch → show "this exact file was
   uploaded on 2026-05-10 as [link]. Re-upload?" (not blocked).
2. **Map step.** Auto-detector runs on the header row, fills the mapping
   form. The user reviews; each target field gets a dropdown of CSV
   columns + "(not mapped)". Required fields are validated.
   - If a saved mapping for the chosen `source_name` exists, it's offered
     as "Use last GiveCentral mapping" — one click applies all rows.
   - User picks `type` constant or maps a column.
   - Knobs: "Also match donee by name + address" (default on),
     "Junk-email blocklist" (default `noemail@noemail.com`).
   - On Continue, mapping is persisted to `import_batches.mapping` and
     (if Save Mapping checked) to `import_field_mappings`.
3. **Preview step.** Client invokes `actions.validateBatch(allRows,
   mapping)`. Server returns:
   - `rowsTotal`, `wouldInsert`, `wouldSkipDuplicate`, `wouldSkipError`,
     `wouldCreateNewDonees`, `wouldMatchExistingDonees`, `sampleErrors[10]`.
   - No DB writes. Pure dry-run.
4. **Confirm.** Client batches `allRows` into chunks of 500 and calls
   `actions.importChunk(batchId, chunk)` sequentially with a progress bar.
   Server inserts donees + donations for that chunk; updates batch counts.
   After last chunk, `actions.finalizeBatch(batchId)` flips status to
   `applied` and stamps `applied_at`.
5. **Result step.** Show `rowsInserted` / `rowsSkipped` / `rowsDuplicate`
   counts + link to batch in history. Downloadable error report
   (CSV of the original rows with a `__error_reason` column appended).

The CLI follows the same library calls minus the wizard: `--csv`, `--source`,
`--org`, optional `--mapping-file`, optional `--apply` (otherwise dry-run).

## Donee matching — four-step waterfall

For each incoming row, in order, stop at first hit:

1. **External constituent ID.** If `donor_external_id` is mapped and
   non-empty → look up `donee_external_refs WHERE organization_id =
   current AND source_name = batch.source_name AND external_id =
   row.donor_external_id`. Hit → reuse that donee's id.
2. **Email exact.** If row has a non-blocklisted email → look up
   `donees WHERE organization_id = current AND lower(email) =
   lower(row.donor_email)`. Hit → reuse.
3. **Name + zip + address_line1.** If all three are present AND the
   "match by name + address" knob is on → look up donees with the same
   tuple (casefolded). Hit → reuse.
4. **Create new.** Insert into `donees`. If row had a
   `donor_external_id`, also insert into `donee_external_refs` so step
   1 catches them next time.

This is strict by default (single name does not match across donees).
Task 4 will add fuzzy matching, cross-batch dedup, and a merge UI.

## Dedup logic (donation level)

For each incoming row that passes parsing and donee matching:

1. If row's `external_id` is set → look up
   `donations WHERE organization_id = current AND external_id =
   row.external_id`. Hit → `rows_duplicate++`, skip.
2. Else compute `content_hash = sha256(donee_id + '|' + date_received
   + '|' + amount_cents + '|' + (fund_id || campaign_id || appeal_id))`.
   At batch start, the server precomputes content hashes for the org's
   existing donations once (~50 ms for 12 k rows). Hit → skip.
3. Else insert with `import_batch_id` and `external_id` set.

The intra-batch dedup set is also tracked, so a CSV containing the same
external_id twice only inserts once.

## Error handling

- **Row-level errors** (bad amount, unparseable date, missing required
  field) → log to `error_log[]` jsonb with `{ row_index, reason }`;
  `rows_skipped++`; do not abort the batch.
- **Connection drops mid-import** → batch stays `pending`. The user can
  resume from `/admin/import/history` — already-inserted external_ids
  are skipped on retry because of step-1 dedup.
- **Revert** → `actions.revertBatch(id)` issues
  `DELETE FROM donations WHERE import_batch_id = $1`. Donees created by
  the batch are NOT deleted (they may now have other donations). Status
  flips to `reverted`; `applied_at` retained.
- **File-hash re-upload** → soft warning only, not blocked.
- **NULL `current_org_id()`** → the column-default fallback fails RLS,
  same as everywhere else (correct — no orphan rows).

## Auto-detection synonym table (initial)

Fed to `autoDetect.ts`. Headers are case-insensitive, whitespace-folded,
punctuation-stripped before comparison.

```ts
const SYNONYMS: Record<TargetField, string[]> = {
  amount:                ["amount","amt","txn_amt","gift amount","donation amount","total"],
  date_received:         ["date","transaction date","gift date","txn_dt","date received","deposit date"],
  external_id:           ["transaction id","txn id","gift id","reference","receipt"],
  check_number:          ["check number","check #","check no"],
  reference_id:          ["reference id","ref id","payment id","stripe id"],
  fund_name:             ["fund","designation","fund name","gl code"],
  campaign_name:         ["campaign","campaign name"],
  appeal_name:           ["appeal","appeal name","event"],
  type:                  ["type","payment method","payment type","method","source"],
  note:                  ["note","memo","comments"],
  donor_name:            ["donor","donor name","full name","name","constituent"],
  donor_first_name:      ["first name","first","fname","given name"],
  donor_last_name:       ["last name","last","lname","surname","family name"],
  donor_email:           ["email","email address","e-mail"],
  donor_phone:           ["phone","telephone","mobile","cell"],
  donor_address_line1:   ["address","address1","address line 1","street"],
  donor_address_line2:   ["address2","address line 2","apt","suite"],
  donor_city:            ["city","town"],
  donor_state:           ["state","region","province"],
  donor_zip:             ["zip","zipcode","postal","postal code"],
  donor_external_id:     ["profile id","constituent id","donor id","account number","source id"],
  donor_company:         ["company","organization","company name","employer"],
};
```

The auto-detector returns a per-column confidence score (1.0 exact, 0.7
contained, 0.5 fuzzy). User can override anything.

## Testing

### Unit (Vitest)

- `parse.test.ts` — comma/tab/semicolon delimiters; quoted commas with
  embedded newlines; BOM stripping; empty cells; cell trimming.
- `autoDetect.test.ts` — three fixtures: GiveCentral headers, Bloomerang
  `Donations.csv` headers, a hand-rolled "donor,date,amount,fund" sheet.
  Assert the expected mapping for each.
- `normalize.test.ts` — amounts (`$200.00`, `200`, `1,000.00`); dates
  (`2026-04-09`, `04/09/2026`, `9 April 2026`); email lowercasing and
  blocklist; junk strings → null.
- `matchDonee.test.ts` — waterfall through each of the four steps;
  knob toggles; placeholder-email skip.
- `dedup.test.ts` — external_id duplicate; content_hash duplicate;
  intra-batch duplicate (same external_id twice in one file).
- `apply.test.ts` — chunked apply with mixed valid/invalid rows;
  revert deletes donations + retains donees.

### Integration (Playwright, dogfood)

Using `C:\Users\rsanders\Downloads\Nonprofit_extract\GiveCentral.csv`:

1. Log in as `rpsanders01@gmail.com`. Visit `/admin/import`.
2. Upload `GiveCentral.csv`. Verify preview shows 294 rows, expected
   columns auto-detected (Amount → amount, Transaction Date →
   date_received, Profile ID → donor_external_id, Event → fund_name).
3. Confirm — expect `rows_inserted=294`, `rows_duplicate=0`.
4. Re-upload the same file → `rows_inserted=0`, `rows_duplicate=294`.
5. Revert batch 1 → all 294 donations deleted; donees created by the
   batch remain in `donees`.

### Manual smoke

- Hit `/admin/import/history` — batches list with status, counts,
  revert action.
- Hit `/api/whoami` — donation count reflects the import.

## Rollout plan

Single branch `feature/csv-import`. Commits land incrementally:

1. **Schema commit** — migration `0012_csv_import.sql`. Apply against
   the pooler from a single-file inline pg client (same pattern as
   `0011`). Verify counts unchanged.
2. **Library commit** — `lib/import/*` + unit tests. `npm test` green.
3. **Server-actions commit** — `app/(app)/admin/import/actions.ts`.
4. **UI commit** — wizard pages + history page.
5. **CLI commit** — `scripts/import-csv.mjs`.
6. **E2E commit** — Playwright test dogfooding `GiveCentral.csv`.

PR opened on `donation-portal`; reviewed locally; merged; Vercel
auto-deploys.

## Open questions

None — the donee-matching tightening (waterfall + external refs table)
resolved the last concern.

## References

- `scripts/import-transactions.mjs` — original one-off importer
  (destructive, single-format). Source of column-mapping ideas for the
  CCMC old-system format.
- `C:\Users\rsanders\Downloads\Nonprofit_extract\process_crm.py` —
  Steve's Python pipeline. Source of identity-resolution patterns and
  the GiveCentral column rename map. Not part of this codebase.
- `docs/superpowers/specs/2026-05-05-cutover-rename-design.md` —
  multi-tenant foundation that this feature relies on.
- Migration `0011_multi_tenant_foundation.sql` — `current_org_id()`,
  per-org RLS, column DEFAULTs that auto-populate `organization_id`.
