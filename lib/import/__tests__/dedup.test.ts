import { describe, expect, it } from "vitest";
import { checkAndMark, contentHashFor, makeEmptyDedup } from "../dedup";
import type { NormalizedRow } from "../types";

function row(overrides: Partial<NormalizedRow>): NormalizedRow {
  return {
    rowIndex: 0,
    amount: 100,
    date_received: "2026-04-09",
    type: "online",
    external_id: null,
    check_number: null,
    reference_id: "x",
    fund_name: "General",
    campaign_name: null,
    appeal_name: null,
    note: null,
    donor: {
      name: "Alice",
      email: null,
      phone: null,
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      zip: null,
      external_id: null,
      company: null,
    },
    ...overrides,
  };
}

describe("checkAndMark — external_id path", () => {
  it("flags duplicates when external_id has already been seen", () => {
    const idx = makeEmptyDedup();
    idx.externalIds.add("txn-1");
    const r = checkAndMark(
      row({ external_id: "TXN-1" }),
      { doneeId: "d1", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    expect(r).toEqual({ kind: "duplicate", reason: "external_id" });
  });

  it("inserts new external_id and marks the index", () => {
    const idx = makeEmptyDedup();
    const r = checkAndMark(
      row({ external_id: "TXN-2" }),
      { doneeId: "d1", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    expect(r.kind).toBe("new");
    expect(idx.externalIds.has("txn-2")).toBe(true);
  });

  it("dupes the same external_id appearing twice in one batch", () => {
    const idx = makeEmptyDedup();
    const r1 = checkAndMark(
      row({ external_id: "TXN-3" }),
      { doneeId: "d1", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    const r2 = checkAndMark(
      row({ external_id: "TXN-3" }),
      { doneeId: "d1", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    expect(r1.kind).toBe("new");
    expect(r2.kind).toBe("duplicate");
  });
});

describe("checkAndMark — content hash path", () => {
  it("flags duplicates by content when no external_id", () => {
    const idx = makeEmptyDedup();
    const r1 = checkAndMark(
      row({}),
      { doneeId: "d1", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    const r2 = checkAndMark(
      row({}),
      { doneeId: "d1", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    expect(r1.kind).toBe("new");
    expect(r2.kind).toBe("duplicate");
    if (r2.kind === "duplicate") expect(r2.reason).toBe("content");
  });

  it("different donee → different hash", () => {
    const idx = makeEmptyDedup();
    checkAndMark(
      row({}),
      { doneeId: "d1", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    const r = checkAndMark(
      row({}),
      { doneeId: "d2", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    expect(r.kind).toBe("new");
  });
});

describe("contentHashFor", () => {
  it("is deterministic", () => {
    const h1 = contentHashFor(row({}), {
      doneeId: "d1", fundId: "f1", campaignId: null, appealId: null,
    });
    const h2 = contentHashFor(row({}), {
      doneeId: "d1", fundId: "f1", campaignId: null, appealId: null,
    });
    expect(h1).toBe(h2);
  });
});
