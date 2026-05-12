export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct1(n: number | null | undefined): string {
  if (n == null) return "";
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtDec1(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toFixed(1);
}
