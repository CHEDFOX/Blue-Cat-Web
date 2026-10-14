// Pure access-gate decision, shared by the middleware and the unit tests.
import type { AccessConfig, SessionPayload } from "./session";

export type GateDecision = "allow" | "login" | "unauthorized" | "unavailable";

/** Research pages and APIs; the existing search, provision and coverage pages are not gated. */
export function isGatedPath(pathname: string): boolean {
  return (
    pathname === "/research" ||
    pathname.startsWith("/research/") ||
    pathname === "/api/research" ||
    pathname.startsWith("/api/research/") ||
    pathname === "/api/feedback"
  );
}

export function gateDecision(pathname: string, config: AccessConfig, session: SessionPayload | null): GateDecision {
  if (!isGatedPath(pathname)) return "allow";
  if (config.mode === "unavailable") return "unavailable";
  if (config.mode === "open") return "allow";
  if (session) return "allow";
  return pathname.startsWith("/api/") ? "unauthorized" : "login";
}
