import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND_SCALE,
  brandCss,
  generateBrandScale,
  parseHex,
} from "@/lib/brand";

describe("parseHex", () => {
  it("parses 6-digit hex with and without leading #", () => {
    expect(parseHex("#751411")).toEqual({ r: 0x75, g: 0x14, b: 0x11 });
    expect(parseHex("751411")).toEqual({ r: 0x75, g: 0x14, b: 0x11 });
  });

  it("expands 3-digit hex", () => {
    expect(parseHex("#fa0")).toEqual({ r: 0xff, g: 0xaa, b: 0x00 });
  });

  it("returns null for garbage", () => {
    expect(parseHex("hello")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("")).toBeNull();
  });
});

describe("generateBrandScale", () => {
  it("falls back to the default palette when input is null", () => {
    expect(generateBrandScale(null)).toEqual(DEFAULT_BRAND_SCALE);
  });

  it("falls back to the default palette when input is invalid", () => {
    expect(generateBrandScale("not a color")).toEqual(DEFAULT_BRAND_SCALE);
  });

  it("returns 10 shades (50…900) for a valid hex", () => {
    const scale = generateBrandScale("#0066cc");
    expect(Object.keys(scale).sort()).toEqual([
      "100", "200", "300", "400", "50", "500", "600", "700", "800", "900",
    ]);
    for (const v of Object.values(scale)) {
      expect(v).toMatch(/^\d+ \d+ \d+$/);
    }
  });

  it("light shades are brighter than dark shades", () => {
    const scale = generateBrandScale("#751411");
    const sumRgb = (s: string) => s.split(" ").map(Number).reduce((a, b) => a + b, 0);
    expect(sumRgb(scale["50"])).toBeGreaterThan(sumRgb(scale["500"]));
    expect(sumRgb(scale["500"])).toBeGreaterThan(sumRgb(scale["900"]));
  });
});

describe("brandCss", () => {
  it("emits a :root block with all 10 variables", () => {
    const css = brandCss("#751411");
    for (const shade of ["50","100","200","300","400","500","600","700","800","900"]) {
      expect(css).toContain(`--brand-${shade}:`);
    }
    expect(css.trim().startsWith(":root {")).toBe(true);
  });
});
