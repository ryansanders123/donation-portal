import type { NormalizedRow } from "./types";
import { contentHash } from "./hash";

// In-memory dedup index. Built once at batch start from the org's
// existing donations (server-side).

export type DedupIndex = {
  externalIds: Set<string>; // lowercased
  contentHashes: Set<string>;
};

export function makeEmptyDedup(): DedupIndex {
  return { externalIds: new Set(), contentHashes: new Set() };
}

// Compute a content hash for dedup-without-external-id. Caller supplies
// resolved donee/fund identifiers so that the same person/date/amount/fund
// from any source collides.
export function contentHashFor(
  row: NormalizedRow,
  resolved: { doneeId: string; fundId: string | null; campaignId: string | null; appealId: string | null },
): string {
  const fundKey = resolved.fundId ?? resolved.campaignId ?? resolved.appealId ?? "";
  return contentHash({
    doneeKey: resolved.doneeId,
    date: row.date_received,
    amountCents: Math.round(row.amount * 100),
    fundKey,
  });
}

export type DupCheck =
  | { kind: "duplicate"; reason: "external_id" | "content" }
  | { kind: "new" };

// Check if this row would be a duplicate of an existing donation (in the
// DB or already inserted in this batch). Updates the index when "new".
export function checkAndMark(
  row: NormalizedRow,
  resolved: { doneeId: string; fundId: string | null; campaignId: string | null; appealId: string | null },
  index: DedupIndex,
): DupCheck {
  if (row.external_id) {
    const k = row.external_id.toLowerCase();
    if (index.externalIds.has(k)) return { kind: "duplicate", reason: "external_id" };
    index.externalIds.add(k);
    return { kind: "new" };
  }

  const hash = contentHashFor(row, resolved);
  if (index.contentHashes.has(hash)) return { kind: "duplicate", reason: "content" };
  index.contentHashes.add(hash);
  return { kind: "new" };
}
