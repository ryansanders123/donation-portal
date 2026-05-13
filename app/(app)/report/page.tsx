import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { summarize, monthRange } from "@/lib/reports";
import { currentAppUser } from "@/lib/auth";
import { getActiveOrg, hasFeature } from "@/lib/org-context";

const PAGE_SIZE = 25;

function parseMonth(s?: string) {
  const d = s ? new Date(s + "-01") : new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    page?: string;
    voided?: string;
    fund?: string;
    campaign?: string;
    appeal?: string;
  }>;
}) {
  const sp = await searchParams;
  const { year, month } = parseMonth(sp.month);
  const { start, end } = monthRange(year, month);
  const includeVoided = sp.voided === "1";
  let fundFilter = sp.fund ?? "";
  let campaignFilter = sp.campaign ?? "";
  let appealFilter = sp.appeal ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));

  const [user, org] = await Promise.all([currentAppUser(), getActiveOrg()]);
  const isAdmin = user?.role === "admin";
  const showFunds = hasFeature(org, "funds");
  const showCampaigns = hasFeature(org, "campaigns");
  const showAppeals = hasFeature(org, "appeals");
  if (!showFunds) fundFilter = "";
  if (!showCampaigns) campaignFilter = "";
  if (!showAppeals) appealFilter = "";
  const supabase = await createSupabaseServerClient();

  const [{ data: fundsList }, { data: campaignsList }, { data: appealsList }] = await Promise.all([
    showFunds ? supabase.from("funds").select("id,name").order("name") : Promise.resolve({ data: [] }),
    showCampaigns ? supabase.from("campaigns").select("id,name").order("name") : Promise.resolve({ data: [] }),
    showAppeals ? supabase.from("appeals").select("id,name").order("name") : Promise.resolve({ data: [] }),
  ]);

  let q = supabase
    .from("donations")
    .select(
      "id,amount,type,date_received,check_number,reference_id,voided_at,donees(name),funds(name),campaigns(name),appeals(name)",
      { count: "exact" }
    )
    .gte("date_received", start)
    .lt("date_received", end)
    .order("date_received", { ascending: false });

  if (!includeVoided) q = q.is("voided_at", null);
  if (fundFilter) q = q.eq("fund_id", fundFilter);
  if (campaignFilter) q = q.eq("campaign_id", campaignFilter);
  if (appealFilter) q = q.eq("appeal_id", appealFilter);

  const { data: rows, count } = await q.range(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE - 1
  );

  type DonationRow = {
    id: string;
    type: "cash" | "check" | "online";
    amount: string;
    date_received: string;
    check_number: string | null;
    reference_id: string | null;
    voided_at: string | null;
    donees: { name: string } | { name: string }[] | null;
    funds: { name: string } | { name: string }[] | null;
    campaigns: { name: string } | { name: string }[] | null;
    appeals: { name: string } | { name: string }[] | null;
  };

  const nameOf = (
    rel: { name: string } | { name: string }[] | null | undefined
  ): string => {
    if (!rel) return "";
    if (Array.isArray(rel)) return rel[0]?.name ?? "";
    return rel.name ?? "";
  };

  const flat = ((rows ?? []) as DonationRow[]).map((r) => ({
    id: r.id,
    type: r.type,
    amount: r.amount,
    fund_name: nameOf(r.funds),
    donee_name: nameOf(r.donees),
    date_received: r.date_received,
    check_number: r.check_number,
    reference_id: r.reference_id,
    voided_at: r.voided_at,
  }));

  // Fetch ALL rows for the month (no range) to compute totals, include voided if toggle on.
  let totalsQ = supabase
    .from("donations")
    .select("id,type,amount,voided_at,funds(name)")
    .gte("date_received", start)
    .lt("date_received", end);
  if (fundFilter) totalsQ = totalsQ.eq("fund_id", fundFilter);
  if (campaignFilter) totalsQ = totalsQ.eq("campaign_id", campaignFilter);
  if (appealFilter) totalsQ = totalsQ.eq("appeal_id", appealFilter);
  const { data: allRows } = includeVoided
    ? await totalsQ
    : await totalsQ.is("voided_at", null);

  type TotalsRow = {
    id: string;
    type: "cash" | "check" | "online";
    amount: string;
    voided_at: string | null;
    funds: { name: string } | { name: string }[] | null;
  };

  const sum = summarize(
    ((allRows ?? []) as TotalsRow[]).map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      voided_at: r.voided_at,
      fund_name: nameOf(r.funds),
    }))
  );

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (obj: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj))
      if (v != null && v !== "") p.set(k, String(v));
    return p.toString();
  };

  return (
    <div className="animate-fade-in">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Monthly report</h1>
          <p className="page-subtitle">
            Donations received in {monthLabel}.
          </p>
        </div>
      </header>

      <form className="mb-6 card p-4 md:p-5 flex flex-wrap gap-4 items-end">
        <div>
          <label htmlFor="month" className="label">
            Month
          </label>
          <input
            id="month"
            type="month"
            name="month"
            defaultValue={monthStr}
            className="input w-44"
          />
        </div>
        {showFunds && (
          <div>
            <label htmlFor="fund" className="label">
              Fund
            </label>
            <select id="fund" name="fund" defaultValue={fundFilter} className="input w-44">
              <option value="">All funds</option>
              {(fundsList ?? []).map((f: { id: string; name: string }) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}
        {showCampaigns && (
          <div>
            <label htmlFor="campaign" className="label">
              Campaign
            </label>
            <select id="campaign" name="campaign" defaultValue={campaignFilter} className="input w-44">
              <option value="">All campaigns</option>
              {(campaignsList ?? []).map((c: { id: string; name: string }) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        {showAppeals && (
          <div>
            <label htmlFor="appeal" className="label">
              Appeal
            </label>
            <select id="appeal" name="appeal" defaultValue={appealFilter} className="input w-44">
              <option value="">All appeals</option>
              {(appealsList ?? []).map((a: { id: string; name: string }) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-stone-700 h-10 px-1">
          <input
            type="checkbox"
            name="voided"
            value="1"
            defaultChecked={includeVoided}
            className="h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand/30"
          />
          Include voided
        </label>
        <button className="btn-primary">Apply</button>
        <Link
          href={`/report/export?${qs({
            month: monthStr,
            voided: includeVoided ? "1" : "",
            fund: fundFilter,
            campaign: campaignFilter,
            appeal: appealFilter,
          })}`}
          className="btn-outline ml-auto"
        >
          <DownloadIcon />
          Download CSV
        </Link>
      </form>

      <section className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">
            Grand total
          </div>
          <div className="font-serif text-3xl md:text-4xl font-medium text-brand-700 tracking-tight">
            ${sum.grand.toFixed(2)}
          </div>
          <div className="text-xs text-stone-500 mt-2">
            {count ?? 0} {count === 1 ? "donation" : "donations"} this month
          </div>
        </div>
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-3">
            By type
          </div>
          <div className="space-y-1.5">
            {(["cash", "check", "online"] as const).map((t) => (
              <div
                key={t}
                className="flex justify-between text-sm text-stone-700"
              >
                <span className="capitalize">{t}</span>
                <span className="font-medium tabular-nums">
                  ${sum.byType[t].toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-3">
            By fund
          </div>
          {Object.entries(sum.byFund).length === 0 && (
            <div className="text-sm text-stone-400">&mdash;</div>
          )}
          <div className="space-y-1.5">
            {Object.entries(sum.byFund).map(([fund, n]) => (
              <div
                key={fund}
                className="flex justify-between text-sm text-stone-700 gap-3"
              >
                <span className="truncate">{fund}</span>
                <span className="font-medium tabular-nums shrink-0">
                  ${n.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/60 border-b border-stone-200">
              <tr className="text-[11px] uppercase tracking-wider text-stone-500">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Donee</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Fund</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Check / Ref</th>
                <th className="px-4 py-3" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {flat.map((r) => (
                <tr
                  key={r.id}
                  className={`transition-colors hover:bg-stone-50/60 ${
                    r.voided_at ? "text-stone-400" : "text-stone-800"
                  }`}
                >
                  <td
                    className={`px-4 py-3 tabular-nums ${
                      r.voided_at ? "line-through" : ""
                    }`}
                  >
                    {r.date_received}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      r.voided_at ? "line-through" : "font-medium text-stone-900"
                    }`}
                  >
                    {r.donee_name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`chip-neutral capitalize ${
                        r.voided_at ? "opacity-60" : ""
                      }`}
                    >
                      {r.type}
                    </span>
                  </td>
                  <td className={`px-4 py-3 ${r.voided_at ? "line-through" : ""}`}>
                    {r.fund_name}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-medium ${
                      r.voided_at ? "line-through text-stone-400" : "text-stone-900"
                    }`}
                  >
                    ${Number(r.amount).toFixed(2)}
                  </td>
                  <td
                    className={`px-4 py-3 text-stone-600 ${
                      r.voided_at ? "line-through" : ""
                    }`}
                  >
                    {r.check_number ?? r.reference_id ?? ""}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.voided_at ? (
                      <span className="text-[11px] uppercase tracking-wider text-red-700/80 font-medium">
                        Voided
                      </span>
                    ) : isAdmin ? (
                      <Link
                        href={`/donations/${r.id}/void`}
                        className="text-xs font-medium text-stone-500 hover:text-red-700 hover:underline"
                      >
                        Void…
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
              {flat.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-stone-500">
                      <div className="h-10 w-10 rounded-full bg-stone-100 flex items-center justify-center">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M4 6h12M4 10h12M4 14h8"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      <div className="text-sm">
                        No donations match this filter.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex gap-2 items-center">
        {page > 1 && (
          <Link
            href={`/report?${qs({
              month: monthStr,
              voided: includeVoided ? "1" : "",
              fund: fundFilter,
              campaign: campaignFilter,
              appeal: appealFilter,
              page: page - 1,
            })}`}
            className="btn-secondary btn-sm"
          >
            ← Prev
          </Link>
        )}
        <span className="text-sm text-stone-500 px-1">
          Page {page} of {totalPages}
        </span>
        {page < totalPages && (
          <Link
            href={`/report?${qs({
              month: monthStr,
              voided: includeVoided ? "1" : "",
              fund: fundFilter,
              campaign: campaignFilter,
              appeal: appealFilter,
              page: page + 1,
            })}`}
            className="btn-secondary btn-sm"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 2v8m0 0l3-3m-3 3L5 7M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
