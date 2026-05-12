import { describe, expect, it } from "vitest";
import { hasFeature } from "@/lib/org-context";
import type { Organization } from "@/lib/org-context";

function org(features: Partial<Organization["features"]>): Organization {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug: "test",
    name: "Test",
    logo_url: null,
    favicon_url: null,
    primary_color: null,
    tagline: null,
    support_email: null,
    mailing_address: null,
    tax_statement_text: null,
    features,
    created_at: new Date().toISOString(),
  };
}

describe("hasFeature", () => {
  it("returns true when org is null (no scoping yet)", () => {
    expect(hasFeature(null, "campaigns")).toBe(true);
  });

  it("returns true when the feature key is missing (default-on)", () => {
    expect(hasFeature(org({}), "campaigns")).toBe(true);
    expect(hasFeature(org({ appeals: true }), "campaigns")).toBe(true);
  });

  it("returns true when explicitly true", () => {
    expect(hasFeature(org({ campaigns: true }), "campaigns")).toBe(true);
  });

  it("returns false only when explicitly false", () => {
    expect(hasFeature(org({ campaigns: false }), "campaigns")).toBe(false);
    expect(hasFeature(org({ tax_summary: false }), "tax_summary")).toBe(false);
  });

  it("independent flags do not affect each other", () => {
    const o = org({ campaigns: false, appeals: true });
    expect(hasFeature(o, "campaigns")).toBe(false);
    expect(hasFeature(o, "appeals")).toBe(true);
    expect(hasFeature(o, "tax_summary")).toBe(true); // default-on
  });
});
