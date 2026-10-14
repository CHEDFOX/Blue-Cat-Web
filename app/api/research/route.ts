import { mockJob, newMockJobId, isMockMode } from "@/lib/research-mock";
import { validateResearchInput } from "@/lib/research-input";
import { authorize, backendFailure, errorJson, json, requireJson, submitToBackend } from "@/lib/research-server";
import { dailyCounter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const auth = await authorize(req, "/api/research");
  if (!auth.ok) return auth.response;
  const bad = requireJson(req);
  if (bad) return bad;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson(400, "invalid_json", "The request body must be valid JSON.");
  }
  const parsed = validateResearchInput(raw);
  if (!parsed.ok) {
    return json({ error: { code: "invalid_request", message: Object.values(parsed.errors)[0] ?? "Invalid request." }, fields: parsed.errors }, 422);
  }

  const counter = dailyCounter();
  const use = counter.consume(auth.clientId);
  if (!use.allowed) {
    return errorJson(
      429,
      "daily_limit",
      `This invite code has used its ${use.limit} research runs for today. The limit resets at ${use.resetsAt} (UTC).`,
      { "Retry-After": String(Math.max(60, Math.ceil((Date.parse(use.resetsAt) - Date.now()) / 1000))) },
    );
  }

  if (isMockMode()) {
    const id = newMockJobId(parsed.value.question);
    return json({ id, status: mockJob(id)?.status ?? "queued" }, 202);
  }

  const out = await submitToBackend(parsed.value, auth.clientId);
  const body = out.body as { id?: unknown; status?: unknown } | null;
  if (out.status === 202 && typeof body?.id === "string") {
    return json({ id: body.id, status: typeof body.status === "string" ? body.status : "queued" }, 202);
  }
  counter.refund(auth.clientId); // the backend never accepted this run
  return backendFailure(out);
}
