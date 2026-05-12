"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { scaleSequential } from "d3-scale";
import { interpolateReds } from "d3-scale-chromatic";

type Props = {
  topojsonUrl: string;
  values: Record<string, number>;
  featureKey: (props: Record<string, unknown>) => string;
  tooltip: (props: Record<string, unknown>, value: number | undefined) => string;
  onClick?: (key: string) => void;
  selected?: string | null;
  center?: [number, number];
  scale?: number;
  aspect?: number;
};

export function Choropleth({
  topojsonUrl,
  values,
  featureKey,
  tooltip,
  onClick,
  selected,
  center = [-92.4, 34.8],
  scale = 4500,
  aspect = 0.6,
}: Props) {
  const [hoverText, setHoverText] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const max = useMemo(() => {
    const vs = Object.values(values).filter((v) => v != null);
    return vs.length ? Math.max(...vs) : 1;
  }, [values]);

  const color = useMemo(
    () => scaleSequential(interpolateReds).domain([0, max || 1]),
    [max]
  );

  return (
    <div className="relative w-full h-full">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale, center }}
        width={800}
        height={800 * aspect}
        style={{ width: "100%", height: "auto", background: "#fbf7f5", borderRadius: 12 }}
      >
        <Geographies geography={topojsonUrl}>
          {({ geographies }: { geographies: Array<{ rsmKey: string; properties: Record<string, unknown> }> }) =>
            geographies.map((geo) => {
              const key = featureKey(geo.properties);
              const v = values[key];
              const fill = v == null ? "#f5e6e6" : color(v);
              const isSel = selected === key;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke={isSel ? "#751411" : "#ffffff"}
                  strokeWidth={isSel ? 1.6 : 0.5}
                  style={{
                    default: { outline: "none", transition: "fill 0.15s ease, stroke 0.15s ease" },
                    hover: { outline: "none", stroke: "#751411", strokeWidth: 1.2, cursor: onClick ? "pointer" : "default", filter: "brightness(1.04)" },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={() => setHoverText(tooltip(geo.properties, v))}
                  onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => {
                    setHoverText(null);
                    setPos(null);
                  }}
                  onClick={() => onClick?.(key)}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {hoverText && pos && (
        <div
          className="fixed pointer-events-none z-50 bg-stone-900/95 text-white text-[11.5px] rounded-md px-2.5 py-1.5 shadow-lg backdrop-blur-sm border border-white/10"
          style={{ left: pos.x + 14, top: pos.y + 14 }}
        >
          {hoverText.split("\n").map((line, i) => (
            <div key={i} className={i === 0 ? "font-semibold mb-0.5" : "text-white/80"}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ColorLegend({
  max,
  label,
  format,
}: {
  max: number;
  label: string;
  format: (v: number) => string;
}) {
  const color = scaleSequential(interpolateReds).domain([0, max || 1]);
  const stops = Array.from({ length: 16 }, (_, i) => i / 15);
  return (
    <div className="card p-3 text-[11px]">
      <div className="font-semibold text-stone-500 uppercase tracking-[0.14em] text-[10px] mb-2">{label}</div>
      <div className="flex h-2.5 w-full rounded-full overflow-hidden ring-1 ring-stone-200">
        {stops.map((s, i) => (
          <div key={i} className="flex-1" style={{ background: color(s * max) }} />
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-stone-500 tabular-nums">
        <span>0</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
