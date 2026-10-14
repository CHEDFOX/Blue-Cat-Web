// Parsing and serialising the search form. Pure functions, unit-tested.

export interface SearchForm {
  q: string;
  jurisdiction: string;
  asOf: string;
  forumCourt: string;
  includeForeign: boolean;
  includeProposed: boolean;
  includeProspective: boolean;
  includeHistorical: boolean;
  limit: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Z]{2,3}(-[A-Z0-9]{1,8})*$/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseSearchForm(raw: RawParams): SearchForm {
  const asOf = first(raw.as_of);
  const jurisdiction = first(raw.jurisdiction);
  const forumCourt = first(raw.forum_court);
  const limit = Number.parseInt(first(raw.limit) || "10", 10);
  return {
    q: first(raw.q).slice(0, 500),
    jurisdiction: ID.test(jurisdiction) ? jurisdiction : "",
    asOf: ISO_DATE.test(asOf) ? asOf : "",
    forumCourt: ID.test(forumCourt) ? forumCourt : "",
    includeForeign: first(raw.include_foreign) === "on",
    includeProposed: first(raw.include_proposed) === "on",
    includeProspective: first(raw.include_prospective) === "on",
    includeHistorical: first(raw.include_historical) === "on",
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
  };
}

export function buildSearchParams(form: SearchForm): URLSearchParams {
  const p = new URLSearchParams({ q: form.q, limit: String(form.limit) });
  if (form.jurisdiction) p.set("jurisdiction", form.jurisdiction);
  if (form.asOf) p.set("as_of", form.asOf);
  if (form.forumCourt) p.set("forum_court", form.forumCourt);
  if (form.includeForeign) p.set("include_foreign", "true");
  if (form.includeProposed) p.set("include_proposed", "true");
  if (form.includeProspective) p.set("include_prospective", "true");
  if (form.includeHistorical) p.set("include_historical", "true");
  return p;
}
