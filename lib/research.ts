// Research-assistant helpers: defensive parsing of the backend contract, polling policy and
// text/markdown export. Pure functions, unit-tested.
import { formatPeriod } from "./format";
import type {
  Confidence,
  Limitation,
  ResearchAuthority,
  ResearchJob,
  ResearchProgress,
  ResearchResult,
  ResearchStage,
  ResearchStatus,
  Severity,
} from "./types";

export const STAGES: { id: ResearchStage; label: string }[] = [
  { id: "understanding", label: "Understanding the case" },
  { id: "searching", label: "Searching the law" },
  { id: "drafting", label: "Drafting guidance" },
  { id: "verifying", label: "Verifying every quote" },
];

export const RETENTION_NOTE = "Results are deleted from the research service 24 hours after they are created.";

export const CONFIDENCE_HELP: Record<Confidence, string> = {
  high: "Strongly supported by the retrieved authorities. Still verify before relying on it.",
  medium: "Partly supported; some points depend on facts or authorities not confirmed. Read the uncertainties.",
  low: "Weakly supported or incomplete. Treat as a lead for further research, not as a conclusion.",
};

const STATUSES: ResearchStatus[] = ["queued", "running", "completed", "failed", "refused"];
const STAGE_IDS = STAGES.map((s) => s.id);

export function isTerminal(status: ResearchStatus): boolean {
  return status === "completed" || status === "failed" || status === "refused";
}

// ---------------------------------------------------------------- parsing

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");

function parseLimitations(v: unknown): Limitation[] {
  return arr(v)
    .filter(isObj)
    .map((l) => {
      const sev = l.severity;
      const severity: Severity = sev === "critical" || sev === "warning" || sev === "info" ? sev : "warning";
      return { code: str(l.code, "NOTE"), severity, message: str(l.message) };
    });
}

function parseAuthority(a: Obj): ResearchAuthority {
  const source = isObj(a.source) ? a.source : {};
  return {
    id: str(a.id),
    citation: str(a.citation, "(no citation)"),
    uri: str(a.uri),
    jurisdiction: str(a.jurisdiction),
    kind: a.kind === "judgment_paragraph" ? "judgment_paragraph" : "provision",
    text: str(a.text),
    text_sha256: str(a.text_sha256),
    valid_from: strOrNull(a.valid_from),
    valid_to: strOrNull(a.valid_to),
    authority_label: str(a.authority_label),
    limitations: parseLimitations(a.limitations),
    source: { name: str(source.name), url: strOrNull(source.url), attribution: strOrNull(source.attribution) },
    // Absent means unverified: never assume a quote was checked.
    verified: a.verified === true,
  };
}

export function parseResult(raw: unknown): ResearchResult | null {
  if (!isObj(raw)) return null;
  const u = isObj(raw.understanding) ? raw.understanding : {};
  const g = isObj(raw.guidance) ? raw.guidance : {};
  const usage = isObj(raw.usage) ? raw.usage : {};
  const confidence = (c: unknown): Confidence => (c === "high" || c === "medium" || c === "low" ? c : "low");
  return {
    understanding: {
      summary: str(u.summary),
      facts: strs(u.facts),
      as_of: strOrNull(u.as_of),
      jurisdictions: arr(u.jurisdictions)
        .filter(isObj)
        .map((j) => ({ id: str(j.id), reason: str(j.reason), covered: j.covered === true })),
      issues: arr(u.issues)
        .filter(isObj)
        .map((i) => ({ id: str(i.id), title: str(i.title), area_of_law: str(i.area_of_law), question: str(i.question) })),
    },
    guidance: {
      summary: str(g.summary),
      issues: arr(g.issues)
        .filter(isObj)
        .map((i) => ({
          issue_id: str(i.issue_id),
          conclusion: str(i.conclusion),
          confidence: confidence(i.confidence),
          reasoning: arr(i.reasoning)
            .filter(isObj)
            .map((r) => ({ text: str(r.text), authority_ids: strs(r.authority_ids) })),
          uncertainties: strs(i.uncertainties),
        })),
      next_steps: strs(g.next_steps),
    },
    authorities: arr(raw.authorities).filter(isObj).map(parseAuthority),
    coverage_notes: strs(raw.coverage_notes),
    removed_claims: Math.max(0, Math.floor(num(raw.removed_claims))),
    limitations: parseLimitations(raw.limitations),
    disclaimer: str(raw.disclaimer, "Research aid, not legal advice. Verify every authority against the official source."),
    usage: {
      searches: num(usage.searches),
      model: str(usage.model),
      input_tokens: num(usage.input_tokens),
      output_tokens: num(usage.output_tokens),
    },
  };
}

/** Parses a backend (or mock) job document. Throws if it is not a job at all. */
export function parseJob(raw: unknown): ResearchJob {
  if (!isObj(raw) || typeof raw.id !== "string" || !STATUSES.includes(raw.status as ResearchStatus)) {
    throw new Error("Unexpected response from the research service.");
  }
  const progress: ResearchProgress[] = arr(raw.progress)
    .filter(isObj)
    .filter((p) => STAGE_IDS.includes(p.stage as ResearchStage))
    .map((p) => ({ at: str(p.at), stage: p.stage as ResearchStage, message: str(p.message) }));
  const err = isObj(raw.error) ? { code: str(raw.error.code, "error"), message: str(raw.error.message, "The job failed.") } : null;
  const status = raw.status as ResearchStatus;
  return {
    id: raw.id,
    status,
    created_at: strOrNull(raw.created_at),
    expires_at: strOrNull(raw.expires_at),
    progress,
    result: status === "completed" ? parseResult(raw.result) : null,
    error: err,
  };
}

// ---------------------------------------------------------------- polling

/** Delay before poll number `attempt` (0-based): `baseMs` for the first 10 polls, then +25% each, capped at 8x. */
export function nextPollDelay(attempt: number, baseMs = 2000): number {
  if (attempt < 10) return baseMs;
  return Math.min(Math.round(baseMs * 1.25 ** (attempt - 9)), baseMs * 8);
}

/** Index (0-3) of the furthest stage reached, or -1 if none yet. */
export function currentStageIndex(progress: ResearchProgress[]): number {
  let idx = -1;
  for (const p of progress) idx = Math.max(idx, STAGE_IDS.indexOf(p.stage));
  return idx;
}

// ---------------------------------------------------------------- authorities and citations

/** Numbers authorities in order of first citation in the guidance; uncited ones follow. */
export function numberAuthorities(result: ResearchResult): Map<string, number> {
  const known = new Set(result.authorities.map((a) => a.id));
  const order = new Map<string, number>();
  const add = (id: string) => {
    if (known.has(id) && !order.has(id)) order.set(id, order.size + 1);
  };
  for (const issue of result.guidance.issues) for (const r of issue.reasoning) r.authority_ids.forEach(add);
  for (const a of result.authorities) add(a.id);
  return order;
}

const PROVISION_URI = /^\/[a-z][a-z0-9-]*\/[^\s]+~[^\s]+$/;

/** Link to the existing point-in-time page; null where that page cannot show the authority. */
export function provisionHref(a: ResearchAuthority, asOf: string | null): string | null {
  if (a.kind !== "provision" || !PROVISION_URI.test(a.uri)) return null;
  const p = new URLSearchParams({ uri: a.uri });
  const date = asOf ?? a.valid_from;
  if (date) p.set("as_of", date);
  return `/provision?${p.toString()}`;
}

export function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function removedClaimsMessage(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? "1 statement was removed because it could not be verified against the stored authority text."
    : `${n} statements were removed because they could not be verified against the stored authority text.`;
}

export function issueTitle(result: ResearchResult, issueId: string): string {
  return result.understanding.issues.find((i) => i.id === issueId)?.title || issueId || "Issue";
}

// ---------------------------------------------------------------- export

export interface ExportMeta {
  jobId?: string;
  createdAt?: string | null;
  expiresAt?: string | null;
}

type Style = "markdown" | "text";

function render(result: ResearchResult, meta: ExportMeta, style: Style): string {
  const md = style === "markdown";
  const out: string[] = [];
  const nums = numberAuthorities(result);
  const h1 = (t: string) => out.push(md ? `# ${t}` : `${t.toUpperCase()}\n${"=".repeat(Math.min(t.length, 72))}`, "");
  const h2 = (t: string) => out.push(md ? `## ${t}` : `${t.toUpperCase()}`, "");
  const h3 = (t: string) => out.push(md ? `### ${t}` : `${t}`, "");
  const p = (t: string) => t && out.push(t, "");
  const list = (items: string[]) => {
    if (items.length === 0) return;
    out.push(...items.map((i) => `- ${i}`), "");
  };
  const refs = (ids: string[]) => {
    const n = ids.map((id) => nums.get(id)).filter((x): x is number => x !== undefined);
    return n.length ? ` ${n.map((x) => `[${x}]`).join("")}` : "";
  };
  const lims = (items: Limitation[]) => items.map((l) => `${l.severity.toUpperCase()} ${l.code}: ${l.message}`);

  h1("Legal research memo (research aid, not legal advice)");
  p(`DISCLAIMER: ${result.disclaimer}`);
  if (meta.createdAt) p(`Created: ${meta.createdAt}${meta.expiresAt ? `. The service deletes this result at ${meta.expiresAt}.` : ""}`);

  const removed = removedClaimsMessage(result.removed_claims);
  if (removed || result.coverage_notes.length || result.limitations.length) {
    h2("Warnings and coverage");
    if (removed) list([removed]);
    list(result.coverage_notes.map((n) => `Coverage: ${n}`));
    list(lims(result.limitations));
  }

  const u = result.understanding;
  h2("Understanding of the case");
  p(u.summary);
  if (u.facts.length) {
    h3("Facts relied on");
    list(u.facts);
  }
  if (u.as_of) p(`Law as of: ${u.as_of}`);
  if (u.jurisdictions.length) {
    h3("Jurisdictions");
    list(u.jurisdictions.map((j) => `${j.id}${j.covered ? "" : " (NOT COVERED or only partly covered by the corpus)"}: ${j.reason}`));
  }

  h2("Guidance");
  p(result.guidance.summary);
  for (const issue of result.guidance.issues) {
    h3(`${issueTitle(result, issue.issue_id)} (confidence: ${issue.confidence})`);
    p(issue.conclusion);
    list(issue.reasoning.map((r) => `${r.text}${refs(r.authority_ids)}`));
    if (issue.uncertainties.length) {
      p(md ? "**Uncertainties**" : "Uncertainties:");
      list(issue.uncertainties);
    }
  }
  if (result.guidance.next_steps.length) {
    h3("Next steps");
    list(result.guidance.next_steps);
  }

  h2("Authorities");
  const ordered = [...result.authorities].sort((a, b) => (nums.get(a.id) ?? 0) - (nums.get(b.id) ?? 0));
  for (const a of ordered) {
    const n = nums.get(a.id);
    h3(`[${n}] ${a.citation}`);
    const meta2 = [
      a.authority_label,
      a.jurisdiction,
      `valid ${formatPeriod(a.valid_from, a.valid_to)}`,
      a.verified ? "quote verified against stored text" : "NOT VERIFIED",
    ].filter(Boolean);
    p(meta2.join(" | "));
    if (a.text) out.push(md ? a.text.split("\n").map((l) => `> ${l}`).join("\n") : `"${a.text}"`, "");
    p(`SHA-256 of text: ${a.text_sha256 || "(not provided)"}`);
    const url = safeUrl(a.source.url);
    p(`Source: ${a.source.name || "(unnamed)"}${url ? ` ${url}` : ""}${a.source.attribution ? ` (${a.source.attribution})` : ""}`);
    if (a.uri) p(`ULIS URI: ${a.uri}`);
    list(lims(a.limitations).map((l) => `Limitation ${l}`));
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export const formatMarkdown = (r: ResearchResult, meta: ExportMeta = {}) => render(r, meta, "markdown");
export const formatPlainText = (r: ResearchResult, meta: ExportMeta = {}) => render(r, meta, "text");
