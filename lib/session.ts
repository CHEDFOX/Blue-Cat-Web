// Signed, stateless early-access sessions. Web Crypto only, so the same module runs in the
// Edge middleware, in route handlers and in unit tests. No user database: a session says only
// "this browser entered a valid invite code" (identified by an opaque hash of the code).

export const SESSION_COOKIE = "ulis_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 16;
// Used only outside production when SESSION_SECRET is unset, so local development works.
const DEV_SECRET = "ulis-dev-session-secret-not-for-production";

export interface SessionPayload {
  v: 1;
  /** Opaque id derived from the invite code (never the code itself). */
  cid: string;
  iat: number;
  exp: number;
}

export type AccessConfig =
  | { mode: "gated"; codes: string[]; secret: string }
  | { mode: "open" } // development only: no invite codes configured
  | { mode: "unavailable"; reason: string };

const enc = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseCodes(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

export function getAccessConfig(env: Record<string, string | undefined> = process.env): AccessConfig {
  const codes = parseCodes(env.EARLY_ACCESS_CODES);
  const production = env.NODE_ENV === "production";
  const secret = env.SESSION_SECRET?.trim() ?? "";
  if (codes.length === 0) {
    return production
      ? { mode: "unavailable", reason: "EARLY_ACCESS_CODES is not set, so the research assistant is disabled." }
      : { mode: "open" };
  }
  if (secret.length >= MIN_SECRET_LENGTH) return { mode: "gated", codes, secret };
  if (production) {
    return {
      mode: "unavailable",
      reason: `SESSION_SECRET must be set (at least ${MIN_SECRET_LENGTH} characters), so the research assistant is disabled.`,
    };
  }
  return { mode: "gated", codes, secret: DEV_SECRET };
}

/** Opaque, stable identifier for an invite code. Safe to log, store and send to the backend. */
export async function codeId(code: string): Promise<string> {
  return (await sha256Hex(`ulis-code:${code.trim().toLowerCase()}`)).slice(0, 16);
}

/** Constant-time comparison of the submitted code against every configured code. */
export async function matchInviteCode(input: string, codes: string[]): Promise<string | null> {
  const wanted = await sha256Hex(input.trim().toLowerCase());
  let match: string | null = null;
  for (const code of codes) {
    const candidate = await sha256Hex(code.trim().toLowerCase());
    let diff = candidate.length ^ wanted.length;
    for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ (wanted.charCodeAt(i) || 0);
    if (diff === 0) match = code;
  }
  return match;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = toB64Url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(body)));
  return `${body}.${toB64Url(sig)}`;
}

export async function createSession(code: string, secret: string, nowMs = Date.now()): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return signSession({ v: 1, cid: await codeId(code), iat, exp: iat + SESSION_TTL_SECONDS }, secret);
}

export async function verifySession(
  token: string | undefined | null,
  secret: string,
  nowMs = Date.now(),
): Promise<SessionPayload | null> {
  if (!token || token.length > 1024) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const sigBytes = fromB64Url(sig);
  if (!sigBytes) return null;
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), sigBytes, enc.encode(body));
  if (!ok) return null;
  const raw = fromB64Url(body);
  if (!raw) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(raw)) as Partial<SessionPayload>;
    if (p.v !== 1 || typeof p.cid !== "string" || typeof p.exp !== "number" || typeof p.iat !== "number") return null;
    if (p.exp * 1000 <= nowMs) return null;
    return { v: 1, cid: p.cid, iat: p.iat, exp: p.exp };
  } catch {
    return null;
  }
}

/** Only same-site relative paths are allowed as post-login targets (no open redirect). */
export function safeNextPath(next: string | null | undefined, fallback = "/research"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) {
    return fallback;
  }
  return next;
}

/** Reads the access settings from the process environment (explicit keys: Edge-runtime safe). */
export function currentAccessConfig(): AccessConfig {
  return getAccessConfig({
    NODE_ENV: process.env.NODE_ENV,
    EARLY_ACCESS_CODES: process.env.EARLY_ACCESS_CODES,
    SESSION_SECRET: process.env.SESSION_SECRET,
  });
}

/** A valid signature is not enough: the invite code must still be configured (revocation by removal). */
export async function verifyActiveSession(
  token: string | undefined | null,
  cfg: Extract<AccessConfig, { mode: "gated" }>,
  nowMs = Date.now(),
): Promise<SessionPayload | null> {
  const session = await verifySession(token, cfg.secret, nowMs);
  if (!session) return null;
  for (const code of cfg.codes) if ((await codeId(code)) === session.cid) return session;
  return null;
}
