import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ExportsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: funds } = await supabase
    .from("funds")
    .select("id,name")
    .order("name");

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => thisYear - i);

  return (
    <div className="animate-fade-in">
      <header className="mb-8">
        <h1 className="page-title">Bulk exports</h1>
        <p className="page-subtitle max-w-2xl">
          Download the year&rsquo;s donor data as CSV — feed it into mail-merge,
          a spreadsheet, or your statement-generation tool. Voided gifts are
          always excluded.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExportCard
          title="Summary by donor"
          subtitle="One row per donor with totals, donation count, address, and a per-fund JSON breakdown. Use this for annual statements."
          type="summary"
          years={years}
          funds={funds ?? []}
          showThreshold
        />
        <ExportCard
          title="Detail by donation"
          subtitle="One row per donation with date, fund, campaign, appeal, type, and amount. Use this for itemized lookups or any tool that wants the raw transactions."
          type="detail"
          years={years}
          funds={funds ?? []}
          showThreshold={false}
        />
      </div>
    </div>
  );
}

function ExportCard({
  title,
  subtitle,
  type,
  years,
  funds,
  showThreshold,
}: {
  title: string;
  subtitle: string;
  type: "summary" | "detail";
  years: number[];
  funds: { id: string; name: string }[];
  showThreshold: boolean;
}) {
  return (
    <form
      method="GET"
      action="/admin/exports/download"
      className="card p-6 md:p-7 space-y-4"
    >
      <input type="hidden" name="type" value={type} />
      <div>
        <h2 className="font-serif text-xl text-stone-900">{title}</h2>
        <p className="text-sm text-stone-600 mt-1">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${type}-year`} className="label">Year</label>
          <select id={`${type}-year`} name="year" defaultValue={years[0]} className="input">
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        {showThreshold && (
          <div>
            <label htmlFor={`${type}-threshold`} className="label">
              Min total <span className="font-normal text-stone-400">(USD)</span>
            </label>
            <input
              id={`${type}-threshold`}
              name="threshold"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              className="input"
            />
          </div>
        )}
      </div>

      <div>
        <label htmlFor={`${type}-fund`} className="label">Fund</label>
        <select id={`${type}-fund`} name="fund" defaultValue="" className="input">
          <option value="">All funds</option>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Type</label>
        <div className="flex gap-4 text-sm text-stone-700">
          {(["cash", "check", "online"] as const).map((t) => (
            <label key={t} className="inline-flex items-center gap-2">
              <input type="checkbox" name="type_in" value={t} defaultChecked className="h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand/30" />
              <span className="capitalize">{t}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="pt-1">
        <button className="btn-primary">Download CSV</button>
      </div>
    </form>
  );
}
