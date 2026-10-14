import { describe, expect, it } from "vitest";

import { gateDecision, isGatedPath } from "@/lib/gate";
import {
  type AccessConfig,
  type SessionPayload,
  SESSION_TTL_SECONDS,
  codeId,
  createSession,
  getAccessConfig,
  matchInviteCode,
  parseCodes,
  safeNextPath,
  signSession,
  verifyActiveSession,
  verifySession,
} from "@/lib/session";

const SECRET = "a-test-secret-with-enough-length";

describe("session signing", () => {
  it("round-trips a signed session", async () => {
    const now = 1_800_000_000_000;
    const token = await createSession("EARLY-1", SECRET, now);
    const s = await verifySession(token, SECRET, now + 1000);
    expect(s?.cid).toBe(await codeId("early-1"));
    expect(s?.exp).toBe(Math.floor(now / 1000) + SESSION_TTL_SECONDS);
  });

  it("never puts the invite code in the token", async () => {
    const token = await createSession("EARLY-1", SECRET);
    expect(token).not.toContain("EARLY");
    expect(atob(token.split(".")[0]!.replaceAll("-", "+").replaceAll("_", "/"))).not.toContain("EARLY");
  });

  it("rejects a wrong secret, a tampered payload and a tampered signature", async () => {
    const token = await createSession("c", SECRET);
    expect(await verifySession(token, "another-secret-of-sufficient-length")).toBeNull();
    const [body, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ v: 1, cid: "x", iat: 1, exp: 9_999_999_999 })).replace(/=+$/, "");
    expect(await verifySession(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(await verifySession(`${body}.${sig!.slice(0, -2)}AA`, SECRET)).toBeNull();
  });

  it("rejects expired, malformed and empty tokens", async () => {
    const now = 1_800_000_000_000;
    const token = await createSession("c", SECRET, now);
    expect(await verifySession(token, SECRET, now + (SESSION_TTL_SECONDS + 1) * 1000)).toBeNull();
    for (const bad of ["", "abc", "a.b.c", "....", undefined, null]) expect(await verifySession(bad, SECRET)).toBeNull();
    const old = await signSession({ v: 1, cid: "c", iat: 1, exp: 2 }, SECRET);
    expect(await verifySession(old, SECRET)).toBeNull();
  });
});

describe("revocation", () => {
  it("a session stops working once its invite code is removed from the configuration", async () => {
    const token = await createSession("alpha", SECRET);
    const cfg = (codes: string[]) => ({ mode: "gated" as const, codes, secret: SECRET });
    expect(await verifyActiveSession(token, cfg(["ALPHA", "beta"]))).not.toBeNull();
    expect(await verifyActiveSession(token, cfg(["beta"]))).toBeNull();
  });
});

describe("invite codes", () => {
  it("parses a comma-separated list", () => {
    expect(parseCodes(" a, b ,,c ")).toEqual(["a", "b", "c"]);
    expect(parseCodes(undefined)).toEqual([]);
  });

  it("matches ignoring case and spaces, and rejects others", async () => {
    const codes = ["EARLY-1", "Second-Code"];
    expect(await matchInviteCode(" early-1 ", codes)).toBe("EARLY-1");
    expect(await matchInviteCode("SECOND-CODE", codes)).toBe("Second-Code");
    expect(await matchInviteCode("early-2", codes)).toBeNull();
    expect(await matchInviteCode("", codes)).toBeNull();
  });
});

describe("access config", () => {
  it("refuses to serve in production without codes or without a strong secret", () => {
    expect(getAccessConfig({ NODE_ENV: "production" }).mode).toBe("unavailable");
    expect(getAccessConfig({ NODE_ENV: "production", EARLY_ACCESS_CODES: "a" }).mode).toBe("unavailable");
    expect(getAccessConfig({ NODE_ENV: "production", EARLY_ACCESS_CODES: "a", SESSION_SECRET: "short" }).mode).toBe("unavailable");
    expect(getAccessConfig({ NODE_ENV: "production", EARLY_ACCESS_CODES: "a", SESSION_SECRET: SECRET }).mode).toBe("gated");
  });

  it("is open in development without codes and gated with them", () => {
    expect(getAccessConfig({ NODE_ENV: "development" }).mode).toBe("open");
    expect(getAccessConfig({ NODE_ENV: "development", EARLY_ACCESS_CODES: "a" }).mode).toBe("gated");
  });
});

describe("gate decision", () => {
  const gated: AccessConfig = { mode: "gated", codes: ["a"], secret: SECRET };
  const session: SessionPayload = { v: 1, cid: "c", iat: 1, exp: 2 };

  it("only gates research routes", () => {
    for (const p of ["/research", "/research/x", "/api/research", "/api/research/abc", "/api/feedback"]) expect(isGatedPath(p)).toBe(true);
    for (const p of ["/", "/coverage", "/provision", "/access", "/api/access", "/researcher"]) expect(isGatedPath(p)).toBe(false);
  });

  it("sends visitors without a session to login (pages) or 401 (api)", () => {
    expect(gateDecision("/research", gated, null)).toBe("login");
    expect(gateDecision("/api/research", gated, null)).toBe("unauthorized");
    expect(gateDecision("/research", gated, session)).toBe("allow");
    expect(gateDecision("/", gated, null)).toBe("allow");
  });

  it("refuses research routes when unconfigured, but not other pages", () => {
    const off: AccessConfig = { mode: "unavailable", reason: "x" };
    expect(gateDecision("/research", off, session)).toBe("unavailable");
    expect(gateDecision("/api/research/abc", off, null)).toBe("unavailable");
    expect(gateDecision("/coverage", off, null)).toBe("allow");
    expect(gateDecision("/research", { mode: "open" }, null)).toBe("allow");
  });
});

describe("safeNextPath", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNextPath("/research?job=abc")).toBe("/research?job=abc");
    for (const bad of ["//evil.example", "https://evil.example", "javascript:alert(1)", "/\\evil", "", null, undefined, "/a\nb"]) {
      expect(safeNextPath(bad)).toBe("/research");
    }
  });
});
