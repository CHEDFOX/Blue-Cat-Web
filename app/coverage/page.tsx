import { ApiError, api } from "@/lib/api";
import type { CoverageEntry, SourceDescriptor } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  let coverage: CoverageEntry[] = [];
  let sources: SourceDescriptor[] = [];
  let error: string | null = null;
  try {
    [coverage, sources] = await Promise.all([api.coverage(), api.sources()]);
  } catch (e) {
    error = e instanceof ApiError ? e.message : "The research service is unavailable.";
  }

  return (
    <>
      <h1>Coverage &amp; sources</h1>
      <p className="lede">
        What is actually indexed, per jurisdiction, and which sources may be ingested. A jurisdiction listed here is not
        necessarily covered.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <h2>Jurisdictions</h2>
      <div className="table-wrap">
        <table data-testid="coverage-table">
          <thead>
            <tr>
              <th>Jurisdiction</th>
              <th>Profile</th>
              <th>Corpus</th>
              <th>Instruments</th>
              <th>Judgments</th>
              <th>Languages</th>
              <th>Known gaps</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((c) => (
              <tr key={c.jurisdiction} data-jurisdiction={c.jurisdiction}>
                <td>
                  <strong>{c.jurisdiction}</strong> {c.name}
                  {c.fictional && (
                    <>
                      {" "}
                      <span className="tag fictional">Fictional</span>
                    </>
                  )}
                </td>
                <td>
                  v{c.profile_version} · {c.profile_verification.replaceAll("_", " ")}
                </td>
                <td>{c.corpus_status.replaceAll("_", " ")}</td>
                <td>{c.instruments}</td>
                <td>{c.judgments}</td>
                <td>{c.indexed_languages.join(", ") || "—"}</td>
                <td>{c.known_gaps.join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Source register</h2>
      <div className="table-wrap">
        <table data-testid="sources-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Jurisdictions</th>
              <th>Status</th>
              <th>Licence</th>
              <th>Review</th>
              <th>Automated processing</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} data-source={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  <br />
                  <span className="meta">{s.publisher}</span>
                </td>
                <td>{s.jurisdictions.join(", ")}</td>
                <td>{s.status}</td>
                <td>{s.licence.name}</td>
                <td>{s.licence.review_status.replaceAll("_", " ")}</td>
                <td>{s.licence.automated_processing.replaceAll("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">Licence entries for real sources are preliminary research notes pending legal review.</p>
    </>
  );
}
