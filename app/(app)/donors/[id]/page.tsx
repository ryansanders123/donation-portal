import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDonorDetail } from "@/lib/donors";
import { DonorChart } from "@/components/DonorChart";
import { DonorDupPanel } from "@/components/DonorDupPanel";

export const dynamic = "force-dynamic";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function DonorDetailPage({ params }: { params: { id: string } }) {
  await requireUser();
  const detail = await getDonorDetail(params.id);
  if (!detail) notFound();

  const { donee, gifts } = detail;
  const fullAddr = [
    donee.address_line1,
    donee.address_line2,
    [donee.city, donee.state, donee.zip].filter(Boolean).join(", "),
  ].filter(Boolean).join(" • ") || donee.address || null;

  return (
    <div className="animate-fade-in">
      <DonorDupPanel doneeId={donee.id} />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/donors" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-brand-700 transition-colors">
            ← All donors
          </Link>
          <h1 className="mt-2 page-title">{donee.name}</h1>
          <p className="mt-1 text-stone-600 text-sm">
            {[donee.email, donee.phone].filter(Boolean).join(" • ") || "No contact info on file"}
          </p>
          {fullAddr && (
            <p className="text-stone-500 text-sm">{fullAddr}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/donations/add`} className="btn-outline">
            New donation
          </Link>
          <Link href={`/tax-summary?donee=${donee.id}`} className="btn-secondary">
            Tax statement
          </Link>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="section-eyebrow">Giving over time</h2>
        <DonorChart gifts={gifts} />
      </section>

      <section>
        <h2 className="section-eyebrow">History</h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50/60 border-b border-stone-200">
                <tr className="text-[11px] uppercase tracking-wider text-stone-500">
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Fund</th>
                  <th className="text-left px-4 py-3 font-medium">Campaign</th>
                  <th className="text-left px-4 py-3 font-medium">Appeal</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 font-medium">Check / Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {gifts.map((g) => (
                  <tr key={g.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="px-4 py-3 tabular-nums text-stone-700">{g.date_received}</td>
                    <td className="px-4 py-3"><span className="chip-neutral capitalize">{g.type}</span></td>
                    <td className="px-4 py-3 text-stone-700">{g.fund_name ?? "—"}</td>
                    <td className="px-4 py-3 text-stone-700">{g.campaign_name ?? "—"}</td>
                    <td className="px-4 py-3 text-stone-700">{g.appeal_name ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-stone-900">
                      {fmtUsd(Number(g.amount))}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {g.check_number ?? g.reference_id ?? ""}
                    </td>
                  </tr>
                ))}
                {gifts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-sm text-stone-500">
                      No gifts recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
