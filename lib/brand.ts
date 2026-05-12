// Generate a 50–900 brand-color scale from a single hex input. The
// app injects this as :root CSS variables (--brand-50 through
// --brand-900) and Tailwind resolves `bg-brand-600` / `text-brand-700`
// against them, so each org sees its own palette without us shipping a
// separate stylesheet per tenant.
//
// Output values are `"r g b"` triples (no commas, no rgb() wrapper) —
// the format Tailwind's `rgb(var(--brand-700) / <alpha-value>)` syntax
// expects.

const SHADE_LIGHTNESS: Record<string, number> = {
  "50":  96,
  "100": 91,
  "200": 84,
  "300": 73,
  "400": 60,
  "500": 48,
  "600": 38,
  "700": 28,  // original "primary" lands here when input is mid-tone
  "800": 22,
  "900": 17,
};

const SHADE_SATURATION_FACTOR: Record<string, number> = {
  "50":  0.45,
  "100": 0.55,
  "200": 0.65,
  "300": 0.75,
  "400": 0.85,
  "500": 0.95,
  "600": 1.0,
  "700": 1.0,
  "800": 1.0,
  "900": 0.95,
};

// Default fallback palette — matches the existing tailwind.config.ts
// burgundy. Used when the active org has no primary_color set, or for
// anonymous routes (login page, errors) that don't have an org context.
export const DEFAULT_BRAND_SCALE: Record<string, string> = {
  "50":  "251 245 245",
  "100": "245 230 230",
  "200": "232 200 200",
  "300": "213 163 163",
  "400": "189 121 120",
  "500": "161 85 84",
  "600": "135 61 59",
  "700": "117 20 17",
  "800": "96 17 16",
  "900": "80 15 14",
};

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = ((bn - rn) / d + 2); break;
      case bn: h = ((rn - gn) / d + 4); break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const conv = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(conv(hh + 1 / 3) * 255),
    g: Math.round(conv(hh) * 255),
    b: Math.round(conv(hh - 1 / 3) * 255),
  };
}

export function generateBrandScale(hex: string | null | undefined): Record<string, string> {
  if (!hex) return DEFAULT_BRAND_SCALE;
  const rgb = parseHex(hex);
  if (!rgb) return DEFAULT_BRAND_SCALE;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  // Keep the hue stable; modulate lightness across the scale and dampen
  // saturation at the bright end so the tints don't look neon.
  const out: Record<string, string> = {};
  for (const shade of Object.keys(SHADE_LIGHTNESS)) {
    const l = SHADE_LIGHTNESS[shade];
    const s = hsl.s * (SHADE_SATURATION_FACTOR[shade] ?? 1);
    const c = hslToRgb(hsl.h, s, l);
    out[shade] = `${c.r} ${c.g} ${c.b}`;
  }
  return out;
}

// CSS that sets every --brand-N variable on :root. Embed in <head>
// so it applies before any Tailwind brand-* class renders.
export function brandCss(primaryColor: string | null | undefined): string {
  const scale = generateBrandScale(primaryColor);
  const lines = Object.entries(scale).map(([k, v]) => `  --brand-${k}: ${v};`);
  return `:root {\n${lines.join("\n")}\n}`;
}
