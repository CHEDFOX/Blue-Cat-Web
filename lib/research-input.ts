// Validation of a research request. Shared by the browser (early feedback) and the route
// handlers (the authoritative check before anything is forwarded to the backend).
import type { ResearchDepth, ResearchRequest } from "./types";

export const LIMITS = {
  question: 4000,
  caseText: 60_000,
  /** Largest .txt/.md file read in the browser (bytes). */
  fileBytes: 400_000,
  /** Largest JSON request body accepted by the route handler (bytes). */
  bodyBytes: 400_000,
  comment: 2000,
} as const;

export type FieldErrors = Partial<Record<"question" | "case_text" | "jurisdiction" | "as_of" | "depth", string>>;
export type Validation = { ok: true; value: ResearchRequest } | { ok: false; errors: FieldErrors };

const JURISDICTION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,24}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isRealDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function optString(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  return v.trim() === "" ? null : v;
}

export function validateResearchInput(raw: unknown): Validation {
  const errors: FieldErrors = {};
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const question = typeof o.question === "string" ? o.question.trim() : "";
  if (!question) errors.question = "Enter a question.";
  else if (question.length > LIMITS.question) errors.question = `The question is too long (maximum ${LIMITS.question} characters).`;

  const caseRaw = optString(o.case_text);
  let caseText: string | null = null;
  if (caseRaw === undefined) errors.case_text = "The case file must be text.";
  else if (caseRaw !== null) {
    caseText = caseRaw.trim();
    if (caseText.length > LIMITS.caseText) {
      errors.case_text = `The case file is too long (${caseText.length.toLocaleString("en")} of ${LIMITS.caseText.toLocaleString("en")} characters). Shorten it or paste the relevant parts.`;
    }
  }

  const jur = optString(o.jurisdiction);
  let jurisdiction: string | null = null;
  if (jur === undefined || (jur !== null && !JURISDICTION_ID.test(jur.trim()))) errors.jurisdiction = "Choose a jurisdiction from the list.";
  else jurisdiction = jur === null ? null : jur.trim();

  const asOfRaw = optString(o.as_of);
  let asOf: string | null = null;
  if (asOfRaw === undefined || (asOfRaw !== null && !isRealDate(asOfRaw.trim()))) errors.as_of = "Enter the date as YYYY-MM-DD.";
  else asOf = asOfRaw === null ? null : asOfRaw.trim();

  let depth: ResearchDepth = "standard";
  if (o.depth !== undefined && o.depth !== null && o.depth !== "") {
    if (o.depth === "standard" || o.depth === "deep") depth = o.depth;
    else errors.depth = "Depth must be standard or deep.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { question, case_text: caseText, jurisdiction, as_of: asOf, depth } };
}
