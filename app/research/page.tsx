import { ResearchApp, type JurisdictionOption } from "@/components/research/ResearchApp";
import { api } from "@/lib/api";
import { isMockMode, mockJurisdictions } from "@/lib/research-mock";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const JOB_ID = /^[A-Za-z0-9_-]{8,64}$/;

export default async function ResearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const mock = isMockMode();
  const jobParam = Array.isArray(params.job) ? params.job[0] : params.job;

  let jurisdictions: JurisdictionOption[] = [];
  let jurisdictionsError = false;
  try {
    const list = mock ? mockJurisdictions() : (await api.jurisdictions()).jurisdictions;
    jurisdictions = list.map((j) => ({ id: j.id, name: j.name, corpusStatus: j.corpus_status, fictional: j.fictional }));
  } catch {
    jurisdictionsError = true;
  }

  const pollMs = Number.parseInt(process.env.ULIS_RESEARCH_POLL_MS ?? "", 10);
  return (
    <ResearchApp
      jurisdictions={jurisdictions}
      jurisdictionsError={jurisdictionsError}
      mock={mock}
      pollMs={Number.isFinite(pollMs) && pollMs >= 200 ? pollMs : 2000}
      initialJobId={jobParam && JOB_ID.test(jobParam) ? jobParam : null}
    />
  );
}
