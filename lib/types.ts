// Types mirroring the ULIS backend API (see Blue-Cat-Backend/ulis/retrieval/search.py).

export type Severity = "critical" | "warning" | "info";

export interface Limitation {
  code: string;
  severity: Severity;
  message: string;
}

export interface Authority {
  category: string;
  label: string;
  rationale: string;
  weight?: number;
}

export interface SourceInfo {
  source_id: string;
  source_name: string;
  source_authority: string;
  licence_id: string;
  licence_name: string;
  attribution: string | null;
  document_id: string;
  external_id: string;
  document_uri: string | null;
  retrieved_at: string;
  sha256: string;
  locator: string;
}

export interface Treatment {
  relation: string;
  citing_kind: string;
  citing_title: string;
  citing_citation: string;
  citing_uri: string;
  date: string | null;
  pinpoint: string | null;
  is_proposed: boolean;
}

export interface TimelineEntry {
  id: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  valid_to_basis: string;
  current_hit?: boolean;
  selected?: boolean;
  text?: string;
  note?: string | null;
}

export interface ParallelVersion {
  language: string;
  version_id: string;
  authoritative: boolean;
  text_origin: string;
  text: string;
  citation: string;
}

export interface SearchHit {
  rank: number;
  passage_id: string;
  kind: "provision" | "judgment_paragraph";
  jurisdiction: { id: string; name: string; fictional: boolean; verification: string };
  document: {
    uri: string;
    title: string;
    type: string;
    is_proposed?: boolean;
    court?: string;
    decision_date?: string;
    neutral_citation?: string | null;
  };
  unit: { uri: string; eid: string; label: string; heading: string | null };
  version: {
    id: string;
    expression_uri: string;
    language: string;
    status?: string;
    valid_from?: string | null;
    valid_to?: string | null;
    valid_to_basis?: string;
    authoritative: boolean;
    text_origin: string;
    consolidation?: string;
    currency_date?: string | null;
    note?: string | null;
  };
  text: string;
  text_sha256: string;
  citation: string;
  authority: Authority;
  source: SourceInfo;
  score: { final: number; lexical: number; authority_weight: number; length_factor?: number; matched_via: string };
  parallel_versions?: ParallelVersion[];
  timeline?: TimelineEntry[];
  treatment?: { judicial: Treatment[]; legislative: Treatment[] } | Treatment[];
  limitations: Limitation[];
}

export interface CoverageEntry {
  jurisdiction: string;
  name: string;
  fictional: boolean;
  profile_version: string;
  profile_verification: string;
  corpus_status: string;
  instruments: number;
  judgments: number;
  passages: number;
  indexed_languages: string[];
  active_sources: string[];
  known_gaps: string[];
}

export interface SearchResponse {
  query: Record<string, unknown> & { as_of: string; as_of_defaulted: boolean };
  scope: { target: string | null; chain: string[]; case_law: string[]; treaties: string[]; foreign_included: boolean };
  clarifications: { field: string; reason: string; options: string[] }[];
  query_expansions: { concept: string; labels: Record<string, string[]> }[];
  total_candidates: number;
  results: SearchHit[];
  coverage: CoverageEntry[];
  limitations: Limitation[];
  disclaimer: string;
}

export interface JurisdictionSummary {
  id: string;
  name: string;
  kind: string;
  parent: string | null;
  fictional: boolean;
  profile_version: string;
  verification: string;
  official_languages: string[];
  corpus_status: string;
  legal_families: string[];
  courts: { id: string; name: string }[];
}

export interface ProvisionResponse {
  provision: { uri: string; eid: string; kind: string; num_path: string[]; citation: string };
  instrument: { uri: string; title: string; type: string; jurisdiction: string; is_proposed: boolean };
  as_of: string;
  language: string;
  available_languages: string[];
  status_on_date: string;
  version: {
    id: string;
    status: string;
    heading: string | null;
    text: string;
    text_sha256: string;
    valid_from: string | null;
    valid_to: string | null;
    valid_to_basis: string;
    note: string | null;
    expression_uri: string;
    currency_date: string | null;
    authority: Authority;
    source: {
      source_id: string;
      source_name: string;
      document_id: string;
      sha256: string;
      retrieved_at: string;
      locator: string;
      licence_id: string;
    };
  } | null;
  timeline: TimelineEntry[];
  children: { uri: string; num_path: string[] }[];
  limitations: Limitation[];
}

export interface SourceDescriptor {
  id: string;
  name: string;
  publisher: string;
  kind: string;
  authority: string;
  jurisdictions: string[];
  status: string;
  licence: { id: string; name: string; review_status: string; automated_processing: string; notes?: string | null };
  known_limitations: string[];
}

// ---------------------------------------------------------------------------
// Research assistant (backend `POST /v1/research`, `GET /v1/research/{id}`).
// Contract owned by the backend; the UI parses it defensively (lib/research.ts).
// ---------------------------------------------------------------------------

export type ResearchDepth = "standard" | "deep";
export type ResearchStatus = "queued" | "running" | "completed" | "failed" | "refused";
export type ResearchStage = "understanding" | "searching" | "drafting" | "verifying";
export type Confidence = "high" | "medium" | "low";

export interface ResearchRequest {
  question: string;
  case_text: string | null;
  jurisdiction: string | null;
  as_of: string | null;
  depth: ResearchDepth;
}

export interface ResearchProgress {
  at: string;
  stage: ResearchStage;
  message: string;
}

export interface UnderstandingJurisdiction {
  id: string;
  reason: string;
  covered: boolean;
}

export interface UnderstandingIssue {
  id: string;
  title: string;
  area_of_law: string;
  question: string;
}

export interface ResearchUnderstanding {
  summary: string;
  facts: string[];
  as_of: string | null;
  jurisdictions: UnderstandingJurisdiction[];
  issues: UnderstandingIssue[];
}

export interface ReasoningItem {
  text: string;
  authority_ids: string[];
}

export interface GuidanceIssue {
  issue_id: string;
  conclusion: string;
  confidence: Confidence;
  reasoning: ReasoningItem[];
  uncertainties: string[];
}

export interface ResearchGuidance {
  summary: string;
  issues: GuidanceIssue[];
  next_steps: string[];
}

export interface ResearchAuthority {
  id: string;
  citation: string;
  uri: string;
  jurisdiction: string;
  kind: "provision" | "judgment_paragraph";
  text: string;
  text_sha256: string;
  valid_from: string | null;
  valid_to: string | null;
  authority_label: string;
  limitations: Limitation[];
  source: { name: string; url: string | null; attribution: string | null };
  verified: boolean;
}

export interface ResearchResult {
  understanding: ResearchUnderstanding;
  guidance: ResearchGuidance;
  authorities: ResearchAuthority[];
  coverage_notes: string[];
  removed_claims: number;
  limitations: Limitation[];
  disclaimer: string;
  usage: { searches: number; model: string; input_tokens: number; output_tokens: number };
}

export interface ResearchJob {
  id: string;
  status: ResearchStatus;
  created_at: string | null;
  expires_at: string | null;
  progress: ResearchProgress[];
  result: ResearchResult | null;
  error: { code: string; message: string } | null;
}
