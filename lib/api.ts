// Server-side API client. Imported only from server components, so the API key never
// reaches the browser bundle.
import "server-only";

import type {
  CoverageEntry,
  JurisdictionSummary,
  ProvisionResponse,
  SearchResponse,
  SourceDescriptor,
} from "./types";
import { buildSearchParams, type SearchForm } from "./search-params";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function baseUrl(): string {
  return (process.env.ULIS_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

async function get<T>(path: string, params?: URLSearchParams): Promise<T> {
  const url = `${baseUrl()}${path}${params && params.toString() ? `?${params.toString()}` : ""}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.ULIS_API_KEY) headers["X-API-Key"] = process.env.ULIS_API_KEY;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  jurisdictions: () => get<{ jurisdictions: JurisdictionSummary[] }>("/v1/jurisdictions"),
  search: (form: SearchForm) => get<SearchResponse>("/v1/search", buildSearchParams(form)),
  provision: (uri: string, asOf?: string, language?: string) => {
    const p = new URLSearchParams({ uri });
    if (asOf) p.set("as_of", asOf);
    if (language) p.set("language", language);
    return get<ProvisionResponse>("/v1/provisions", p);
  },
  coverage: () => get<CoverageEntry[]>("/v1/coverage"),
  sources: () => get<SourceDescriptor[]>("/v1/sources"),
};
