"use client";

import { useRouter, usePathname } from "next/navigation";
import { useMemo } from "react";
import { Choropleth, ColorLegend } from "@/components/reports/Choropleth";
import { fmtInt } from "@/lib/report-format";

export function CountyMap({
  totals,
  selected,
}: {
  totals: { county: string; records: number }[];
  selected: string | null;
}) {
  const router = useRouter();
  const path = usePathname();

  const valuesByCounty = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of totals) m[r.county.toUpperCase()] = r.records;
    return m;
  }, [totals]);

  const max = useMemo(
    () => Math.max(0, ...Object.values(valuesByCounty)),
    [valuesByCounty]
  );

  return (
    <div className="flex flex-col md:flex-row gap-4 items-stretch">
      <div className="flex-1">
        <Choropleth
          topojsonUrl="/geo/ar-counties-topo.json"
          values={valuesByCounty}
          featureKey={(p) => String(p.name ?? "").toUpperCase()}
          tooltip={(p, v) => `${p.name}\nRecords: ${fmtInt(v ?? 0)}`}
          selected={selected}
          onClick={(key) => {
            if (selected === key) {
              router.push(path);
            } else {
              router.push(`${path}?county=${encodeURIComponent(key)}`);
            }
          }}
          center={[-92.4, 34.8]}
          scale={6500}
          aspect={0.55}
        />
      </div>
      <div className="w-full md:w-48 flex flex-col justify-end">
        <ColorLegend max={max} label="Records" format={(v) => fmtInt(Math.round(v))} />
      </div>
    </div>
  );
}
