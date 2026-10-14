import { sortLimitations } from "@/lib/format";
import type { Limitation } from "@/lib/types";

/** Critical and warning limitations are always visible; informational ones fold away. */
export function LimitationList({ items, label = "Legal-status limitations" }: { items: Limitation[]; label?: string }) {
  const sorted = sortLimitations(items);
  const prominent = sorted.filter((l) => l.severity !== "info");
  const info = sorted.filter((l) => l.severity === "info");
  return (
    <section aria-label={label}>
      {prominent.length > 0 && (
        <ul className="limits">
          {prominent.map((l, i) => (
            <li key={`${l.code}-${i}`} className={l.severity} data-code={l.code}>
              <code>{l.code}</code>
              {l.message}
            </li>
          ))}
        </ul>
      )}
      {info.length > 0 && (
        <details>
          <summary>{info.length} more notes (version period, currency, treatment, provenance)</summary>
          <ul className="limits">
            {info.map((l, i) => (
              <li key={`${l.code}-${i}`} className="info" data-code={l.code}>
                <code>{l.code}</code>
                {l.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
