import { describe, expect, it } from "vitest";

import { authorityTone, countBySeverity, formatPeriod, shortHash, sortLimitations } from "@/lib/format";
import { buildSearchParams, parseSearchForm } from "@/lib/search-params";
import type { Limitation } from "@/lib/types";

describe("parseSearchForm", () => {
  it("parses and normalises a full form", () => {
    const form = parseSearchForm({
      q: "  retain personal data ",
      jurisdiction: "XA-NP",
      as_of: "2020-06-01",
      forum_court: "XA-NP-DC",
      include_foreign: "on",
      include_proposed: "on",
      limit: "20",
    });
    expect(form).toEqual({
      q: "retain personal data",
      jurisdiction: "XA-NP",
      asOf: "2020-06-01",
      forumCourt: "XA-NP-DC",
      includeForeign: true,
      includeProposed: true,
      includeProspective: false,
      includeHistorical: false,
      queryLanguage: "en",
      limit: 20,
    });
  });

  it("drops malformed values instead of forwarding them", () => {
    const form = parseSearchForm({ q: "x".repeat(900), jurisdiction: "xa'; drop", as_of: "01/06/2020", limit: "9999" });
    expect(form.q).toHaveLength(500);
    expect(form.jurisdiction).toBe("");
    expect(form.asOf).toBe("");
    expect(form.limit).toBe(50);
  });

  it("takes the first value of repeated parameters", () => {
    expect(parseSearchForm({ q: ["a", "b"] }).q).toBe("a");
  });
});

describe("buildSearchParams", () => {
  it("only sends set options", () => {
    const p = buildSearchParams(parseSearchForm({ q: "privacy" }));
    expect(p.toString()).toBe("q=privacy&limit=10&query_language=en");
    const anyLang = buildSearchParams(parseSearchForm({ q: "privacy", query_language: "any" }));
    expect(anyLang.has("query_language")).toBe(false);
    const full = buildSearchParams(
      parseSearchForm({ q: "privacy", jurisdiction: "XB", as_of: "2024-01-01", include_historical: "on" }),
    );
    expect(Object.fromEntries(full)).toEqual({
      q: "privacy",
      limit: "10",
      jurisdiction: "XB",
      as_of: "2024-01-01",
      include_historical: "true",
      query_language: "en",
    });
  });
});

describe("format helpers", () => {
  const items: Limitation[] = [
    { code: "VERSION_PERIOD", severity: "info", message: "" },
    { code: "LATER_VERSION_EXISTS", severity: "warning", message: "" },
    { code: "FICTIONAL_DATA", severity: "critical", message: "" },
    { code: "CITATOR_COVERAGE", severity: "warning", message: "" },
  ];

  it("orders limitations by severity then code", () => {
    expect(sortLimitations(items).map((l) => l.code)).toEqual([
      "FICTIONAL_DATA",
      "CITATOR_COVERAGE",
      "LATER_VERSION_EXISTS",
      "VERSION_PERIOD",
    ]);
    expect(countBySeverity(items)).toEqual({ critical: 1, warning: 2, info: 1 });
  });

  it("formats validity periods and marks derived end dates", () => {
    expect(formatPeriod("2015-07-01", "2022-01-01", "derived")).toBe("2015-07-01 → 2022-01-01 (derived)");
    expect(formatPeriod("2022-01-01", null)).toBe("2022-01-01 → open");
    expect(formatPeriod(null, null)).toBe("no commencement recorded");
  });

  it("maps authority categories to tones", () => {
    expect(authorityTone("binding_legislation")).toBe("binding");
    expect(authorityTone("treaty_obligation")).toBe("qualified");
    expect(authorityTone("foreign")).toBe("not-binding");
    expect(authorityTone("proposed")).toBe("not-binding");
  });

  it("shortens hashes", () => {
    expect(shortHash("a".repeat(64))).toBe(`${"a".repeat(12)}…`);
  });
});
