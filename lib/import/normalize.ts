import type {
  DonationType,
  Mapping,
  NormalizeResult,
  NormalizedRow,
  RawRow,
  RowError,
} from "./types";

function pick(row: RawRow, mapping: Mapping, field: keyof Mapping["columns"]): string | null {
  const col = mapping.columns[field];
  if (!col) return null;
  const raw = row[col];
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function nullish(s: string | null): s is null {
  if (s === null) return true;
  const lower = s.toLowerCase();
  return lower === "" || lower === "null" || lower === "n/a" || lower === "none";
}

function nullify(s: string | null): string | null {
  return nullish(s) ? null : s;
}

// "$1,234.56" → 1234.56. Returns null on garbage.
export function parseAmount(input: string | null): number | null {
  if (input === null) return null;
  const cleaned = input.replace(/[$\s,]/g, "");
  // Parentheses for negatives: not a donation. Treat as invalid.
  if (/^\(.*\)$/.test(cleaned)) return null;
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  // Round to 2 decimals to avoid float drift.
  return Math.round(n * 100) / 100;
}

// Best-effort date parser. Returns "YYYY-MM-DD" or null.
// Accepts ISO ("2026-04-09"), US ("04/09/2026", "4-9-2026"), and ISO
// timestamps. For ambiguous DD/MM vs MM/DD, US format wins (the spec's
// stated primary audience).
export function parseDate(input: string | null): string | null {
  if (input === null) return null;
  const s = input.trim();
  if (!s) return null;

  // ISO date or timestamp.
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return isValidDate(+y, +m, +d) ? `${y}-${m}-${d}` : null;
  }

  // US: M/D/YYYY or MM-DD-YYYY
  const usMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[T\s].*)?$/);
  if (usMatch) {
    const [, mm, dd, yyyy] = usMatch;
    if (!isValidDate(+yyyy, +mm, +dd)) return null;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // Fallback: let Date parse it (handles "9 April 2026", "Apr 9, 2026").
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function parseDonationType(input: string | null): DonationType {
  if (input === null) return "online";
  const s = input.toLowerCase();
  if (s.includes("check")) return "check";
  if (s.includes("cash")) return "cash";
  return "online";
}

// Build the donor display name from whichever of name / first+last /
// company is present. Falls back to "Anonymous".
function buildDonorName(opts: {
  donor_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}): string {
  if (opts.donor_name) return opts.donor_name;
  if (opts.first_name && opts.last_name) return `${opts.first_name} ${opts.last_name}`;
  if (opts.last_name) return opts.last_name;
  if (opts.first_name) return opts.first_name;
  if (opts.company) return opts.company;
  return "Anonymous";
}

function isBlockedEmail(email: string, blocklist: string[]): boolean {
  const e = email.toLowerCase();
  return blocklist.map((b) => b.toLowerCase()).includes(e);
}

export function normalizeRows(rows: RawRow[], mapping: Mapping): NormalizeResult {
  const out: NormalizedRow[] = [];
  const errors: RowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i;
    const err = (reason: string): RowError => ({ rowIndex, reason });

    // amount + date are required.
    const amountRaw = pick(row, mapping, "amount");
    const amount = parseAmount(amountRaw);
    if (amount === null) {
      errors.push(err(`invalid or missing amount: ${JSON.stringify(amountRaw)}`));
      continue;
    }

    const dateRaw = pick(row, mapping, "date_received");
    const date = parseDate(dateRaw);
    if (date === null) {
      errors.push(err(`invalid or missing date: ${JSON.stringify(dateRaw)}`));
      continue;
    }

    // type — constant first, then column, then "online".
    const typeRaw = mapping.constants.type ?? pick(row, mapping, "type");
    const type = parseDonationType(typeRaw ?? null);

    // donor — at least one of name / first+last / company / email.
    const donor_name_raw = pick(row, mapping, "donor_name");
    const first_name = pick(row, mapping, "donor_first_name");
    const last_name = pick(row, mapping, "donor_last_name");
    const company = pick(row, mapping, "donor_company");
    const donor_email_raw = pick(row, mapping, "donor_email");
    const email =
      donor_email_raw && !isBlockedEmail(donor_email_raw, mapping.emailBlocklist)
        ? donor_email_raw.toLowerCase()
        : null;

    if (!donor_name_raw && !first_name && !last_name && !company && !email) {
      errors.push(err("missing donor identity (no name, first/last, company, or email)"));
      continue;
    }

    const name = buildDonorName({
      donor_name: donor_name_raw,
      first_name,
      last_name,
      company,
    });

    // Taxonomy — must have at least one of fund/campaign/appeal.
    const fund_name = nullify(pick(row, mapping, "fund_name"));
    const campaign_name = nullify(pick(row, mapping, "campaign_name"));
    const appeal_name = nullify(pick(row, mapping, "appeal_name"));
    if (!fund_name && !campaign_name && !appeal_name) {
      errors.push(err("missing fund/campaign/appeal"));
      continue;
    }

    const external_id = nullify(pick(row, mapping, "external_id"));
    let check_number = nullify(pick(row, mapping, "check_number"));
    let reference_id = nullify(pick(row, mapping, "reference_id"));

    // Fallbacks so type constraints in the DB pass.
    if (type === "check" && !check_number) check_number = external_id;
    if (type === "online" && !reference_id) reference_id = external_id;

    if (type === "check" && !check_number) {
      errors.push(err("check requires a check_number (or an external_id to fall back to)"));
      continue;
    }
    if (type === "online" && !reference_id) {
      errors.push(err("online requires a reference_id (or an external_id to fall back to)"));
      continue;
    }

    const donor_external_id = nullify(pick(row, mapping, "donor_external_id"));

    out.push({
      rowIndex,
      amount,
      date_received: date,
      type,
      external_id,
      check_number,
      reference_id,
      fund_name,
      campaign_name,
      appeal_name,
      note: nullify(pick(row, mapping, "note")),
      donor: {
        name,
        email,
        phone: nullify(pick(row, mapping, "donor_phone")),
        address_line1: nullify(pick(row, mapping, "donor_address_line1")),
        address_line2: nullify(pick(row, mapping, "donor_address_line2")),
        city: nullify(pick(row, mapping, "donor_city")),
        state: nullify(pick(row, mapping, "donor_state")),
        zip: nullify(pick(row, mapping, "donor_zip")),
        external_id: donor_external_id,
        company,
      },
    });
  }

  return { rows: out, errors };
}
