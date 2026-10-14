import { describe, expect, it } from "vitest";

import { DEFAULT_DAILY_LIMIT, DailyCounter, WindowLimiter, parseDailyLimit } from "@/lib/rate-limit";

const DAY = Date.parse("2026-03-10T12:00:00Z");

describe("DailyCounter", () => {
  it("allows up to the limit per key, then refuses with the reset time", () => {
    const c = new DailyCounter(2);
    expect(c.consume("a", DAY).allowed).toBe(true);
    expect(c.consume("a", DAY).allowed).toBe(true);
    const third = c.consume("a", DAY);
    expect(third.allowed).toBe(false);
    expect(third.resetsAt).toBe("2026-03-11T00:00:00.000Z");
    expect(c.consume("b", DAY).allowed).toBe(true); // other codes are independent
  });

  it("resets on the next UTC day", () => {
    const c = new DailyCounter(1);
    expect(c.consume("a", DAY).allowed).toBe(true);
    expect(c.consume("a", DAY).allowed).toBe(false);
    expect(c.consume("a", DAY + 86_400_000).allowed).toBe(true);
  });

  it("refunds a run the backend never accepted", () => {
    const c = new DailyCounter(1);
    c.consume("a", DAY);
    c.refund("a", DAY);
    expect(c.consume("a", DAY).allowed).toBe(true);
  });

  it("treats 0 as unlimited", () => {
    const c = new DailyCounter(0);
    for (let i = 0; i < 100; i++) expect(c.consume("a", DAY).allowed).toBe(true);
  });
});

describe("parseDailyLimit", () => {
  it("parses, defaults and ignores garbage", () => {
    expect(parseDailyLimit("5")).toBe(5);
    expect(parseDailyLimit("0")).toBe(0);
    expect(parseDailyLimit(undefined)).toBe(DEFAULT_DAILY_LIMIT);
    expect(parseDailyLimit("")).toBe(DEFAULT_DAILY_LIMIT);
    expect(parseDailyLimit("-3")).toBe(DEFAULT_DAILY_LIMIT);
    expect(parseDailyLimit("many")).toBe(DEFAULT_DAILY_LIMIT);
  });
});

describe("WindowLimiter", () => {
  it("allows a burst then blocks until the window passes", () => {
    const w = new WindowLimiter(3, 1000);
    expect([1, 2, 3].map(() => w.attempt("ip", 0))).toEqual([true, true, true]);
    expect(w.attempt("ip", 500)).toBe(false);
    expect(w.attempt("other", 500)).toBe(true);
    expect(w.attempt("ip", 1500)).toBe(true);
  });
});
