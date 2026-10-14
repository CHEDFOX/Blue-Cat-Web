"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LIMITS, validateResearchInput, type FieldErrors } from "@/lib/research-input";
import { isTerminal, nextPollDelay, parseJob } from "@/lib/research";
import type { ResearchDepth, ResearchJob } from "@/lib/types";

import { FeedbackWidget } from "./FeedbackWidget";
import { FirstVisitNotice } from "./FirstVisitNotice";
import { ProgressView } from "./ProgressView";
import { ResultView } from "./ResultView";

export interface JurisdictionOption {
  id: string;
  name: string;
  corpusStatus: string;
  fictional: boolean;
}

const NOTICE_KEY = "ulis_notice_v1";
const MAX_WAIT_MS = 12 * 60_000;

const GROUPS: { status: string; label: string }[] = [
  { status: "broad", label: "Broad coverage" },
  { status: "partial", label: "Partial coverage" },
  { status: "pilot", label: "Pilot coverage (selected laws only)" },
  { status: "fictional_sample", label: "Fictional test jurisdictions (not real law)" },
  { status: "none", label: "No corpus (the assistant will report the gap)" },
];

const STATUS_TEXT: Record<string, string> = {
  broad: "broad",
  partial: "partial",
  pilot: "pilot",
  fictional_sample: "sample",
  none: "no corpus",
};

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // fall through
  }
  return `The request failed (HTTP ${res.status}).`;
}

function readNotice(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function ResearchApp({
  jurisdictions,
  jurisdictionsError,
  mock,
  pollMs,
  initialJobId,
}: {
  jurisdictions: JurisdictionOption[];
  jurisdictionsError: boolean;
  mock: boolean;
  pollMs: number;
  initialJobId: string | null;
}) {
  const [ack, setAck] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [caseText, setCaseText] = useState("");
  const [fileNote, setFileNote] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [asOf, setAsOf] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [pollError, setPollError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [stopped, setStopped] = useState(false);
  const startedAt = useRef<number>(Date.now());
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => setAck(readNotice()), []);

  const acknowledge = () => {
    setAck(true);
    try {
      window.localStorage.setItem(NOTICE_KEY, "1");
    } catch {
      // private mode: the notice simply shows again next visit
    }
  };

  // ------------------------------------------------------------ polling
  useEffect(() => {
    if (!jobId || stopped) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let failures = 0;
    startedAt.current = Date.now();

    const fail = (message: string) => {
      if (!cancelled) setPollError(message);
    };

    const tick = async () => {
      try {
        const res = await fetch(`/api/research/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) return fail("Your session has expired. Reload the page and enter your invite code again.");
        if (res.status === 404) return fail("This research job was not found. Results are deleted after 24 hours, or the link is wrong.");
        if (!res.ok) throw new Error(await errorMessage(res));
        const next = parseJob(await res.json());
        if (cancelled) return;
        failures = 0;
        setJob(next);
        if (isTerminal(next.status)) return;
      } catch (e) {
        if (cancelled) return;
        failures += 1;
        if (failures >= 5) return fail(e instanceof Error && e.message ? e.message : "The connection to the research service was lost.");
      }
      if (Date.now() - startedAt.current > MAX_WAIT_MS) return fail("This is taking much longer than expected. Stop here and try again later.");
      attempt += 1;
      const delay = failures > 0 ? Math.min(pollMs * 2 ** failures, 30_000) : nextPollDelay(attempt, pollMs);
      timer = setTimeout(tick, delay);
    };

    setPollError("");
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, pollMs, stopped]);

  const finished = job ? isTerminal(job.status) : false;
  const waiting = !!jobId && !finished && !pollError && !stopped;

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  useEffect(() => {
    if (finished || pollError) headingRef.current?.focus();
  }, [finished, pollError]);

  // ------------------------------------------------------------ form
  const grouped = useMemo(() => {
    const known = new Set(GROUPS.map((g) => g.status));
    return GROUPS.map((g) => ({
      ...g,
      items: jurisdictions
        .filter((j) => (known.has(j.corpusStatus) ? j.corpusStatus === g.status : g.status === "none"))
        .sort((a, b) => a.id.localeCompare(b.id)),
    })).filter((g) => g.items.length > 0);
  }, [jurisdictions]);

  const selected = jurisdictions.find((j) => j.id === jurisdiction);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      setFileNote("Only .txt and .md files are supported. Paste other text into the box.");
      return;
    }
    if (file.size > LIMITS.fileBytes) {
      setFileNote(`That file is too large (${Math.round(file.size / 1000)} kB). The case file may have at most ${LIMITS.caseText.toLocaleString("en")} characters.`);
      return;
    }
    const text = await file.text();
    setCaseText(text);
    setFileNote(`Loaded ${file.name} (${text.length.toLocaleString("en")} characters). It is read in your browser and sent only when you run the research.`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const check = validateResearchInput({ question, case_text: caseText, jurisdiction, as_of: asOf, depth });
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(check.value),
      });
      if (res.status === 401) {
        setFormError("Your session has expired. Reload the page and enter your invite code again.");
        return;
      }
      if (!res.ok) {
        setFormError(await errorMessage(res));
        return;
      }
      const body = (await res.json()) as { id?: string };
      if (!body.id) {
        setFormError("Unexpected response from the research service.");
        return;
      }
      setJob(null);
      setPollError("");
      setStopped(false);
      setElapsed(0);
      setJobId(body.id);
      window.history.replaceState(null, "", `/research?job=${encodeURIComponent(body.id)}`);
    } catch {
      setFormError("Could not reach the research service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const reset = useCallback(() => {
    setJobId(null);
    setJob(null);
    setPollError("");
    setStopped(false);
    window.history.replaceState(null, "", "/research");
  }, []);

  const showForm = !jobId || stopped || (!!pollError && !job);
  const caseLen = caseText.trim().length;

  return (
    <>
      <h1>Research assistant</h1>
      <p className="lede">
        Describe a legal question, optionally with the case file. The assistant identifies the issues, retrieves real
        authorities from the corpus, drafts guidance that cites only those authorities, and re-checks every quote.
      </p>
      {mock && (
        <p className="error" role="note" data-testid="mock-banner">
          Mock mode is on: results are scripted test data about a fictional jurisdiction, not research.
        </p>
      )}
      {ack === false && <FirstVisitNotice onAcknowledge={acknowledge} />}

      {showForm && (
        <form className="search" onSubmit={onSubmit} noValidate aria-label="Research request">
          <fieldset disabled={ack !== true || submitting} className="plain">
            <label>
              Question (required)
              <textarea
                name="question"
                rows={3}
                required
                maxLength={LIMITS.question}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                aria-invalid={!!errors.question}
                aria-describedby={errors.question ? "err-question" : undefined}
                placeholder="e.g. How long may a company keep customer records after the last transaction?"
              />
            </label>
            {errors.question && (
              <p className="field-error" id="err-question" role="alert">
                {errors.question}
              </p>
            )}

            <label>
              Case file (optional)
              <textarea
                name="case_text"
                rows={8}
                value={caseText}
                onChange={(e) => {
                  setCaseText(e.target.value);
                  setFileNote("");
                }}
                aria-invalid={!!errors.case_text}
                aria-describedby="case-hint"
                placeholder="Paste the facts, correspondence or contract extract that matter."
              />
            </label>
            <p className="meta" id="case-hint">
              {caseLen.toLocaleString("en")} / {LIMITS.caseText.toLocaleString("en")} characters. Do not paste confidential client data
              unless this deployment is approved for it. The text is processed by an AI provider and not stored by this website.
            </p>
            {errors.case_text && (
              <p className="field-error" role="alert">
                {errors.case_text}
              </p>
            )}
            <div className="file-row">
              <label>
                Or load a .txt / .md file
                <input type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={onFile} />
              </label>
              {caseText && (
                <button type="button" onClick={() => { setCaseText(""); setFileNote(""); }}>
                  Clear case file
                </button>
              )}
            </div>
            {fileNote && (
              <p className="meta" role="status">
                {fileNote}
              </p>
            )}

            <div className="row">
              <label>
                Jurisdiction (optional)
                <select name="jurisdiction" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} aria-invalid={!!errors.jurisdiction}>
                  <option value="">Let the assistant decide</option>
                  {grouped.map((g) => (
                    <optgroup key={g.status} label={g.label}>
                      {g.items.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.id} — {j.name} ({STATUS_TEXT[j.corpusStatus] ?? j.corpusStatus})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                Law as of (optional)
                <input type="date" name="as_of" value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-invalid={!!errors.as_of} />
              </label>
              <label>
                Depth
                <select name="depth" value={depth} onChange={(e) => setDepth(e.target.value as ResearchDepth)}>
                  <option value="standard">Standard</option>
                  <option value="deep">Deep (stronger model, more searches, slower)</option>
                </select>
              </label>
            </div>
            {jurisdictionsError && (
              <p className="meta" role="status">
                The jurisdiction list could not be loaded. You can still run the research without choosing one.
              </p>
            )}
            {selected && selected.corpusStatus !== "broad" && (
              <p className="meta" role="status" data-testid="coverage-hint">
                Coverage for {selected.id} is <strong>{STATUS_TEXT[selected.corpusStatus] ?? selected.corpusStatus}</strong>
                {selected.fictional ? " (fictional test data, not real law)" : ""}
                {selected.corpusStatus === "none" ? ": expect the assistant to report that no law is indexed." : ": some relevant law may be missing."}
              </p>
            )}
            {(errors.as_of || errors.jurisdiction || errors.depth) && (
              <p className="field-error" role="alert">
                {errors.as_of ?? errors.jurisdiction ?? errors.depth}
              </p>
            )}

            {formError && (
              <p className="error" role="alert" data-testid="form-error">
                {formError}
              </p>
            )}
            <button className="primary" type="submit" disabled={ack !== true || submitting}>
              {submitting ? "Submitting…" : "Run research"}
            </button>
            <p className="meta">A run takes 20 seconds to 3 minutes. Runs per invite code are limited each day.</p>
          </fieldset>
        </form>
      )}

      {jobId && (
        <div className="job" ref={headingRef} tabIndex={-1} aria-label="Research status">
          {!showForm || job ? (
            <p className="no-print">
              <button type="button" onClick={reset}>
                New question
              </button>
            </p>
          ) : null}

          {pollError && (
            <p className="error" role="alert" data-testid="poll-error">
              {pollError}
            </p>
          )}
          {stopped && !finished && (
            <p className="meta" role="status">
              You stopped waiting. The job may still finish: reload this page (the address contains the job id) to check again.
            </p>
          )}
          {waiting && <ProgressView job={job} elapsedSeconds={elapsed} onStop={() => setStopped(true)} />}

          {job && (job.status === "failed" || job.status === "refused") && (
            <section className="card" data-testid="job-ended">
              <h2>{job.status === "refused" ? "The assistant declined this request" : "The research could not be completed"}</h2>
              <p className="error" role="alert">
                {job.error?.message ?? "No further detail was provided."}
              </p>
              {job.progress.length > 0 && (
                <ul className="progress-log">
                  {job.progress.map((p, i) => (
                    <li key={i}>{p.message}</li>
                  ))}
                </ul>
              )}
              <p className="meta">Nothing in this attempt should be relied on. You can edit the question and run it again.</p>
            </section>
          )}
          {job?.status === "completed" && job.result && <ResultView job={job} result={job.result} mock={mock} />}
          {job?.status === "completed" && !job.result && (
            <p className="error" role="alert">
              The service reported success but returned no readable result.
            </p>
          )}
        </div>
      )}

      <FeedbackWidget />
    </>
  );
}
