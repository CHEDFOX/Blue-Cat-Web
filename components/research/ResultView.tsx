"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LimitationList } from "@/components/LimitationList";
import { formatPeriod } from "@/lib/format";
import {
  CONFIDENCE_HELP,
  RETENTION_NOTE,
  formatMarkdown,
  formatPlainText,
  issueTitle,
  numberAuthorities,
  provisionHref,
  removedClaimsMessage,
  safeUrl,
} from "@/lib/research";
import type { Confidence, ResearchAuthority, ResearchJob, ResearchResult } from "@/lib/types";

/** The always-visible disclaimer: the backend's text, prefixed only if it does not already say so. */
function disclaimerText(d: string): string {
  return /not legal advice/i.test(d) ? d : `Research aid, not legal advice. ${d}`;
}

function ConfidenceBadge({ level }: { level: Confidence }) {
  return (
    <span className={`badge conf-${level}`} data-testid="confidence" title={CONFIDENCE_HELP[level]}>
      Confidence: {level}
    </span>
  );
}

function AuthorityBody({ a, asOf }: { a: ResearchAuthority; asOf: string | null }) {
  const href = provisionHref(a, asOf);
  const url = safeUrl(a.source.url);
  return (
    <>
      <p className="meta">
        {a.authority_label}
        {a.jurisdiction ? ` · ${a.jurisdiction}` : ""}
        {a.kind === "judgment_paragraph" ? " · judgment paragraph" : " · provision"}
      </p>
      {!a.verified && (
        <p className="error" role="alert">
          This quote could not be verified against the stored text. Do not rely on it.
        </p>
      )}
      <blockquote className="text" data-testid="authority-text">
        {a.text || "(no text returned)"}
      </blockquote>
      <LimitationList items={a.limitations} label={`Limitations of ${a.citation}`} />
      <dl className="kv">
        <dt>Valid</dt>
        <dd>{formatPeriod(a.valid_from, a.valid_to)}</dd>
        <dt>Text SHA-256</dt>
        <dd className="mono" data-testid="authority-hash">
          {a.text_sha256 || "(not provided)"}
        </dd>
        <dt>Source</dt>
        <dd>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer">
              {a.source.name || url}
            </a>
          ) : (
            a.source.name || "(no source link)"
          )}
          {a.source.attribution ? ` — ${a.source.attribution}` : ""}
        </dd>
        <dt>Verified</dt>
        <dd>{a.verified ? "Quote re-read from the stored text by the verifier" : "No"}</dd>
      </dl>
      {href && (
        <p>
          <Link href={href}>Open in the point-in-time view</Link>
        </p>
      )}
    </>
  );
}

function IssueView({ result, index, asOf }: { result: ResearchResult; index: number; asOf: string | null }) {
  const issue = result.guidance.issues[index]!;
  const nums = numberAuthorities(result);
  const byId = new Map(result.authorities.map((a) => [a.id, a]));
  const [open, setOpen] = useState<{ ri: number; id: string } | null>(null);
  const title = issueTitle(result, issue.issue_id);
  const area = result.understanding.issues.find((i) => i.id === issue.issue_id)?.area_of_law;

  return (
    <article className="card" aria-labelledby={`issue-${index}`} data-testid="guidance-issue">
      <div className="card-head">
        <h3 id={`issue-${index}`}>{title}</h3>
        <ConfidenceBadge level={issue.confidence} />
      </div>
      {area && <p className="meta">{area}</p>}
      <p className="conclusion">{issue.conclusion}</p>
      <p className={`conf-note conf-${issue.confidence}`}>{CONFIDENCE_HELP[issue.confidence]}</p>

      <h4>Reasoning</h4>
      <ul className="reasoning">
        {issue.reasoning.map((r, ri) => {
          const openHere = open?.ri === ri ? byId.get(open.id) : undefined;
          const panelId = `panel-${index}-${ri}`;
          return (
            <li key={ri}>
              <p>{r.text}</p>
              {r.authority_ids.length === 0 && <p className="meta">No authority is cited for this statement.</p>}
              <div className="chips">
                {r.authority_ids.map((id) => {
                  const a = byId.get(id);
                  if (!a) {
                    return (
                      <span key={id} className="chip unresolved" data-testid="citation-unresolved">
                        Unresolved citation
                      </span>
                    );
                  }
                  const expanded = open?.ri === ri && open.id === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`chip${a.verified ? "" : " unverified"}`}
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      data-testid="citation-chip"
                      onClick={() => setOpen(expanded ? null : { ri, id })}
                    >
                      <span className="num">[{nums.get(id)}]</span> {a.citation}
                      {a.verified ? "" : " (unverified)"}
                    </button>
                  );
                })}
              </div>
              <div id={panelId}>
                {openHere && (
                  <section className="panel" role="region" aria-label={`Authority: ${openHere.citation}`} data-testid="authority-panel">
                    <div className="card-head">
                      <p className="citation">{openHere.citation}</p>
                      <button type="button" onClick={() => setOpen(null)}>
                        Close
                      </button>
                    </div>
                    <AuthorityBody a={openHere} asOf={asOf} />
                  </section>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {issue.uncertainties.length > 0 && (
        <>
          <h4>Uncertainties</h4>
          <ul data-testid="uncertainties">
            {issue.uncertainties.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

export function ResultView({ job, result, mock }: { job: ResearchJob; result: ResearchResult; mock: boolean }) {
  const [copied, setCopied] = useState<string>("");
  const [expandAll, setExpandAll] = useState(false);
  const u = result.understanding;
  const nums = numberAuthorities(result);
  const removed = removedClaimsMessage(result.removed_claims);
  const uncovered = u.jurisdictions.filter((j) => !j.covered);
  const meta = { jobId: job.id, createdAt: job.created_at, expiresAt: job.expires_at };

  useEffect(() => {
    const before = () => setExpandAll(true);
    const after = () => setExpandAll(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  async function copy(kind: "markdown" | "text") {
    const text = kind === "markdown" ? formatMarkdown(result, meta) : formatPlainText(result, meta);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        setCopied("Copy failed. Select the text manually or use Print.");
        document.body.removeChild(ta);
        return;
      }
      document.body.removeChild(ta);
    }
    setCopied(kind === "markdown" ? "Copied as Markdown." : "Copied as text.");
  }

  function print() {
    setExpandAll(true);
    // Let React render the expanded sections before the print dialog freezes the page.
    setTimeout(() => {
      window.print();
    }, 50);
  }

  return (
    <div data-testid="result">
      {mock && (
        <p className="error" role="note">
          Mock mode: this result is scripted test data about a fictional jurisdiction.
        </p>
      )}
      <aside className="disclaimer" data-testid="disclaimer" aria-label="Disclaimer">
        {disclaimerText(result.disclaimer)}
      </aside>

      <div className="toolbar no-print" role="toolbar" aria-label="Export">
        <button type="button" onClick={() => copy("markdown")}>
          Copy as Markdown
        </button>
        <button type="button" onClick={() => copy("text")}>
          Copy as text
        </button>
        <button type="button" onClick={print}>
          Print
        </button>
        <span role="status" aria-live="polite" className="meta" data-testid="copy-status">
          {copied}
        </span>
      </div>
      <p className="meta">
        {RETENTION_NOTE}
        {job.expires_at ? ` This result expires ${job.expires_at}.` : ""}
      </p>

      <section aria-label="Verification and coverage" data-testid="verification">
        {removed ? (
          <p className="removed" role="note" data-testid="removed-claims">
            {removed} The remaining statements below were checked against the stored text.
          </p>
        ) : (
          <p className="meta" data-testid="removed-claims">
            The verifier removed no statements.
          </p>
        )}
        {result.coverage_notes.length > 0 && (
          <div data-testid="coverage-notes">
            <h3>Coverage notes</h3>
            <ul className="limits">
              {result.coverage_notes.map((n, i) => (
                <li key={i} className="warning">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}
        <LimitationList items={result.limitations} label="Result-wide limitations" />
      </section>

      <section aria-labelledby="understanding-h">
        <h2 id="understanding-h">Understanding of the case</h2>
        <p>{u.summary}</p>
        {u.as_of && <p className="meta">Law as of {u.as_of}</p>}
        {u.facts.length > 0 && (
          <>
            <h3>Facts relied on</h3>
            <ul>
              {u.facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </>
        )}
        {u.jurisdictions.length > 0 && (
          <>
            <h3>Jurisdictions</h3>
            <ul className="limits" data-testid="jurisdictions">
              {u.jurisdictions.map((j) => (
                <li key={j.id} className={j.covered ? "info" : "warning"} data-covered={j.covered}>
                  <code>{j.id}</code>
                  {j.covered ? "" : "Coverage warning: not covered, or only partly covered, by the corpus. "}
                  {j.reason}
                </li>
              ))}
            </ul>
            {uncovered.length > 0 && (
              <p className="meta">
                Conclusions for {uncovered.map((j) => j.id).join(", ")} are not backed by indexed law.
              </p>
            )}
          </>
        )}
        {u.issues.length > 0 && (
          <>
            <h3>Legal issues identified</h3>
            <ol>
              {u.issues.map((i) => (
                <li key={i.id}>
                  <strong>{i.title}</strong> ({i.area_of_law}): {i.question}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section aria-labelledby="guidance-h">
        <h2 id="guidance-h">Guidance</h2>
        <p>{result.guidance.summary}</p>
        {result.guidance.issues.length === 0 && (
          <p className="empty">No supported guidance could be produced from the retrieved authorities.</p>
        )}
        {result.guidance.issues.map((_, i) => (
          <IssueView key={i} result={result} index={i} asOf={u.as_of} />
        ))}
        {result.guidance.next_steps.length > 0 && (
          <>
            <h3>Next steps</h3>
            <ul data-testid="next-steps">
              {result.guidance.next_steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="authorities-h">
        <h2 id="authorities-h">Authorities ({result.authorities.length})</h2>
        {result.authorities.length === 0 && <p className="empty">No authorities were retrieved.</p>}
        {[...result.authorities]
          .sort((a, b) => (nums.get(a.id) ?? 0) - (nums.get(b.id) ?? 0))
          .map((a) => (
            <details key={a.id} className="card" open={expandAll || undefined} data-testid="authority-item">
              <summary>
                <span className="num">[{nums.get(a.id)}]</span> {a.citation}
              </summary>
              <AuthorityBody a={a} asOf={u.as_of} />
            </details>
          ))}
      </section>

      <aside className="disclaimer" aria-label="Disclaimer (repeated)">
        {disclaimerText(result.disclaimer)}
      </aside>
      <p className="meta">
        Searches: {result.usage.searches}
        {result.usage.model ? ` · model: ${result.usage.model}` : ""}
      </p>
    </div>
  );
}
