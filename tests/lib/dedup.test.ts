import { describe, expect, it } from "vitest";
import { canonicalPair } from "@/lib/dedup";

describe("canonicalPair", () => {
  it("returns the lexicographically smaller id as 'a'", () => {
    expect(canonicalPair("aaa", "bbb")).toEqual({ a: "aaa", b: "bbb" });
    expect(canonicalPair("bbb", "aaa")).toEqual({ a: "aaa", b: "bbb" });
  });

  it("is stable when both arguments are equal", () => {
    expect(canonicalPair("x", "x")).toEqual({ a: "x", b: "x" });
  });

  it("treats UUIDs lexicographically (matches SQL CHECK a < b)", () => {
    const u1 = "00000000-0000-0000-0000-000000000001";
    const u2 = "00000000-0000-0000-0000-000000000002";
    expect(canonicalPair(u2, u1)).toEqual({ a: u1, b: u2 });
  });
});
