// Server-side dedup helpers used by /admin/dedup and /donors/[id].
// All functions go through Supabase RLS (which scopes everything to the
// active org), so callers don't need to pass org_id.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DoneeDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  donation_count: number;
  lifetime_total: number;
  last_gift_at: string | null;
};

export type DupCandidatePair = {
  a: DoneeDetail;
  b: DoneeDetail;
  score: number;
  reasons: string[];
};

// Canonicalize a pair so (A,B) and (B,A) hit the same rejection /
// candidate row. Smaller uuid wins.
export function canonicalPair(x: string, y: string): { a: string; b: string } {
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

// Hydrate a list of donee ids with full donor + giving stats. Uses the
// existing donor_list_v view so we get lifetime_total / gift_count /
// last_gift_at "for free" (security_invoker = true means RLS still
// applies).
async function hydrateDonees(ids: string[]): Promise<Map<string, DoneeDetail>> {
  const out = new Map<string, DoneeDetail>();
  if (ids.length === 0) return out;
  const supabase = createSupabaseServerClient();

  const [details, stats] = await Promise.all([
    supabase
      .from("donees")
      .select("id, name, email, phone, address_line1, address_line2, city, state, zip")
      .in("id", ids),
    supabase
      .from("donor_list_v")
      .select("id, lifetime_total, gift_count, last_gift_at")
      .in("id", ids),
  ]);

  const statMap = new Map<string, { lifetime_total: number; gift_count: number; last_gift_at: string | null }>();
  for (const s of stats.data ?? []) {
    statMap.set(s.id as string, {
      lifetime_total: Number(s.lifetime_total ?? 0),
      gift_count: Number(s.gift_count ?? 0),
      last_gift_at: (s.last_gift_at as string | null) ?? null,
    });
  }
  for (const d of details.data ?? []) {
    const s = statMap.get(d.id as string) ?? {
      lifetime_total: 0,
      gift_count: 0,
      last_gift_at: null,
    };
    out.set(d.id as string, {
      id: d.id as string,
      name: d.name as string,
      email: (d.email as string | null) ?? null,
      phone: (d.phone as string | null) ?? null,
      address_line1: (d.address_line1 as string | null) ?? null,
      address_line2: (d.address_line2 as string | null) ?? null,
      city: (d.city as string | null) ?? null,
      state: (d.state as string | null) ?? null,
      zip: (d.zip as string | null) ?? null,
      donation_count: s.gift_count,
      lifetime_total: s.lifetime_total,
      last_gift_at: s.last_gift_at,
    });
  }
  return out;
}

// Top N candidate pairs ranked by score. Excludes rejected pairs.
export async function getDupCandidates(opts?: {
  limit?: number;
  minScore?: number;
}): Promise<DupCandidatePair[]> {
  const supabase = createSupabaseServerClient();
  const limit = opts?.limit ?? 50;
  const minScore = opts?.minScore ?? 0.4;

  const { data, error } = await supabase.rpc("donee_dup_candidates", {
    min_score: minScore,
  });
  if (error) throw new Error(`getDupCandidates: ${error.message}`);

  const rows = (data as Array<{
    a_id: string;
    b_id: string;
    score: number;
    reasons: string[] | null;
  }>) ?? [];

  const ids = new Set<string>();
  for (const r of rows.slice(0, limit)) {
    ids.add(r.a_id);
    ids.add(r.b_id);
  }
  const hydrated = await hydrateDonees(Array.from(ids));

  return rows
    .slice(0, limit)
    .map((r) => {
      const a = hydrated.get(r.a_id);
      const b = hydrated.get(r.b_id);
      if (!a || !b) return null;
      return { a, b, score: r.score, reasons: r.reasons ?? [] };
    })
    .filter((x): x is DupCandidatePair => x !== null);
}

// Candidate pairs that involve a specific donor. Used by the inline
// panel on /donors/[id].
export async function getDupCandidatesForDonee(
  doneeId: string,
  opts?: { limit?: number; minScore?: number },
): Promise<DupCandidatePair[]> {
  const all = await getDupCandidates({
    limit: 500,
    minScore: opts?.minScore ?? 0.4,
  });
  return all.filter((p) => p.a.id === doneeId || p.b.id === doneeId).slice(0, opts?.limit ?? 3);
}
