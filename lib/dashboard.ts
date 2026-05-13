import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MonthlyTotals = {
  months: string[];
  total: number[];
  byFund: Record<string, number[]>;
  funds: { id: string; name: string }[];
};

type DonationRow = {
  amount: string | number;
  date_received: string;
  fund_id: string;
};

type FundRow = {
  id: string;
  name: string;
};

/**
 * Returns totals of non-voided donations grouped by month for the last 36
 * months. Months are "YYYY-MM" strings in chronological order (oldest first,
 * most recent last). `total` is the overall sum per month; `byFund` keys each
 * fund name to an array aligned to `months` (0 where there were no donations).
 */
export async function getMonthlyTotals(): Promise<MonthlyTotals> {
  const supabase = await createSupabaseServerClient();

  // Build the 36-month window. Use UTC to avoid timezone drift.
  const now = new Date();
  const windowStartDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 35, 1)
  );
  const windowStartIso = windowStartDate.toISOString().slice(0, 10); // YYYY-MM-DD

  const months: string[] = [];
  for (let i = 0; i < 36; i++) {
    const d = new Date(
      Date.UTC(
        windowStartDate.getUTCFullYear(),
        windowStartDate.getUTCMonth() + i,
        1
      )
    );
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    months.push(`${y}-${m}`);
  }

  // Index months for O(1) lookup.
  const monthIndex = new Map<string, number>();
  months.forEach((m, i) => monthIndex.set(m, i));

  // Fetch funds.
  const { data: fundsData, error: fundsErr } = await supabase
    .from("funds")
    .select("id,name")
    .order("name", { ascending: true });

  if (fundsErr) {
    throw new Error(`Failed to load funds: ${fundsErr.message}`);
  }

  const funds: { id: string; name: string }[] = (fundsData ?? []).map(
    (f: FundRow) => ({ id: f.id, name: f.name })
  );
  const fundNameById = new Map<string, string>();
  for (const f of funds) fundNameById.set(f.id, f.name);

  // Fetch donations in the window, page through if needed.
  // Supabase caps .range() results so page in chunks of 1000.
  const pageSize = 1000;
  let from = 0;
  const rows: DonationRow[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("donations")
      .select("amount,date_received,fund_id")
      .gte("date_received", windowStartIso)
      .is("voided_at", null)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load donations: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as DonationRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Aggregate.
  const total: number[] = new Array(months.length).fill(0);
  const byFund: Record<string, number[]> = {};
  for (const f of funds) {
    byFund[f.name] = new Array(months.length).fill(0);
  }

  for (const r of rows) {
    if (!r.date_received) continue;
    const monthKey = r.date_received.slice(0, 7); // YYYY-MM
    const idx = monthIndex.get(monthKey);
    if (idx === undefined) continue;
    const amt = Number(r.amount);
    if (!Number.isFinite(amt)) continue;
    total[idx] += amt;
    const fundName = fundNameById.get(r.fund_id);
    if (fundName && byFund[fundName]) {
      byFund[fundName][idx] += amt;
    }
  }

  return { months, total, byFund, funds };
}
