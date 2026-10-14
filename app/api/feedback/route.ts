import { appendFile } from "node:fs/promises";

import { LIMITS } from "@/lib/research-input";
import { authorize, errorJson, json, requireJson } from "@/lib/research-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One JSON object per line. Never contains case text: only page, rating, an optional comment and the opaque client id. */
export async function POST(req: Request): Promise<Response> {
  const auth = await authorize(req, "/api/feedback");
  if (!auth.ok) return auth.response;
  const bad = requireJson(req);
  if (bad) return bad;

  let body: { page?: unknown; rating?: unknown; comment?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson(400, "invalid_json", "The request body must be valid JSON.");
  }
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return errorJson(422, "invalid_request", "Choose a rating from 1 to 5.");
  const page = typeof body.page === "string" && body.page.startsWith("/") ? body.page.split(/[?#]/)[0]!.slice(0, 100) : "/";
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, LIMITS.comment) : "";

  const line = JSON.stringify({ ts: new Date().toISOString(), page, rating, comment: comment || null, client: auth.clientId });
  try {
    await appendFile(process.env.FEEDBACK_FILE || "./feedback.jsonl", `${line}\n`, "utf8");
  } catch {
    return errorJson(500, "storage_failed", "Feedback could not be saved. Please tell the organiser directly.");
  }
  return json({ ok: true }, 201);
}
