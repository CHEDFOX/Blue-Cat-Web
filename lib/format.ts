// Presentation helpers. Pure functions, unit-tested.
import type { Limitation, Severity } from "./types";

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function sortLimitations(items: Limitation[]): Limitation[] {
  return [...items].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code),
  );
}

export function countBySeverity(items: Limitation[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const l of items) out[l.severity] += 1;
  return out;
}

export function formatPeriod(from: string | null | undefined, to: string | null | undefined, basis?: string): string {
  if (!from) return "no commencement recorded";
  const end = to ? `${to}${basis === "derived" ? " (derived)" : ""}` : "open";
  return `${from} → ${end}`;
}

/** Bands authority categories into three visual tones; the category text is always shown too. */
export function authorityTone(category: string): "binding" | "qualified" | "not-binding" {
  if (["binding_constitution", "binding_legislation", "binding_precedent"].includes(category)) return "binding";
  if (["precedent_vertical", "treaty_obligation", "persuasive_precedent"].includes(category)) return "qualified";
  return "not-binding";
}

export function shortHash(sha: string): string {
  return sha.length > 12 ? `${sha.slice(0, 12)}…` : sha;
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
