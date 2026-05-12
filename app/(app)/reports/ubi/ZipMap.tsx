"use client";

import { useMemo } from "react";
import { Choropleth, ColorLegend } from "@/components/reports/Choropleth";
import { fmtDec1 } from "@/lib/report-format";

export function ZipMap({
  rows,
}: {
  rows: { zip: string; avg_ubi: number; households: number }[];
}) {
  const valuesByZip = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.zip] = r.avg_ubi;
    return m;
  }, [rows]);

  const max = useMemo(
    () => Math.max(0, ...Object.values(valuesByZip)),
    [valuesByZip]
  );

  return (
    <div className="flex flex-col md:flex-row gap-4 items-stretch">
      <div className="flex-1">
        <Choropleth
          topojsonUrl="/geo/ar-zips-topo.json"
          values={valuesByZip}
          featureKey={(p) => String(p.ZCTA5CE10 ?? "")}
          tooltip={(p, v) => `ZIP ${p.ZCTA5CE10}\nAvg. UBI: ${v == null ? "—" : fmtDec1(v)}`}
          center={[-92.4, 34.8]}
          scale={6500}
          aspect={0.55}
        />
      </div>
      <div className="w-full md:w-48 flex flex-col justify-end">
        <ColorLegend max={max} label="Avg. UBI" format={(v) => fmtDec1(v)} />
      </div>
    </div>
  );
}
