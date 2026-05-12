// Shared types for the CSV import pipeline.

export type TargetField =
  | "amount"
  | "date_received"
  | "type"
  | "external_id"
  | "check_number"
  | "reference_id"
  | "fund_name"
  | "campaign_name"
  | "appeal_name"
  | "note"
  | "donor_name"
  | "donor_first_name"
  | "donor_last_name"
  | "donor_company"
  | "donor_email"
  | "donor_phone"
  | "donor_address_line1"
  | "donor_address_line2"
  | "donor_city"
  | "donor_state"
  | "donor_zip"
  | "donor_external_id";

export type DonationType = "cash" | "check" | "online";

// Mapping is "target field" → "csv column header". A single field with
// multiple candidate columns (e.g. donor_first_name AND donor_last_name)
// is represented by two separate keys; the resolver concatenates them at
// normalize time.
export type Mapping = {
  // CSV column header for each mapped target field.
  columns: Partial<Record<TargetField, string>>;
  // Optional constant value (only meaningful for `type` today).
  constants: Partial<Record<TargetField, string>>;
  // Knobs.
  matchDoneeByNameAddress: boolean; // default true
  emailBlocklist: string[];         // lowercased emails treated as "no email"
};

export const DEFAULT_EMAIL_BLOCKLIST = ["noemail@noemail.com", "none@none.com"];

// A raw CSV row, header → value. PapaParse output shape.
export type RawRow = Record<string, string>;

// A row after normalize.ts has run — cleaned, typed, ready for matchDonee + apply.
export type NormalizedRow = {
  rowIndex: number;                  // 0-based, matches the CSV order (after header)
  amount: number;                    // dollars, positive, two decimals
  date_received: string;             // YYYY-MM-DD
  type: DonationType;
  external_id: string | null;
  check_number: string | null;
  reference_id: string | null;
  fund_name: string | null;
  campaign_name: string | null;
  appeal_name: string | null;
  note: string | null;
  donor: {
    name: string;                    // assembled from name OR first+last OR company
    email: string | null;
    phone: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    external_id: string | null;
    company: string | null;
  };
};

// A row that failed to normalize.
export type RowError = {
  rowIndex: number;
  reason: string;
};

export type NormalizeResult = {
  rows: NormalizedRow[];
  errors: RowError[];
};

// Output of the dry-run validate step.
export type ValidateSummary = {
  rowsTotal: number;
  wouldInsert: number;
  wouldSkipDuplicate: number;
  wouldSkipError: number;
  wouldCreateNewDonees: number;
  wouldMatchExistingDonees: number;
  sampleErrors: RowError[];
};

// Output of the apply step (one chunk).
export type ApplyChunkResult = {
  inserted: number;
  duplicates: number;
  errors: RowError[];
  doneesCreated: number;
  doneesMatched: number;
};

// Auto-detect confidence: 1.0 exact, 0.7 substring, 0.5 fuzzy, 0 none.
export type DetectionScore = {
  field: TargetField;
  column: string;
  confidence: number;
};
