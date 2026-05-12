import type { Mapping, NormalizedRow } from "./types";

// In-memory donee index used during import. The caller (apply.ts /
// server actions) builds it from the org's existing rows before
// processing any chunks.

export type DoneeIndex = {
  // Step 1: source-specific constituent id → donee_id
  byExternalRef: Map<string, string>; // key = `${source_name}::${external_id}` (lowercased)
  // Step 2: email → donee_id (lowercased)
  byEmail: Map<string, string>;
  // Step 3: name|zip|address_line1 (all lowercased+trimmed) → donee_id
  byNameAddress: Map<string, string>;
};

export function makeEmptyIndex(): DoneeIndex {
  return {
    byExternalRef: new Map(),
    byEmail: new Map(),
    byNameAddress: new Map(),
  };
}

export function externalRefKey(source: string, externalId: string): string {
  return `${source.toLowerCase()}::${externalId.toLowerCase()}`;
}

export function nameAddressKey(name: string, zip: string, line1: string): string {
  return `${name.toLowerCase().trim()}|${zip.toLowerCase().trim()}|${line1.toLowerCase().trim()}`;
}

export type DoneeMatch =
  | { kind: "existing"; doneeId: string; step: 1 | 2 | 3 }
  | { kind: "new" };

// Pure: given a normalized row and an index, return either an existing
// donee id (with the matching step) or "new" to indicate the caller
// should insert.
//
// The four-step waterfall:
//   1. external constituent id (per source)
//   2. email exact (lowercased)
//   3. name + zip + address_line1 (only if matchDoneeByNameAddress is on)
//   4. else "new"
export function matchDonee(
  row: NormalizedRow,
  index: DoneeIndex,
  mapping: Mapping,
  sourceName: string,
): DoneeMatch {
  // Step 1
  if (row.donor.external_id) {
    const key = externalRefKey(sourceName, row.donor.external_id);
    const hit = index.byExternalRef.get(key);
    if (hit) return { kind: "existing", doneeId: hit, step: 1 };
  }

  // Step 2
  if (row.donor.email) {
    const hit = index.byEmail.get(row.donor.email.toLowerCase());
    if (hit) return { kind: "existing", doneeId: hit, step: 2 };
  }

  // Step 3
  if (
    mapping.matchDoneeByNameAddress &&
    row.donor.zip &&
    row.donor.address_line1
  ) {
    const key = nameAddressKey(row.donor.name, row.donor.zip, row.donor.address_line1);
    const hit = index.byNameAddress.get(key);
    if (hit) return { kind: "existing", doneeId: hit, step: 3 };
  }

  return { kind: "new" };
}

// Register a freshly-inserted donee in the index so subsequent rows in
// the same batch can match against it.
export function indexDonee(
  index: DoneeIndex,
  doneeId: string,
  donor: NormalizedRow["donor"],
  sourceName: string,
): void {
  if (donor.external_id) {
    index.byExternalRef.set(externalRefKey(sourceName, donor.external_id), doneeId);
  }
  if (donor.email) {
    index.byEmail.set(donor.email.toLowerCase(), doneeId);
  }
  if (donor.zip && donor.address_line1) {
    index.byNameAddress.set(
      nameAddressKey(donor.name, donor.zip, donor.address_line1),
      doneeId,
    );
  }
}
