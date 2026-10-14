"use client";

import { STAGES, currentStageIndex } from "@/lib/research";
import type { ResearchJob } from "@/lib/types";

export function ProgressView({ job, elapsedSeconds, onStop }: { job: ResearchJob | null; elapsedSeconds: number; onStop: () => void }) {
  const progress = job?.progress ?? [];
  const idx = currentStageIndex(progress);
  const queued = !job || job.status === "queued";
  return (
    <section className="card" aria-labelledby="progress-title" data-testid="progress">
      <h2 id="progress-title" tabIndex={-1}>
        {queued ? "Waiting in the queue" : "Researching"}
      </h2>
      <p className="meta">
        This usually takes between 20 seconds and 3 minutes. Elapsed: {elapsedSeconds} s. You can leave this tab open.
      </p>
      <ol className="stages" aria-label="Stages">
        {STAGES.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? "current" : "todo";
          return (
            <li key={s.id} className={state} data-stage={s.id} aria-current={state === "current" ? "step" : undefined}>
              <span className="dot" aria-hidden="true" />
              {s.label}
              <span className="visually-hidden">{state === "done" ? " (done)" : state === "current" ? " (in progress)" : " (not started)"}</span>
            </li>
          );
        })}
      </ol>
      <div aria-live="polite" data-testid="progress-messages">
        <ul className="progress-log">
          {progress.map((p, i) => (
            <li key={`${p.at}-${i}`}>{p.message}</li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onStop}>
        Stop waiting
      </button>
    </section>
  );
}
