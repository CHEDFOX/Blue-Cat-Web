import { describe, expect, it } from "vitest";

import { validateResearchInput } from "@/lib/research-input";
import { isMockMode, mockJob, mockResult, newMockJobId } from "@/lib/research-mock";
import {
  currentStageIndex,
  formatMarkdown,
  formatPlainText,
  isTerminal,
  nextPollDelay,
  numberAuthorities,
  parseJob,
  parseResult,
  provisionHref,
  removedClaimsMessage,
  safeUrl,
} from "@/lib/research";

describe("validateResearchInput", () => {
  it("normalises a minimal request", () => {
    expect(validateResearchInput({ question: "  How long?  " })).toEqual({
      ok: true,
      value: { question: "How long?", case_text: null, jurisdiction: null, as_of: null, depth: "standard" },
    });
  });

  it("accepts all optional fields", () => {
    const r = validateResearchInput({ question: "q", case_text: " facts ", jurisdiction: "GB-ENG", as_of: "2024-02-29", depth: "deep" });
    expect(r).toEqual({ ok: true, value: { question: "q", case_text: "facts", jurisdiction: "GB-ENG", as_of: "2024-02-29", depth: "deep" } });
  });

  it("rejects bad input field by field", () => {
    const r = validateResearchInput({ question: "", case_text: "x".repeat(60_001), jurisdiction: "DE; DROP", as_of: "2023-02-30", depth: "fast" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["as_of", "case_text", "depth", "jurisdiction", "question"]);
    expect(validateResearchInput({ question: "x".repeat(4001) }).ok).toBe(false);
    expect(validateResearchInput({ question: 5 }).ok).toBe(false);
    expect(validateResearchInput(null).ok).toBe(false);
  });
});

describe("polling policy", () => {
  it("polls every base interval, then backs off to a cap", () => {
    expect([0, 5, 9].map((a) => nextPollDelay(a))).toEqual([2000, 2000, 2000]);
    expect(nextPollDelay(10)).toBeGreaterThan(2000);
    expect(nextPollDelay(11)).toBeGreaterThan(nextPollDelay(10));
    expect(nextPollDelay(500)).toBe(16_000);
    expect(nextPollDelay(0, 500)).toBe(500);
  });

  it("knows terminal states and the current stage", () => {
    expect(["completed", "failed", "refused"].every((s) => isTerminal(s as never))).toBe(true);
    expect(isTerminal("running")).toBe(false);
    expect(currentStageIndex([])).toBe(-1);
    expect(currentStageIndex([{ at: "", stage: "searching", message: "" }, { at: "", stage: "understanding", message: "" }])).toBe(1);
  });
});

describe("parseJob", () => {
  it("parses the full mock result and keeps contract fields", () => {
    const job = parseJob(JSON.parse(JSON.stringify(mockJob(`mock-${Date.parse("2026-01-01")}-o`, Date.parse("2026-01-01") + 60_000)!)));
    expect(job.status).toBe("completed");
    expect(job.result?.authorities).toHaveLength(3);
    expect(job.result?.removed_claims).toBe(2);
    expect(job.progress.map((p) => p.stage)).toEqual(["understanding", "searching", "drafting", "verifying"]);
  });

  it("is defensive: missing arrays, unknown confidence and unverified default", () => {
    const r = parseResult({
      understanding: { jurisdictions: [{ id: "DE" }] },
      guidance: { issues: [{ issue_id: "i", confidence: "certain", reasoning: [{ text: "t" }] }] },
      authorities: [{ id: "a", citation: "c" }],
      removed_claims: -3,
    })!;
    expect(r.understanding.jurisdictions[0]!.covered).toBe(false);
    expect(r.guidance.issues[0]!.confidence).toBe("low");
    expect(r.guidance.issues[0]!.reasoning[0]!.authority_ids).toEqual([]);
    expect(r.authorities[0]!.verified).toBe(false);
    expect(r.removed_claims).toBe(0);
    expect(r.disclaimer).toMatch(/not legal advice/i);
  });

  it("only keeps a result for completed jobs and rejects non-jobs", () => {
    expect(parseJob({ id: "x", status: "running", result: mockResult() }).result).toBeNull();
    expect(parseJob({ id: "x", status: "failed", error: { code: "e", message: "m" } }).error?.message).toBe("m");
    expect(() => parseJob({ status: "completed" })).toThrow();
    expect(() => parseJob({ id: "x", status: "weird" })).toThrow();
    expect(() => parseJob(null)).toThrow();
  });
});

describe("citations and warnings", () => {
  const result = mockResult();

  it("numbers authorities by first citation", () => {
    const n = numberAuthorities(result);
    expect([...n.entries()]).toEqual([["auth-1", 1], ["auth-3", 2], ["auth-2", 3]]);
  });

  it("links only provisions the point-in-time page can show", () => {
    const [prov, , judgment] = result.authorities;
    expect(provisionHref(prov!, "2024-01-01")).toBe("/provision?uri=%2Fakn%2Fxa%2Fact%2F2015%2F12%2F%7Esec_12__subsec_1&as_of=2024-01-01");
    expect(provisionHref(judgment!, null)).toBeNull();
    expect(provisionHref({ ...prov!, uri: "no-slash" }, null)).toBeNull();
  });

  it("only links http(s) sources", () => {
    expect(safeUrl("https://example.org/x")).toBe("https://example.org/x");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });

  it("states removed claims honestly", () => {
    expect(removedClaimsMessage(0)).toBeNull();
    expect(removedClaimsMessage(1)).toMatch(/^1 statement was removed because it could not be verified/);
    expect(removedClaimsMessage(2)).toMatch(/^2 statements were removed because they could not be verified/);
  });
});

describe("export formatting", () => {
  const result = mockResult();
  const meta = { createdAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-02T00:00:00Z" };

  it("markdown keeps disclaimer, confidence, numbered citations, hashes and warnings", () => {
    const md = formatMarkdown(result, meta);
    expect(md).toMatch(/^# Legal research memo/);
    expect(md).toContain("DISCLAIMER: Research aid, not legal advice");
    expect(md).toContain("(confidence: medium)");
    expect(md).toContain("(confidence: low)");
    expect(md).toContain("[1]");
    expect(md).toContain("### [1] Personal Data Act 2015 (XA) s 12(1)");
    expect(md).toContain(result.authorities[0]!.text_sha256);
    expect(md).toContain("> A controller shall not retain");
    expect(md).toContain("2 statements were removed because they could not be verified");
    expect(md).toContain("NOT COVERED");
    expect(md).toContain("Limitation WARNING FICTIONAL_DATA");
    expect(md).not.toMatch(/\n{3,}/);
  });

  it("plain text has no markdown markup but the same content", () => {
    const txt = formatPlainText(result, meta);
    expect(txt).not.toMatch(/^#+ /m);
    expect(txt).not.toContain("> ");
    expect(txt).toContain("GUIDANCE");
    expect(txt).toContain("[2] Example Ltd v Data Commissioner [2021] XADC 5 at [14]");
    expect(txt).toContain("2 statements were removed because they could not be verified");
  });

  it("marks unverified authorities and unresolved ids", () => {
    const r = structuredClone(result);
    r.authorities[0]!.verified = false;
    r.guidance.issues[0]!.reasoning[0]!.authority_ids.push("missing");
    const md = formatMarkdown(r);
    expect(md).toContain("NOT VERIFIED");
    expect(md).not.toContain("[undefined]");
  });
});

describe("mock jobs", () => {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  const env = { ULIS_RESEARCH_MOCK_STEP_MS: "1000" };

  it("scripts queued -> running with stages -> completed", () => {
    const id = newMockJobId("What is the retention period?", t0);
    expect(mockJob(id, t0, env)!.status).toBe("queued");
    const mid = mockJob(id, t0 + 2500, env)!;
    expect(mid.status).toBe("running");
    expect(mid.progress).toHaveLength(2);
    expect(mockJob(id, t0 + 5000, env)!.status).toBe("completed");
  });

  it("scripts failed and refused jobs from the question text", () => {
    expect(mockJob(newMockJobId("x [mock:fail]", t0), t0 + 4000, env)!.status).toBe("failed");
    expect(mockJob(newMockJobId("x [mock:refuse]", t0), t0 + 4000, env)!.status).toBe("refused");
  });

  it("rejects ids it did not create and detects the mode flag", () => {
    expect(mockJob("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(isMockMode({ ULIS_RESEARCH_MOCK: "1" })).toBe(true);
    expect(isMockMode({})).toBe(false);
  });

  it("citation hashes are the real SHA-256 of the text", async () => {
    const { createHash } = await import("node:crypto");
    for (const a of mockResult().authorities) expect(a.text_sha256).toBe(createHash("sha256").update(a.text).digest("hex"));
  });
});
