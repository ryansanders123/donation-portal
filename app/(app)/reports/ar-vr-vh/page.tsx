import { pdsQuery } from "@/lib/pds-db";
import { fmtInt, fmtPct1 } from "@/lib/report-format";
import { Sheet } from "@/components/reports/Sheet";
import { DashboardChrome } from "@/components/reports/DashboardChrome";
import { BarCell } from "@/components/reports/BarCell";
import { CountyMap } from "./CountyMap";
import { CountyClearLink } from "./CountyClearLink";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/reports/ar-vr-vh", label: "AR VR VH" },
  { href: "/reports/ubi", label: "UBI" },
];

type CountyRow = { county: string; records: number };
type GenderAgeRow = { age_segment: string | null; gender: string | null; records: number };
type RecencyRow = { voting_recency: string | null; records: number };
type PartyRow = { flg_dem: string | null; flg_rep: string | null; records: number };

export default async function ARVRVHPage({
  searchParams,
}: {
  searchParams: Promise<{ county?: string }>;
}) {
  const sp = await searchParams;
  const selectedCounty = sp.county?.toUpperCase() || null;

  const where = selectedCounty ? "WHERE upper(county) = $1" : "";
  const params: unknown[] = selectedCounty ? [selectedCounty] : [];

  const [countyTotals, demoRows, recencyRows, partyRows] = await Promise.all([
    pdsQuery<CountyRow>(
      "SELECT county, SUM(records)::int AS records FROM pds.ar_vr_vh_summary GROUP BY county"
    ),
    pdsQuery<GenderAgeRow>(
      `SELECT age_segment, gender, SUM(records)::int AS records FROM pds.ar_vr_vh_summary ${where} GROUP BY 1, 2`,
      params
    ),
    pdsQuery<RecencyRow>(
      `SELECT voting_recency, SUM(records)::int AS records FROM pds.ar_vr_vh_summary ${where} GROUP BY 1`,
      params
    ),
    pdsQuery<PartyRow>(
      `SELECT flg_dem, flg_rep, SUM(records)::int AS records FROM pds.ar_vr_vh_summary ${where} GROUP BY 1, 2`,
      params
    ),
  ]);

  return (
    <DashboardChrome
      title="Arkansas Voter Registration and Voter History"
      tabs={TABS}
      active="/reports/ar-vr-vh"
      controls={selectedCounty && <CountyClearLink county={selectedCounty} />}
    >
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-5">
          <Sheet title="Demographics">
            <DemographicsTable rows={demoRows} />
          </Sheet>
        </div>
        <div className="col-span-12 lg:col-span-3">
          <Sheet title="Voting Recency">
            <RecencyTable rows={recencyRows} />
          </Sheet>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <Sheet title="Party Voted">
            <PartyTable rows={partyRows} />
          </Sheet>
        </div>
        <div className="col-span-12">
          <Sheet title="County Map">
            <div className="px-3 pt-2 pb-1 text-xs text-stone-500">
              Click a county to filter the tables above. Click again or use the &ldquo;Clear&rdquo; link to reset.
            </div>
            <div className="px-3 pb-3">
              <CountyMap totals={countyTotals} selected={selectedCounty} />
            </div>
          </Sheet>
        </div>
      </div>
    </DashboardChrome>
  );
}

function DemographicsTable({ rows }: { rows: GenderAgeRow[] }) {
  const ageOrder = uniqueOrdered(rows.map((r) => r.age_segment));
  const genders = uniqueOrdered(rows.map((r) => r.gender));
  const cell = (a: string | null, g: string | null) =>
    rows.find((r) => r.age_segment === a && r.gender === g)?.records ?? 0;
  const colTotal = (g: string | null) =>
    rows.filter((r) => r.gender === g).reduce((s, r) => s + r.records, 0);
  const rowTotal = (a: string | null) =>
    rows.filter((r) => r.age_segment === a).reduce((s, r) => s + r.records, 0);
  const total = rows.reduce((s, r) => s + r.records, 0);
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="row-h">Age</th>
          {genders.map((g) => (
            <th key={g ?? "_"}>{g ?? "—"}</th>
          ))}
          <th className="total-col">Total</th>
        </tr>
      </thead>
      <tbody>
        {ageOrder.map((a) => (
          <tr key={a ?? "_"}>
            <td className="row-h">{a ?? "—"}</td>
            {genders.map((g) => (
              <td key={g ?? "_"}>{fmtInt(cell(a, g))}</td>
            ))}
            <td className="total-col">{fmtInt(rowTotal(a))}</td>
          </tr>
        ))}
        <tr className="total-row">
          <td className="row-h">Total</td>
          {genders.map((g) => (
            <td key={g ?? "_"}>{fmtInt(colTotal(g))}</td>
          ))}
          <td>{fmtInt(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function RecencyTable({ rows }: { rows: RecencyRow[] }) {
  const total = rows.reduce((s, r) => s + r.records, 0);
  const ordered = [...rows].sort((a, b) =>
    (a.voting_recency ?? "").localeCompare(b.voting_recency ?? "")
  );
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="row-h">Years</th>
          <th>Records</th>
          <th>Percent</th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((r) => {
          const pct = total ? r.records / total : 0;
          return (
            <tr key={r.voting_recency ?? "_"}>
              <td className="row-h">{r.voting_recency ?? "—"}</td>
              <td>{fmtInt(r.records)}</td>
              <BarCell text={total ? fmtPct1(pct) : ""} pct={pct} />
            </tr>
          );
        })}
        <tr className="total-row">
          <td className="row-h">Total</td>
          <td>{fmtInt(total)}</td>
          <td>{total ? fmtPct1(1) : ""}</td>
        </tr>
      </tbody>
    </table>
  );
}

function PartyTable({ rows }: { rows: PartyRow[] }) {
  const total = rows.reduce((s, r) => s + r.records, 0);
  const groups = new Map<string, PartyRow[]>();
  for (const r of rows) {
    const k = r.flg_dem ?? "—";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const dems = Array.from(groups.keys()).sort();
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="row-h">Democrat</th>
          <th className="row-h">Republican</th>
          <th>Records</th>
          <th>Percent</th>
        </tr>
      </thead>
      <tbody>
        {dems.flatMap((d) => {
          const inner = (groups.get(d) ?? []).sort((a, b) =>
            (a.flg_rep ?? "").localeCompare(b.flg_rep ?? "")
          );
          return inner.map((r, i) => {
            const pct = total ? r.records / total : 0;
            return (
              <tr key={`${d}-${r.flg_rep ?? "_"}`}>
                {i === 0 && <td className="row-h" rowSpan={inner.length}>{d}</td>}
                <td className="row-h">{r.flg_rep ?? "—"}</td>
                <td>{fmtInt(r.records)}</td>
                <BarCell text={total ? fmtPct1(pct) : ""} pct={pct} />
              </tr>
            );
          });
        })}
      </tbody>
    </table>
  );
}

function uniqueOrdered<T>(arr: T[]): T[] {
  return Array.from(new Set(arr)).sort((a, b) =>
    String(a ?? "").localeCompare(String(b ?? ""))
  );
}
