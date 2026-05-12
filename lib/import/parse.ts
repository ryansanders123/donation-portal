import Papa from "papaparse";
import type { RawRow } from "./types";

export type ParseResult = {
  headers: string[];
  rows: RawRow[];
  delimiter: string;
};

// Parses a CSV string into raw header/row pairs. Handles delimiter
// sniffing (comma/tab/semicolon), BOM stripping, and embedded quotes.
// Empty cells become "".
export function parseCsv(text: string): ParseResult {
  // Strip UTF-8 BOM that some Excel exports prepend.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
    dynamicTyping: false,
  });

  if (result.errors.length) {
    // PapaParse logs row-level issues; fail loudly only when no rows came back.
    if (result.data.length === 0) {
      throw new Error(`CSV parse error: ${result.errors[0].message}`);
    }
  }

  const headers = result.meta.fields ?? [];
  const delimiter = result.meta.delimiter ?? ",";
  return { headers, rows: result.data, delimiter };
}
