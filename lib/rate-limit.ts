// Best-effort, in-memory counters. State lives in one Node process: with several instances (or
// serverless cold starts) the effective limits are multiplied. Fine for an early-tester pilot;
// replace with a shared store before wider use (see docs/early-access.md).

export const DEFAULT_DAILY_LIMIT = 20;

/** RESEARCH_DAILY_LIMIT: runs per invite code per UTC day. 0 disables the cap. */
export function parseDailyLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_LIMIT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_LIMIT;
}

export interface ConsumeResult {
  allowed: boolean;
  used: number;
  limit: number;
  /** Start of the next UTC day, when the counter resets. */
  resetsAt: string;
}

function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export class DailyCounter {
  private counts = new Map<string, number>();
  private day = "";

  constructor(private readonly limit: number) {}

  private roll(nowMs: number): void {
    const d = dayKey(nowMs);
    if (d !== this.day) {
      this.counts.clear();
      this.day = d;
    }
  }

  consume(key: string, nowMs = Date.now()): ConsumeResult {
    this.roll(nowMs);
    const used = this.counts.get(key) ?? 0;
    const startOfDay = Date.parse(`${this.day}T00:00:00Z`);
    const resetsAt = new Date(startOfDay + 86_400_000).toISOString();
    if (this.limit > 0 && used >= this.limit) return { allowed: false, used, limit: this.limit, resetsAt };
    this.counts.set(key, used + 1);
    return { allowed: true, used: used + 1, limit: this.limit, resetsAt };
  }

  /** Give a run back when the backend never accepted it. */
  refund(key: string, nowMs = Date.now()): void {
    this.roll(nowMs);
    const used = this.counts.get(key) ?? 0;
    if (used > 0) this.counts.set(key, used - 1);
  }
}

/** Sliding-window limiter, used against invite-code guessing. */
export class WindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt and reports whether it is allowed. */
  attempt(key: string, nowMs = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => nowMs - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.every((t) => nowMs - t >= this.windowMs)) this.hits.delete(k);
    }
    return true;
  }
}

const g = globalThis as unknown as { __ulisDaily?: { limit: number; counter: DailyCounter }; __ulisAttempts?: WindowLimiter };

/** Process-wide singletons (survive hot reloads and are shared by all route handlers). */
export function dailyCounter(env: Record<string, string | undefined> = process.env): DailyCounter {
  const limit = parseDailyLimit(env.RESEARCH_DAILY_LIMIT);
  if (!g.__ulisDaily || g.__ulisDaily.limit !== limit) g.__ulisDaily = { limit, counter: new DailyCounter(limit) };
  return g.__ulisDaily.counter;
}

export function accessAttempts(): WindowLimiter {
  g.__ulisAttempts ??= new WindowLimiter(10, 10 * 60_000);
  return g.__ulisAttempts;
}
