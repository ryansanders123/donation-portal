import { describe, expect, it } from "vitest";
import {
  checkContentAndMark,
  checkExternalAndMark,
  contentHashFor,
  externalDonationKey,
  makeEmptyDedup,
} from "../dedup";
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

describe("checkExternalAndMark — external_id path", () => {
  it("flags duplicates when external_id has already been seen", () => {
    const idx = makeEmptyDedup();
    idx.externalIds.add(externalDonationKey("GiveCentral", "txn-1"));
    const r = checkExternalAndMark(
      row({ external_id: "TXN-1" }),
      "GiveCentral",
      idx,
    );
    expect(r).toEqual({ kind: "duplicate", reason: "external_id" });
  });

  it("inserts new external_id and marks the index", () => {
    const idx = makeEmptyDedup();
    const r = checkExternalAndMark(
      row({ external_id: "TXN-2" }),
      "GiveCentral",
      idx,
    );
    expect(r.kind).toBe("new");
    expect(idx.externalIds.has(externalDonationKey("GiveCentral", "txn-2"))).toBe(true);
  });

  it("dupes the same external_id appearing twice in one batch", () => {
    const idx = makeEmptyDedup();
    const r1 = checkExternalAndMark(
      row({ external_id: "TXN-3" }),
      "GiveCentral",
      idx,
    );
    const r2 = checkExternalAndMark(
      row({ external_id: "TXN-3" }),
      "GiveCentral",
      idx,
    );
    expect(r1.kind).toBe("new");
    expect(r2.kind).toBe("duplicate");
  });

  it("allows the same external_id from different sources", () => {
    const idx = makeEmptyDedup();
    checkExternalAndMark(row({ external_id: "TXN-4" }), "GiveCentral", idx);
    const r = checkExternalAndMark(row({ external_id: "TXN-4" }), "Stripe", idx);
    expect(r.kind).toBe("new");
  });
});

describe("checkContentAndMark — content hash path", () => {
  it("flags duplicates by content when no external_id", () => {
    const idx = makeEmptyDedup();
    const r1 = checkContentAndMark(
      row({}),
      { doneeId: "d1", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    const r2 = checkContentAndMark(
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
    checkContentAndMark(
      row({}),
      { doneeId: "d1", fundId: "f1", campaignId: null, appealId: null },
      idx,
    );
    const r = checkContentAndMark(
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
