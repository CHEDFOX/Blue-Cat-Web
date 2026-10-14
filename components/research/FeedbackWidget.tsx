"use client";

import { useState } from "react";

export function FeedbackWidget() {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === null) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: window.location.pathname, rating, comment }),
      });
      setStatus(res.ok ? "sent" : "error");
      if (res.ok) setComment("");
    } catch {
      setStatus("error");
    }
  }

  return (
    <details className="feedback no-print">
      <summary>Give feedback on this page</summary>
      {status === "sent" ? (
        <p role="status">Thank you. Your feedback was saved.</p>
      ) : (
        <form onSubmit={submit} className="search">
          <fieldset>
            <legend>How useful was this?</legend>
            <div className="rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n}>
                  <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} /> {n}
                </label>
              ))}
            </div>
            <p className="meta">1 = not useful, 5 = very useful</p>
          </fieldset>
          <label>
            Comment (optional)
            <textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <p className="meta">Do not include case details or client information. Your case text is never stored with feedback.</p>
          <button className="primary" type="submit" disabled={rating === null || status === "sending"}>
            Send feedback
          </button>
          {status === "error" && (
            <p className="error" role="alert">
              Feedback could not be sent. Please try again.
            </p>
          )}
        </form>
      )}
    </details>
  );
}
