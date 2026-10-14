import Link from "next/link";

import { LimitationList } from "@/components/LimitationList";
import { ResultCard } from "@/components/ResultCard";
import { ApiError, api } from "@/lib/api";
import { parseSearchForm } from "@/lib/search-params";
import type { JurisdictionSummary, SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function depth(j: JurisdictionSummary, all: Map<string, JurisdictionSummary>): number {
  let d = 0;
  let parent = j.parent;
  while (parent && all.has(parent)) {
    d += 1;
    parent = all.get(parent)?.parent ?? null;
  }
  return d;
}

export default async function SearchPage({ searchParams }: Props) {
  const form = parseSearchForm(await searchParams);
  let jurisdictions: JurisdictionSummary[] = [];
  let result: SearchResponse | null = null;
  let error: string | null = null;

  try {
    jurisdictions = (await api.jurisdictions()).jurisdictions;
    if (form.q) result = await api.search(form);
  } catch (e) {
    error = e instanceof ApiError ? `The research service rejected the request: ${e.message}` : "The research service is unavailable.";
  }

  const byId = new Map(jurisdictions.map((j) => [j.id, j]));
  const ordered = [...jurisdictions].sort((a, b) => a.id.localeCompare(b.id));
  const courts = jurisdictions.flatMap((j) => j.courts.map((c) => ({ ...c, jurisdiction: j.id })));

  return (
    <>
      <aside className="cta" aria-label="Research assistant">
        <div>
          <strong>New: research assistant (early access)</strong>
          <p className="meta">
            Describe a case and get guidance that cites only retrieved authorities, with every quote re-checked.
          </p>
        </div>
        <Link className="button-link" href="/research">
          Open the research assistant
        </Link>
      </aside>

      <h1>Legal research</h1>
      <p className="lede">
        Search primary sources as they stood on a given date, filtered by jurisdiction, with exact citations and
        their limitations.
      </p>

      <form className="search" method="get" action="/" role="search">
        <label>
          Question or keywords
          <input type="search" name="q" defaultValue={form.q} required maxLength={500} placeholder="e.g. how long may personal data be retained" />
        </label>
        <div className="row">
          <label>
            Jurisdiction
            <select name="jurisdiction" defaultValue={form.jurisdiction}>
              <option value="">Not specified (compare all)</option>
              {ordered.map((j) => (
                <option key={j.id} value={j.id}>
                  {"  ".repeat(depth(j, byId))}
                  {j.id} — {j.name}
                  {j.corpus_status === "none" ? " (no corpus)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Law as of
            <input type="date" name="as_of" defaultValue={form.asOf} />
          </label>
          <label>
            Question language
            <select name="query_language" defaultValue={form.queryLanguage}>
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="any">Any (wider cross-lingual matching)</option>
            </select>
          </label>
          <label>
            Forum court (optional)
            <select name="forum_court" defaultValue={form.forumCourt}>
              <option value="">Not specified</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.jurisdiction})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="checks">
          <label>
            <input type="checkbox" name="include_foreign" defaultChecked={form.includeForeign} /> Include foreign law
          </label>
          <label>
            <input type="checkbox" name="include_proposed" defaultChecked={form.includeProposed} /> Include bills
          </label>
          <label>
            <input type="checkbox" name="include_prospective" defaultChecked={form.includeProspective} /> Include
            provisions not yet in force
          </label>
          <label>
            <input type="checkbox" name="include_historical" defaultChecked={form.includeHistorical} /> Include all
            historical versions
          </label>
        </div>
        <button className="primary" type="submit">
          Search
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section aria-label="Results">
          <div className="summary" data-testid="summary">
            <span>
              {result.results.length} result{result.results.length === 1 ? "" : "s"} ({result.total_candidates}{" "}
              candidates)
            </span>
            <span>Law as of {result.query.as_of}{result.query.as_of_defaulted ? " (today; no date given)" : ""}</span>
            {result.scope.target && <span>Scope: {result.scope.chain.join(" → ")}</span>}
            {result.scope.treaties.length > 0 && <span>Treaties: {result.scope.treaties.join("; ")}</span>}
          </div>

          <LimitationList items={result.limitations} label="Search-wide limitations" />

          {result.clarifications.map((c) => (
            <p key={c.field} className="error" role="status">
              Clarification needed: {c.reason} Candidates in these results: {c.options.join(", ") || "none"}.
            </p>
          ))}

          {result.query_expansions.length > 0 && (
            <details>
              <summary>Query expanded with curated concept labels</summary>
              <ul>
                {result.query_expansions.map((e) => (
                  <li key={e.concept}>
                    <strong>{e.concept}</strong>:{" "}
                    {Object.entries(e.labels)
                      .map(([lang, labels]) => `${lang}: ${labels.join(", ")}`)
                      .join(" · ")}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {result.results.length === 0 ? (
            <p className="empty">No indexed authorities matched. This is not evidence that no law applies.</p>
          ) : (
            result.results.map((hit) => <ResultCard key={hit.passage_id} hit={hit} asOf={result.query.as_of} />)
          )}

          <h2>Coverage of the jurisdictions involved</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Jurisdiction</th>
                  <th>Corpus</th>
                  <th>Instruments</th>
                  <th>Judgments</th>
                  <th>Known gaps</th>
                </tr>
              </thead>
              <tbody>
                {result.coverage.map((c) => (
                  <tr key={c.jurisdiction}>
                    <td>
                      {c.jurisdiction} — {c.name}
                    </td>
                    <td>{c.corpus_status}</td>
                    <td>{c.instruments}</td>
                    <td>{c.judgments}</td>
                    <td>{c.known_gaps.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta">{result.disclaimer}</p>
        </section>
      )}
    </>
  );
}
