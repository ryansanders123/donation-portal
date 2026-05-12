import { describe, expect, it } from "vitest";
import {
  externalRefKey,
  indexDonee,
  makeEmptyIndex,
  matchDonee,
  nameAddressKey,
} from "../matchDonee";
import type { Mapping, NormalizedRow } from "../types";
import { DEFAULT_EMAIL_BLOCKLIST } from "../types";

function row(overrides: Partial<NormalizedRow["donor"]>): NormalizedRow {
  return {
    rowIndex: 0,
    amount: 100,
    date_received: "2026-04-09",
    type: "online",
    external_id: "txn-1",
    check_number: null,
    reference_id: "txn-1",
    fund_name: "General",
    campaign_name: null,
    appeal_name: null,
    note: null,
    donor: {
      name: "Alice Smith",
      email: null,
      phone: null,
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      zip: null,
      external_id: null,
      company: null,
      ...overrides,
    },
  };
}

const baseMapping: Mapping = {
  columns: {},
  constants: {},
  matchDoneeByNameAddress: true,
  emailBlocklist: DEFAULT_EMAIL_BLOCKLIST,
};

describe("matchDonee waterfall", () => {
  it("step 1: external_id hit", () => {
    const idx = makeEmptyIndex();
    idx.byExternalRef.set(externalRefKey("GiveCentral", "PROFILE123"), "donee-1");
    const m = matchDonee(
      row({ external_id: "PROFILE123" }),
      idx,
      baseMapping,
      "GiveCentral",
    );
    expect(m).toEqual({ kind: "existing", doneeId: "donee-1", step: 1 });
  });

  it("step 2: email hit when no external_id match", () => {
    const idx = makeEmptyIndex();
    idx.byEmail.set("alice@example.com", "donee-2");
    const m = matchDonee(
      row({ external_id: "unknown", email: "alice@example.com" }),
      idx,
      baseMapping,
      "GiveCentral",
    );
    expect(m).toEqual({ kind: "existing", doneeId: "donee-2", step: 2 });
  });

  it("step 3: name + zip + address hit", () => {
    const idx = makeEmptyIndex();
    idx.byNameAddress.set(
      nameAddressKey("Alice Smith", "72032", "100 Main St"),
      "donee-3",
    );
    const m = matchDonee(
      row({ zip: "72032", address_line1: "100 Main St" }),
      idx,
      baseMapping,
      "GiveCentral",
    );
    expect(m).toEqual({ kind: "existing", doneeId: "donee-3", step: 3 });
  });

  it("step 3 disabled when knob is off", () => {
    const idx = makeEmptyIndex();
    idx.byNameAddress.set(
      nameAddressKey("Alice Smith", "72032", "100 Main St"),
      "donee-3",
    );
    const m = matchDonee(
      row({ zip: "72032", address_line1: "100 Main St" }),
      idx,
      { ...baseMapping, matchDoneeByNameAddress: false },
      "GiveCentral",
    );
    expect(m.kind).toBe("new");
  });

  it("falls through to new when nothing matches", () => {
    const idx = makeEmptyIndex();
    const m = matchDonee(row({}), idx, baseMapping, "GiveCentral");
    expect(m.kind).toBe("new");
  });

  it("does not match by name alone (no zip+address)", () => {
    const idx = makeEmptyIndex();
    // Two different John Smiths without addresses must NOT collide.
    indexDonee(idx, "donee-john-a", {
      name: "John Smith",
      email: null, phone: null, address_line1: null, address_line2: null,
      city: null, state: null, zip: null, external_id: null, company: null,
    }, "GiveCentral");
    const m = matchDonee(
      row({ name: "John Smith" }),
      idx,
      baseMapping,
      "GiveCentral",
    );
    expect(m.kind).toBe("new");
  });

  it("step 1 only fires for the same source", () => {
    const idx = makeEmptyIndex();
    idx.byExternalRef.set(externalRefKey("Bloomerang", "X1"), "donee-x");
    const m = matchDonee(
      row({ external_id: "X1" }),
      idx,
      baseMapping,
      "GiveCentral",
    );
    expect(m.kind).toBe("new");
  });
});

describe("indexDonee", () => {
  it("populates all three lookups", () => {
    const idx = makeEmptyIndex();
    indexDonee(idx, "donee-1", {
      name: "Alice",
      email: "alice@example.com",
      phone: null,
      address_line1: "100 Main St",
      address_line2: null,
      city: null,
      state: null,
      zip: "72032",
      external_id: "PROF-1",
      company: null,
    }, "GiveCentral");
    expect(idx.byEmail.get("alice@example.com")).toBe("donee-1");
    expect(idx.byExternalRef.get(externalRefKey("GiveCentral", "PROF-1"))).toBe("donee-1");
    expect(
      idx.byNameAddress.get(nameAddressKey("Alice", "72032", "100 Main St")),
    ).toBe("donee-1");
  });
});
