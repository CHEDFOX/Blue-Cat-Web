"use client";

export const NOTICE_TEXT = [
  "This is a research aid for lawyers, not legal advice. Verify every authority against the official source.",
  "Do not paste confidential client data unless this deployment has been approved for it: the text you submit is processed by an AI provider.",
  "Results are deleted from the research service after 24 hours. Copy or print what you need.",
];

export function FirstVisitNotice({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <section className="card notice-card" aria-labelledby="notice-title" data-testid="first-visit-notice">
      <h2 id="notice-title">Before you start</h2>
      <ul>
        {NOTICE_TEXT.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={onAcknowledge}>
        I understand
      </button>
    </section>
  );
}
