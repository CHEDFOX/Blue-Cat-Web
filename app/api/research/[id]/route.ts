import { isMockMode, mockJob } from "@/lib/research-mock";
import { authorize, backendFailure, errorJson, fetchFromBackend, json } from "@/lib/research-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOB_ID = /^[A-Za-z0-9_-]{8,64}$/;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorize(req, "/api/research/job");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!JOB_ID.test(id)) return errorJson(404, "not_found", "This research job was not found. Results are deleted after 24 hours.");

  if (isMockMode()) {
    const job = mockJob(id);
    return job ? json(job) : errorJson(404, "not_found", "This research job was not found. Results are deleted after 24 hours.");
  }
  const out = await fetchFromBackend(id, auth.clientId);
  if (out.status === 200 && out.body && typeof out.body === "object") return json(out.body);
  return backendFailure(out);
}
