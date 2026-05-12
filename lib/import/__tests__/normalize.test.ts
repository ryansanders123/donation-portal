import { describe, expect, it } from "vitest";
import {
  normalizeRows,
  parseAmount,
  parseDate,
  parseDonationType,
} from "../normalize";
import type { Mapping } from "../types";
import { DEFAULT_EMAIL_BLOCKLIST } from "../types";

function baseMapping(extra: Partial<Mapping> = {}): Mapping {
  return {
    columns: {
      amount: "Amount",
      date_received: "Date",
      fund_name: "Fund",
      donor_name: "Donor",
      ...((extra.columns as object | undefined) ?? {}),
    },
    constants: { type: "cash", ...(extra.constants ?? {}) },
    matchDoneeByNameAddress: true,
    emailBlocklist: DEFAULT_EMAIL_BLOCKLIST,
  };
}

describe("parseAmount", () => {
  it.each([
    ["100", 100],
    ["$100.00", 100],
    ["$1,234.56", 1234.56],
    [" 99.5 ", 99.5],
  ])("parses %s → %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([null, "", "abc", "0", "-5", "(100.00)"])(
    "rejects garbage: %s",
    (input) => {
      expect(parseAmount(input)).toBeNull();
    },
  );
});

describe("parseDate", () => {
  it.each([
    ["2026-04-09", "2026-04-09"],
    ["04/09/2026", "2026-04-09"],
    ["4-9-2026", "2026-04-09"],
    ["2026-04-09T12:00:00Z", "2026-04-09"],
    ["2026-04-09 14:30:00", "2026-04-09"],
  ])("parses %s → %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it.each([null, "", "garbage", "13/45/2026", "2026-02-30"])(
    "rejects %s",
    (input) => {
      expect(parseDate(input)).toBeNull();
    },
  );
});

describe("parseDonationType", () => {
  it("maps check / cash / online", () => {
    expect(parseDonationType("CHECKS")).toBe("check");
    expect(parseDonationType("Check #1234")).toBe("check");
    expect(parseDonationType("Cash")).toBe("cash");
    expect(parseDonationType("Visa - xxx4063")).toBe("online");
    expect(parseDonationType(null)).toBe("online");
  });
});

describe("normalizeRows", () => {
  it("emits a clean NormalizedRow for valid input", () => {
    const rows = [{ Amount: "$100.00", Date: "2026-04-09", Fund: "General", Donor: "Alice Smith" }];
    const r = normalizeRows(rows, baseMapping());
    expect(r.errors).toEqual([]);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].amount).toBe(100);
    expect(r.rows[0].date_received).toBe("2026-04-09");
    expect(r.rows[0].type).toBe("cash");
    expect(r.rows[0].fund_name).toBe("General");
    expect(r.rows[0].donor.name).toBe("Alice Smith");
  });

  it("errors on missing amount", () => {
    const rows = [{ Amount: "", Date: "2026-04-09", Fund: "General", Donor: "Alice" }];
    const r = normalizeRows(rows, baseMapping());
    expect(r.errors[0].reason).toMatch(/amount/);
  });

  it("errors on missing donor identity", () => {
    const rows = [{ Amount: "100", Date: "2026-04-09", Fund: "General", Donor: "" }];
    const r = normalizeRows(rows, baseMapping());
    expect(r.errors[0].reason).toMatch(/donor/);
  });

  it("errors when no fund/campaign/appeal is set", () => {
    const rows = [{ Amount: "100", Date: "2026-04-09", Fund: "", Donor: "Alice" }];
    const r = normalizeRows(rows, baseMapping());
    expect(r.errors[0].reason).toMatch(/fund\/campaign\/appeal/);
  });

  it("assembles name from first + last when donor_name missing", () => {
    const mapping = baseMapping({
      columns: {
        amount: "Amount",
        date_received: "Date",
        fund_name: "Fund",
        donor_first_name: "First",
        donor_last_name: "Last",
      },
    });
    const rows = [
      { Amount: "100", Date: "2026-04-09", Fund: "General", First: "Alice", Last: "Smith" },
    ];
    const r = normalizeRows(rows, mapping);
    expect(r.rows[0].donor.name).toBe("Alice Smith");
  });

  it("falls back to external_id for check_number when type=check", () => {
    const mapping = baseMapping({
      columns: {
        amount: "Amount",
        date_received: "Date",
        fund_name: "Fund",
        donor_name: "Donor",
        external_id: "TxnId",
      },
      constants: { type: "check" },
    });
    const rows = [{ Amount: "100", Date: "2026-04-09", Fund: "General", Donor: "Alice", TxnId: "5512" }];
    const r = normalizeRows(rows, mapping);
    expect(r.rows[0].type).toBe("check");
    expect(r.rows[0].check_number).toBe("5512");
  });

  it("blocks placeholder emails", () => {
    const mapping = baseMapping({
      columns: {
        amount: "Amount",
        date_received: "Date",
        fund_name: "Fund",
        donor_name: "Donor",
        donor_email: "Email",
      },
    });
    const rows = [
      { Amount: "100", Date: "2026-04-09", Fund: "General", Donor: "Alice", Email: "noemail@noemail.com" },
    ];
    const r = normalizeRows(rows, mapping);
    expect(r.rows[0].donor.email).toBeNull();
  });
});
