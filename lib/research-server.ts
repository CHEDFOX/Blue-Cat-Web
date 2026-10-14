// Server-side plumbing for the research route handlers: access check and backend calls.
// The API key is read here and never leaves the server.
import "server-only";

import { gateDecision } from "./gate";
import { LIMITS } from "./research-input";
import { SESSION_COOKIE, currentAccessConfig, verifyActiveSession } from "./session";
import type { ResearchRequest } from "./types";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export function errorJson(status: number, code: string, message: string, extra: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, extra);
}

export type Authorized = { ok: true; clientId: string } | { ok: false; response: Response };

function cookieValue(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** Defence in depth: the middleware already gates these routes, the handlers check again. */
export async function authorize(req: Request, pathname: string): Promise<Authorized> {
  const cfg = currentAccessConfig();
  const session = cfg.mode === "gated" ? await verifyActiveSession(cookieValue(req, SESSION_COOKIE), cfg) : null;
  switch (gateDecision(pathname, cfg, session)) {
    case "allow":
      return { ok: true, clientId: session?.cid ?? "open" };
    case "unavailable":
      return { ok: false, response: errorJson(503, "not_configured", "The research assistant is not available on this deployment.") };
    default:
      return { ok: false, response: errorJson(401, "unauthorized", "Enter your invite code to use the research assistant.") };
  }
}

/** Reject cross-site form posts: JSON bodies need a preflight, plain forms cannot send this type. */
export function requireJson(req: Request): Response | null {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return errorJson(415, "unsupported_media_type", "Send JSON.");
  }
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > LIMITS.bodyBytes) return errorJson(413, "too_large", "The request is too large.");
  return null;
}

function backendBase(): string {
  return (process.env.ULIS_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

function backendHeaders(clientId: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.ULIS_API_KEY) headers["X-API-Key"] = process.env.ULIS_API_KEY;
  // Opaque id of the invite code (never the code). Set ULIS_IDENTITY_HEADER=off to disable.
  const name = (process.env.ULIS_IDENTITY_HEADER ?? "X-ULIS-Client").trim();
  if (name && name.toLowerCase() !== "off" && /^[A-Za-z0-9-]{1,64}$/.test(name)) headers[name] = clientId;
  return headers;
}

/** FastAPI validation details can echo the input, so only field names and messages are kept. */
export function describeBackendError(detail: unknown): string {
  if (typeof detail === "string") return detail.slice(0, 300);
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        if (!d || typeof d !== "object") return null;
        const { loc, msg } = d as { loc?: unknown; msg?: unknown };
        const field = Array.isArray(loc) ? loc.filter((x) => x !== "body").join(".") : "";
        return typeof msg === "string" ? `${field ? `${field}: ` : ""}${msg}` : null;
      })
      .filter((x): x is string => !!x);
    if (parts.length) return parts.join("; ").slice(0, 300);
  }
  return "The research service rejected the request.";
}

export type BackendOutcome = { status: number; body: unknown };

async function call(path: string, init: RequestInit, timeoutMs: number): Promise<BackendOutcome> {
  try {
    const res = await fetch(`${backendBase()}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export function submitToBackend(req: ResearchRequest, clientId: string): Promise<BackendOutcome> {
  return call(
    "/v1/research",
    { method: "POST", headers: { ...backendHeaders(clientId), "Content-Type": "application/json" }, body: JSON.stringify(req) },
    20_000,
  );
}

export function fetchFromBackend(id: string, clientId: string): Promise<BackendOutcome> {
  return call(`/v1/research/${encodeURIComponent(id)}`, { method: "GET", headers: backendHeaders(clientId) }, 15_000);
}

/** Maps a failed backend outcome to a response that never leaks backend internals or credentials. */
export function backendFailure(out: BackendOutcome): Response {
  const detail = (out.body as { detail?: unknown } | null)?.detail;
  switch (out.status) {
    case 400:
    case 422:
      return errorJson(out.status, "invalid_request", describeBackendError(detail));
    case 413:
      return errorJson(413, "too_large", "The case text is too long for the research service.");
    case 404:
      return errorJson(404, "not_found", "This research job was not found. Results are deleted after 24 hours.");
    case 429:
      return errorJson(429, "backend_busy", "The research service is at capacity or its limit was reached. Try again later.", { "Retry-After": "60" });
    case 0:
      return errorJson(502, "backend_unavailable", "The research service is unavailable. Try again in a few minutes.");
    default:
      return errorJson(502, "backend_error", "The research service returned an unexpected error.");
  }
}
