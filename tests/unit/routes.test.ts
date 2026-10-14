import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as feedbackPost } from "@/app/api/feedback/route";
import { POST as accessPost } from "@/app/api/access/route";
import { GET as jobGet } from "@/app/api/research/[id]/route";
import { POST as researchPost } from "@/app/api/research/route";
import { SESSION_COOKIE, createSession } from "@/lib/session";

const SECRET = "route-test-secret-long-enough";

async function cookieFor(code: string): Promise<string> {
  return `${SESSION_COOKIE}=${await createSession(code, SECRET)}`;
}

function post(body: unknown, cookie?: string, path = "/api/research", type = "application/json"): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": type, ...(cookie ? { cookie } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("EARLY_ACCESS_CODES", "alpha-1,beta-2");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("ULIS_RESEARCH_MOCK", "1");
  vi.stubEnv("RESEARCH_DAILY_LIMIT", "2");
  vi.stubEnv("ULIS_API_KEY", "super-secret-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/research (mock mode)", () => {
  it("requires a valid session", async () => {
    expect((await researchPost(post({ question: "q" }))).status).toBe(401);
    expect((await researchPost(post({ question: "q" }, `${SESSION_COOKIE}=forged.token`))).status).toBe(401);
  });

  it("refuses to serve in production when no invite codes are configured", async () => {
    vi.stubEnv("EARLY_ACCESS_CODES", "");
    const cookie = await cookieFor("alpha-1");
    expect((await researchPost(post({ question: "q" }, cookie))).status).toBe(503);
  });

  it("accepts a valid request and returns a job id the GET route understands", async () => {
    vi.stubEnv("RESEARCH_DAILY_LIMIT", "50");
    const cookie = await cookieFor("alpha-1");
    const res = await researchPost(post({ question: "How long may data be kept?", depth: "deep" }, cookie));
    expect(res.status).toBe(202);
    const { id, status } = await res.json();
    expect(id).toMatch(/^mock-\d+-o$/);
    expect(status).toBe("queued");
    const got = await jobGet(new Request(`http://localhost/api/research/${id}`, { headers: { cookie } }), { params: Promise.resolve({ id }) });
    expect(got.status).toBe(200);
    expect((await got.json()).id).toBe(id);
    expect(got.headers.get("cache-control")).toBe("no-store");
  });

  it("validates input and content type", async () => {
    vi.stubEnv("RESEARCH_DAILY_LIMIT", "50");
    const cookie = await cookieFor("alpha-1");
    const bad = await researchPost(post({ question: "" }, cookie));
    expect(bad.status).toBe(422);
    expect((await bad.json()).fields.question).toBeTruthy();
    expect((await researchPost(post("not json", cookie))).status).toBe(400);
    expect((await researchPost(post({ question: "q" }, cookie, "/api/research", "text/plain"))).status).toBe(415);
  });

  it("enforces the per-code daily cap independently per code", async () => {
    vi.stubEnv("RESEARCH_DAILY_LIMIT", "2");
    const a = await cookieFor("alpha-1");
    const b = await cookieFor("beta-2");
    expect((await researchPost(post({ question: "q" }, a))).status).toBe(202);
    expect((await researchPost(post({ question: "q" }, a))).status).toBe(202);
    const limited = await researchPost(post({ question: "q" }, a));
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe("daily_limit");
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect((await researchPost(post({ question: "q" }, b))).status).toBe(202);
  });

  it("does not leak the API key or case text in any response", async () => {
    vi.stubEnv("RESEARCH_DAILY_LIMIT", "50");
    const cookie = await cookieFor("alpha-1");
    const res = await researchPost(post({ question: "q", case_text: "SECRET CLIENT FACTS" }, cookie));
    const text = await res.text();
    expect(text).not.toContain("super-secret-key");
    expect(text).not.toContain("SECRET CLIENT FACTS");
  });
});

describe("GET /api/research/[id]", () => {
  it("404s for unknown or malformed ids and 401s without a session", async () => {
    const cookie = await cookieFor("alpha-1");
    const get = (id: string, c?: string) =>
      jobGet(new Request(`http://localhost/api/research/${id}`, { headers: c ? { cookie: c } : {} }), { params: Promise.resolve({ id }) });
    expect((await get("00000000-0000-0000-0000-000000000000", cookie)).status).toBe(404);
    expect((await get("../etc/passwd", cookie)).status).toBe(404);
    expect((await get("mock-1760000000000-o")).status).toBe(401);
  });
});

describe("POST /api/access", () => {
  const form = (code: string, next = "/research") => {
    const fd = new FormData();
    fd.set("code", code);
    fd.set("next", next);
    return new Request("http://localhost/api/access", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } });
  };

  it("sets an HttpOnly signed cookie for a valid code and redirects", async () => {
    const res = await accessPost(form("ALPHA-1"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/research");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("alpha");
  });

  it("rejects a wrong code without setting a cookie, and never redirects off-site", async () => {
    const bad = await accessPost(form("nope"));
    expect(bad.headers.get("location")).toContain("/access?error=invalid");
    expect(bad.headers.get("set-cookie")).toBeNull();
    const evil = await accessPost(form("alpha-1", "//evil.example"));
    expect(evil.headers.get("location")).toBe("/research");
  });
});

describe("POST /api/feedback", () => {
  it("appends a JSON line with page, rating and comment, and never case text", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fb-"));
    const file = path.join(dir, "feedback.jsonl");
    vi.stubEnv("FEEDBACK_FILE", file);
    const cookie = await cookieFor("alpha-1");
    const res = await feedbackPost(post({ page: "/research?job=abc", rating: 4, comment: "  useful  ", case_text: "CLIENT SECRET" }, cookie, "/api/feedback"));
    expect(res.status).toBe(201);
    const line = JSON.parse((await readFile(file, "utf8")).trim());
    expect(line).toMatchObject({ page: "/research", rating: 4, comment: "useful" });
    expect(Object.keys(line).sort()).toEqual(["client", "comment", "page", "rating", "ts"]);
    expect(JSON.stringify(line)).not.toContain("CLIENT SECRET");
    expect((await feedbackPost(post({ rating: 9 }, cookie, "/api/feedback"))).status).toBe(422);
    expect((await feedbackPost(post({ rating: 3 }, undefined, "/api/feedback"))).status).toBe(401);
  });
});
