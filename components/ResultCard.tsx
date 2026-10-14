import Link from "next/link";

import { authorityTone, formatPeriod, languageName, shortHash } from "@/lib/format";
import type { SearchHit, Treatment } from "@/lib/types";

import { LimitationList } from "./LimitationList";

function provisionHref(uri: string, asOf: string, language: string): string {
  const p = new URLSearchParams({ uri, as_of: asOf, language });
  return `/provision?${p.toString()}`;
}

function TreatmentList({ items, title }: { items: Treatment[]; title: string }) {
  if (items.length === 0) return null;
  return (
    <details>
      <summary>
        {title} ({items.length})
      </summary>
      <ul>
        {items.map((t, i) => (
          <li key={i}>
            <strong>{t.relation}</strong> — {t.citing_citation}
            {t.date ? ` (${t.date})` : ""}
            {t.is_proposed ? " — proposed, not law" : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ResultCard({ hit, asOf }: { hit: SearchHit; asOf: string }) {
  const tone = authorityTone(hit.authority.category);
  const isProvision = hit.kind === "provision";
  const treatment = hit.treatment;
  const judicial = Array.isArray(treatment) ? treatment : (treatment?.judicial ?? []);
  const legislative = Array.isArray(treatment) ? [] : (treatment?.legislative ?? []);

  return (
    <article className="card" data-testid="result" aria-labelledby={`cite-${hit.passage_id}`}>
      <div className="card-head">
        <div>
          <p className="citation" id={`cite-${hit.passage_id}`}>
            {hit.rank}. {hit.citation}
          </p>
          <p className="meta">
            {hit.jurisdiction.name}
            {" · "}
            {hit.document.title}
            {" · "}
            {hit.document.type}
            {" · "}
            {languageName(hit.version.language)}
            {isProvision
              ? ` · ${formatPeriod(hit.version.valid_from, hit.version.valid_to, hit.version.valid_to_basis)}`
              : ` · ${hit.document.court} · decided ${hit.document.decision_date}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hit.jurisdiction.fictional && <span className="tag fictional">Fictional data</span>}
          <span className={`tag ${tone}`} title={hit.authority.rationale} data-testid="authority">
            {hit.authority.label}
          </span>
        </div>
      </div>

      <blockquote className="text" lang={hit.version.language} data-testid="exact-text">
        {hit.text}
      </blockquote>

      <LimitationList items={hit.limitations} />

      <details>
        <summary>Authority rationale</summary>
        <p>{hit.authority.rationale}</p>
      </details>

      <details>
        <summary>Source and provenance</summary>
        <dl className="kv">
          <dt>Source</dt>
          <dd>
            {hit.source.source_name} ({hit.source.source_authority})
          </dd>
          <dt>Licence</dt>
          <dd>
            {hit.source.licence_name} [{hit.source.licence_id}]
          </dd>
          {hit.source.attribution && (
            <>
              <dt>Attribution</dt>
              <dd>{hit.source.attribution}</dd>
            </>
          )}
          <dt>Expression</dt>
          <dd className="mono">{hit.version.expression_uri}</dd>
          <dt>Unit</dt>
          <dd className="mono">{hit.unit.uri}</dd>
          <dt>Source document</dt>
          <dd className="mono">
            {hit.source.external_id} ({hit.source.document_id})
          </dd>
          <dt>Document SHA-256</dt>
          <dd className="mono" title={hit.source.sha256}>
            {shortHash(hit.source.sha256)}
          </dd>
          <dt>Text SHA-256</dt>
          <dd className="mono" title={hit.text_sha256}>
            {shortHash(hit.text_sha256)}
          </dd>
          <dt>Locator</dt>
          <dd className="mono">{hit.source.locator}</dd>
          <dt>Retrieved</dt>
          <dd>{hit.source.retrieved_at}</dd>
        </dl>
      </details>

      {isProvision && hit.timeline && hit.timeline.length > 0 && (
        <details>
          <summary>Version timeline ({hit.timeline.length})</summary>
          <ol className="timeline">
            {hit.timeline.map((t) => (
              <li key={t.id} className={t.current_hit ? "selected" : undefined}>
                {t.status.replaceAll("_", " ")}: {formatPeriod(t.valid_from, t.valid_to, t.valid_to_basis)}
                {t.current_hit ? " (this result)" : ""}
              </li>
            ))}
          </ol>
          <Link href={provisionHref(hit.unit.uri, asOf, hit.version.language)}>
            Open point-in-time view
          </Link>
        </details>
      )}

      <TreatmentList items={judicial} title="Judicial treatment (indexed)" />
      <TreatmentList items={legislative} title="Legislative treatment (indexed)" />

      {hit.parallel_versions && hit.parallel_versions.length > 0 && (
        <details>
          <summary>Other language versions ({hit.parallel_versions.length})</summary>
          {hit.parallel_versions.map((p) => (
            <div key={p.version_id}>
              <p className="meta">
                {p.citation} · {languageName(p.language)} · {p.authoritative ? "authentic" : "not authentic"}
              </p>
              <blockquote className="text" lang={p.language}>
                {p.text}
              </blockquote>
            </div>
          ))}
        </details>
      )}

      <details>
        <summary>Ranking</summary>
        <p className="mono">
          final {hit.score.final} = lexical {hit.score.lexical} × authority {hit.score.authority_weight}
          {hit.score.matched_via === "concept_expansion" ? " × 0.8 (concept expansion)" : ""}
        </p>
      </details>
    </article>
  );
}
