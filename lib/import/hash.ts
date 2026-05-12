import { createHash } from "node:crypto";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

// Content hash for cross-batch dedup when external_id is missing.
// Donee key must be the donee_id (or, before insert, the donee match key)
// so that two donations from the same person/date/amount/fund collide.
export function contentHash(parts: {
  doneeKey: string;
  date: string;
  amountCents: number;
  fundKey: string;
}): string {
  return sha256(
    [parts.doneeKey, parts.date, String(parts.amountCents), parts.fundKey].join(
      "|",
    ),
  );
}
