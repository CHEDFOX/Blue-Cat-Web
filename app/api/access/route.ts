import { accessAttempts } from "@/lib/rate-limit";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSession,
  currentAccessConfig,
  matchInviteCode,
  safeNextPath,
} from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export async function POST(req: Request): Promise<Response> {
  const cfg = currentAccessConfig();
  const form = await req.formData().catch(() => null);
  const next = safeNextPath(typeof form?.get("next") === "string" ? (form?.get("next") as string) : null);
  const back = (error: string) => redirect(`/access?error=${error}&next=${encodeURIComponent(next)}`);

  if (cfg.mode === "unavailable") return back("unavailable");
  if (cfg.mode === "open") return redirect(next);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  if (!accessAttempts().attempt(ip)) return back("rate");

  const code = typeof form?.get("code") === "string" ? (form?.get("code") as string) : "";
  const matched = code.length > 0 && code.length <= 200 ? await matchInviteCode(code, cfg.codes) : null;
  if (!matched) return back("invalid");

  const token = await createSession(matched, cfg.secret);
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const attrs = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_TTL_SECONDS}`];
  if (proto === "https") attrs.push("Secure");
  return redirect(next, attrs.join("; "));
}
