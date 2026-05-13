import Link from "next/link";
import { TaxSummaryBulk } from "./TaxSummaryBulk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TaxRow = {
  date_received: string;
  type: string;
  amount: string;
  funds: { name: string } | { name: string }[] | null;
};

type DoneeRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

const nameOf = (
  rel: { name: string } | { name: string }[] | null | undefined
): string => {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.name ?? "";
  return rel.name ?? "";
};

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function TaxSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ donee?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const year = parseInt(
    sp.year ?? String(new Date().getFullYear()),
    10
  );
  const doneeId = sp.donee;

  // No donee specified → bulk-first landing.
  if (!doneeId) {
    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: 11 }, (_, i) => thisYear - i);
    return (
      <div className="animate-fade-in">
        <header className="mb-8">
          <h1 className="page-title">Tax statements</h1>
          <p className="page-subtitle max-w-2xl">
            Download the full year of donor giving data for tax statements,
            mail-merge, or your statement-generation tool. Voided gifts are
            always excluded.
          </p>
        </header>

        <TaxSummaryBulk years={years} defaultYear={year} />

        <div className="mt-8 card p-6 md:p-7 bg-gradient-to-br from-stone-50 to-white">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 ring-1 ring-brand-200">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="7.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 16c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M13 11a2 2 0 100-4M13.5 16c0-1.6.5-2.8 1.5-3.5 1.8.2 3 1.7 3 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-medium text-stone-900">Need a single donor&rsquo;s statement?</div>
              <div className="text-sm text-stone-600 mt-1">
                Browse to{" "}
                <Link href="/donors" className="text-brand-700 hover:underline font-medium">Donors</Link>,
                pick a donor, then click <span className="font-medium">Tax statement</span> on their detail page.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Per-donor view (linked from donor detail page).
  const supabase = await createSupabaseServerClient();
  const { data: d } = await supabase
    .from("donees")
    .select("*")
    .eq("id", doneeId)
    .single();
  const donee = (d ?? null) as DoneeRow | null;
  const { data } = await supabase
    .from("donations")
    .select("date_received,type,amount,funds(name)")
    .eq("donee_id", doneeId)
    .is("voided_at", null)
    .gte("date_received", `${year}-01-01`)
    .lt("date_received", `${year + 1}-01-01`)
    .order("date_received");
  const rows = (data ?? []) as TaxRow[];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  if (!donee) {
    return (
      <div className="animate-fade-in">
        <header className="mb-8">
          <h1 className="page-title">Tax statement</h1>
          <p className="page-subtitle">Donor not found.</p>
        </header>
        <Link href="/donors" className="btn-secondary">← Back to donors</Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <header className="mb-8">
        <Link href={`/donors/${donee.id}`} className="text-sm text-stone-500 hover:text-brand-700">
          ← {donee.name}
        </Link>
        <h1 className="mt-2 page-title">{year} tax statement</h1>
        <p className="page-subtitle">{donee.name}</p>
      </header>

      <form className="mb-6 card p-4 md:p-5 flex flex-wrap gap-4 items-end" method="get">
        <input type="hidden" name="donee" value={donee.id} />
        <div>
          <label htmlFor="year" className="label">Year</label>
          <input
            id="year"
            type="number"
            name="year"
            defaultValue={year}
            className="input w-28"
          />
        </div>
        <button className="btn-primary">Apply</button>
      </form>

      <div className="card p-6 mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-1">
            {year} giving summary
          </div>
          <div className="text-sm text-stone-500 mt-0.5">
            {rows.length} {rows.length === 1 ? "contribution" : "contributions"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-1">Total</div>
          <div className="font-serif text-3xl font-medium text-brand-700 tabular-nums">
            {fmtUsd(total)}
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={`/tax-summary/export?donee=${donee.id}&year=${year}`}
          className="btn-outline"
        >
          Download CSV
        </Link>
        <Link
          href={`/tax-summary/${donee.id}/${year}/print`}
          className="btn-secondary"
          target="_blank"
        >
          Print view
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/60 border-b border-stone-200">
              <tr className="text-[11px] uppercase tracking-wider text-stone-500">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Fund</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className="text-stone-800 hover:bg-stone-50/60 transition-colors"
                >
                  <td className="px-4 py-3 tabular-nums">{r.date_received}</td>
                  <td className="px-4 py-3">
                    <span className="chip-neutral capitalize">{r.type}</span>
                  </td>
                  <td className="px-4 py-3">{nameOf(r.funds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-stone-900">
                    {fmtUsd(Number(r.amount))}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center text-stone-500 text-sm">
                    No donations for this donor in {year}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
