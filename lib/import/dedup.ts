import type { NormalizedRow } from "./types";
import { contentHash } from "./hash";

// In-memory dedup index. Built once at batch start from the org's
// existing donations (server-side).

export type DedupIndex = {
  externalIds: Set<string>; // `${source_name}::${external_id}`, lowercased
  contentHashes: Set<string>;
};

export function makeEmptyDedup(): DedupIndex {
  return { externalIds: new Set(), contentHashes: new Set() };
}

export function externalDonationKey(sourceName: string, externalId: string): string {
  return `${sourceName.toLowerCase()}::${externalId.toLowerCase()}`;
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

export function checkExternalAndMark(
  row: NormalizedRow,
  sourceName: string,
  index: DedupIndex,
): DupCheck {
  if (!row.external_id) return { kind: "new" };
  const key = externalDonationKey(sourceName, row.external_id);
  if (index.externalIds.has(key)) return { kind: "duplicate", reason: "external_id" };
  index.externalIds.add(key);
  return { kind: "new" };
}

export function checkContentAndMark(
  row: NormalizedRow,
  resolved: { doneeId: string; fundId: string | null; campaignId: string | null; appealId: string | null },
  index: DedupIndex,
): DupCheck {
  const hash = contentHashFor(row, resolved);
  if (index.contentHashes.has(hash)) return { kind: "duplicate", reason: "content" };
  index.contentHashes.add(hash);
  return { kind: "new" };
}
