// Scripted research jobs for development and tests (ULIS_RESEARCH_MOCK=1). Stateless: the job id
// carries its creation time, so any instance can answer polls. Everything here is FICTIONAL and
// is labelled as such in the result; it must never be mistaken for real law.
import { createHash } from "node:crypto";

import type { JurisdictionSummary, ResearchAuthority, ResearchJob, ResearchProgress, ResearchResult } from "./types";

export function isMockMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.ULIS_RESEARCH_MOCK === "1";
}

function stepMs(env: Record<string, string | undefined>): number {
  const n = Number.parseInt(env.ULIS_RESEARCH_MOCK_STEP_MS ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 1500;
}

type Variant = "ok" | "fail" | "refused";
const VARIANT_CODE: Record<Variant, string> = { ok: "o", fail: "f", refused: "r" };

/** Question text containing "[mock:fail]" or "[mock:refuse]" scripts a failed or refused job. */
export function newMockJobId(question: string, nowMs = Date.now()): string {
  const variant: Variant = question.includes("[mock:fail]") ? "fail" : question.includes("[mock:refuse]") ? "refused" : "ok";
  return `mock-${nowMs}-${VARIANT_CODE[variant]}`;
}

const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

const TEXT_S12 =
  "A controller shall not retain personal data for longer than five years after the end of the transaction to which it relates, unless a longer period is required by another enactment.";
const TEXT_S13 =
  "A data subject may require a controller to erase personal data that is no longer necessary for the purpose for which it was collected. The controller shall comply within thirty days.";
const TEXT_CASE =
  "[14] The five-year period in section 12(1) runs from the end of the transaction, not from the date the data was first collected. A controller who treats the collection date as the starting point retains data unlawfully.";

const MOCK_LIMITS = [
  { code: "FICTIONAL_DATA", severity: "warning" as const, message: "This authority belongs to a fictional test jurisdiction (XA). It is not real law." },
];

function authorities(): ResearchAuthority[] {
  const source = { name: "ULIS fictional sample corpus (mock)", url: "https://example.org/ulis/mock-corpus", attribution: "Fictional test data" };
  return [
    {
      id: "auth-1",
      citation: "Personal Data Act 2015 (XA) s 12(1)",
      uri: "/akn/xa/act/2015/12/~sec_12__subsec_1",
      jurisdiction: "XA",
      kind: "provision",
      text: TEXT_S12,
      text_sha256: sha(TEXT_S12),
      valid_from: "2022-01-01",
      valid_to: null,
      authority_label: "Binding: legislation in force",
      limitations: [
        ...MOCK_LIMITS,
        { code: "EARLIER_VERSION_EXISTS", severity: "info", message: "Before 2022-01-01 the retention period was seven years." },
      ],
      source,
      verified: true,
    },
    {
      id: "auth-2",
      citation: "Personal Data Act 2015 (XA) s 13",
      uri: "/akn/xa/act/2015/12/~sec_13",
      jurisdiction: "XA",
      kind: "provision",
      text: TEXT_S13,
      text_sha256: sha(TEXT_S13),
      valid_from: "2015-07-01",
      valid_to: null,
      authority_label: "Binding: legislation in force",
      limitations: MOCK_LIMITS,
      source,
      verified: true,
    },
    {
      id: "auth-3",
      citation: "Example Ltd v Data Commissioner [2021] XADC 5 at [14]",
      uri: "/xa/case/2021/xadc-5/~para_14",
      jurisdiction: "XA",
      kind: "judgment_paragraph",
      text: TEXT_CASE,
      text_sha256: sha(TEXT_CASE),
      valid_from: "2021-03-09",
      valid_to: null,
      authority_label: "Persuasive: lower-court precedent",
      limitations: [
        ...MOCK_LIMITS,
        { code: "TREATMENT_UNKNOWN", severity: "warning", message: "Later treatment of this judgment has not been checked." },
      ],
      source,
      verified: true,
    },
  ];
}

export function mockResult(): ResearchResult {
  return {
    understanding: {
      summary:
        "A company in the fictional jurisdiction XA holds customer records after the last transaction and asks how long it may keep them, and whether customers can require deletion.",
      facts: [
        "The company is a controller of customer personal data.",
        "The last transaction with the customers ended in 2021.",
        "The company wants to keep the records for eight years.",
      ],
      as_of: "2024-01-01",
      jurisdictions: [
        { id: "XA", reason: "The company is established in XA and the data relates to XA customers.", covered: true },
        { id: "XB", reason: "Some customers appear to live in XB; no corpus is available for XB.", covered: false },
      ],
      issues: [
        { id: "i1", title: "Maximum retention period", area_of_law: "Data protection", question: "How long may the company retain the records after the last transaction?" },
        { id: "i2", title: "Customer erasure requests", area_of_law: "Data protection", question: "Can customers require the company to delete the records earlier?" },
      ],
    },
    guidance: {
      summary:
        "On the retrieved authorities the general limit appears to be five years from the end of the transaction, so an eight-year period is probably not permitted unless another enactment requires it. Erasure on request is available.",
      issues: [
        {
          issue_id: "i1",
          conclusion: "Retention beyond five years after the transaction ended is probably unlawful absent another enactment.",
          confidence: "medium",
          reasoning: [
            { text: "Section 12(1) sets a five-year maximum from the end of the transaction, with an exception for longer periods required by another enactment.", authority_ids: ["auth-1"] },
            { text: "A court has held that the period runs from the end of the transaction, not from collection.", authority_ids: ["auth-3"] },
          ],
          uncertainties: [
            "Whether another XA enactment (for example tax record-keeping) requires a longer period was not found in the indexed corpus.",
            "The treatment of the 2021 judgment by later courts has not been checked.",
          ],
        },
        {
          issue_id: "i2",
          conclusion: "Customers can probably require erasure once the data is no longer necessary, and the company must comply within thirty days.",
          confidence: "low",
          reasoning: [{ text: "Section 13 gives a data subject a right to erasure of data that is no longer necessary for its purpose.", authority_ids: ["auth-2"] }],
          uncertainties: ["Whether the stated retention purpose is still necessary on the facts is not established."],
        },
      ],
      next_steps: [
        "Check whether tax, accounting or sector rules in XA require a longer retention period.",
        "Confirm the end date of each transaction and the law in force on the relevant date.",
        "Obtain the XB position separately: it is not covered here.",
      ],
    },
    authorities: authorities(),
    coverage_notes: [
      "XB is not covered by the corpus: any XB law that applies to some customers has not been considered.",
      "Only the Personal Data Act 2015 (XA) and one judgment were indexed for this area.",
    ],
    removed_claims: 2,
    limitations: [
      { code: "MOCK_MODE", severity: "critical", message: "MOCK MODE: this result is scripted test data about a fictional jurisdiction. It is not research." },
    ],
    disclaimer:
      "Research aid, not legal advice. Every authority must be checked against the official source before it is relied on. Mock data in this result is fictional.",
    usage: { searches: 6, model: "mock", input_tokens: 0, output_tokens: 0 },
  };
}

const PROGRESS: Omit<ResearchProgress, "at">[] = [
  { stage: "understanding", message: "Reading the question and identifying facts, jurisdictions and issues." },
  { stage: "searching", message: "Searching the XA corpus for retention and erasure provisions (6 searches)." },
  { stage: "drafting", message: "Drafting guidance that cites only retrieved authorities." },
  { stage: "verifying", message: "Re-reading every quote against the stored text; 2 statements could not be verified." },
];

export function mockJob(id: string, nowMs = Date.now(), env: Record<string, string | undefined> = process.env): ResearchJob | null {
  const m = /^mock-(\d{10,15})-([ofr])$/.exec(id);
  if (!m) return null;
  const created = Number(m[1]);
  const variant: Variant = m[2] === "f" ? "fail" : m[2] === "r" ? "refused" : "ok";
  const step = stepMs(env);
  const elapsed = nowMs - created;
  const at = (k: number) => new Date(created + k * step).toISOString();
  const base = {
    id,
    created_at: new Date(created).toISOString(),
    expires_at: new Date(created + 86_400_000).toISOString(),
  };
  const reached = (k: number) => elapsed >= k * step;

  if (variant === "refused" && reached(2)) {
    return {
      ...base,
      status: "refused",
      progress: PROGRESS.slice(0, 1).map((p) => ({ ...p, at: at(1) })),
      result: null,
      error: { code: "out_of_scope", message: "This request asks for an outcome prediction or a document to be filed. The research assistant only provides research on the law." },
    };
  }
  if (variant === "fail" && reached(3)) {
    return {
      ...base,
      status: "failed",
      progress: PROGRESS.slice(0, 2).map((p, i) => ({ ...p, at: at(i + 1) })),
      result: null,
      error: { code: "llm_unavailable", message: "The language model service did not respond. No result was produced." },
    };
  }
  if (variant === "ok" && reached(5)) {
    return { ...base, status: "completed", progress: PROGRESS.map((p, i) => ({ ...p, at: at(i + 1) })), result: mockResult(), error: null };
  }
  const done = Math.min(PROGRESS.length, Math.max(0, Math.floor(elapsed / Math.max(step, 1))));
  return {
    ...base,
    status: done === 0 ? "queued" : "running",
    progress: PROGRESS.slice(0, done).map((p, i) => ({ ...p, at: at(i + 1) })),
    result: null,
    error: null,
  };
}

export function mockJurisdictions(): JurisdictionSummary[] {
  const j = (id: string, name: string, corpus_status: string, fictional = false): JurisdictionSummary => ({
    id, name, kind: "state", parent: null, fictional, profile_version: "mock", verification: "mock",
    official_languages: ["en"], corpus_status, legal_families: [], courts: [],
  });
  return [
    j("CA", "Canada (federal)", "pilot"),
    j("DE", "Germany", "pilot"),
    j("GB-ENG", "England and Wales", "partial"),
    j("IN", "India", "none"),
    j("US", "United States (federal)", "pilot"),
    j("XA", "Xandria (fictional)", "fictional_sample", true),
  ];
}
