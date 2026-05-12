import { describe, expect, it } from "vitest";
import { parseCsv } from "../parse";

describe("parseCsv", () => {
  it("parses a basic comma CSV with header", () => {
    const text = "name,amount\nAlice,100\nBob,200";
    const r = parseCsv(text);
    expect(r.headers).toEqual(["name", "amount"]);
    expect(r.rows).toEqual([
      { name: "Alice", amount: "100" },
      { name: "Bob", amount: "200" },
    ]);
    expect(r.delimiter).toBe(",");
  });

  it("strips a UTF-8 BOM that Excel exports", () => {
    const text = "﻿name,amount\nAlice,100";
    const r = parseCsv(text);
    expect(r.headers).toEqual(["name", "amount"]);
    expect(r.rows[0].name).toBe("Alice");
  });

  it("handles quoted values containing commas", () => {
    const text = 'name,note\n"Smith, John","gift, in honor of mom"';
    const r = parseCsv(text);
    expect(r.rows[0].name).toBe("Smith, John");
    expect(r.rows[0].note).toBe("gift, in honor of mom");
  });

  it("skips blank lines", () => {
    const text = "name,amount\n\nAlice,100\n\n\nBob,200\n";
    const r = parseCsv(text);
    expect(r.rows.length).toBe(2);
  });

  it("trims whitespace from headers and values", () => {
    const text = "  name  , amount \n  Alice  ,  100  ";
    const r = parseCsv(text);
    expect(r.headers).toEqual(["name", "amount"]);
    expect(r.rows[0]).toEqual({ name: "Alice", amount: "100" });
  });

  it("sniffs tab delimiters", () => {
    const text = "name\tamount\nAlice\t100";
    const r = parseCsv(text);
    expect(r.delimiter).toBe("\t");
    expect(r.headers).toEqual(["name", "amount"]);
  });
});
