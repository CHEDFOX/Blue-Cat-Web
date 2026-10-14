import Link from "next/link";

import { LimitationList } from "@/components/LimitationList";
import { ApiError, api } from "@/lib/api";
import { authorityTone, formatPeriod, languageName, shortHash } from "@/lib/format";
import type { ProvisionResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ProvisionPage({ searchParams }: Props) {
  const params = await searchParams;
  const uri = one(params.uri);
  const asOf = ISO_DATE.test(one(params.as_of)) ? one(params.as_of) : "";
  const language = /^[a-z]{2,3}$/.test(one(params.language)) ? one(params.language) : "";
  // Provision URIs are root-relative identifiers in any jurisdiction's scheme (/akn/…, /us/…, /gb/…).
  if (!/^\/[a-z][a-z0-9-]*\/[^\s]+~[^\s]+$/.test(uri)) {
    return <p className="error">A provision URI is required.</p>;
  }

  let data: ProvisionResponse | null = null;
  let error: string | null = null;
  try {
    data = await api.provision(uri, asOf || undefined, language || undefined);
  } catch (e) {
    error = e instanceof ApiError ? e.message : "The research service is unavailable.";
  }
  if (!data) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }
  const v = data.version;

  return (
    <>
      <p className="meta">
        <Link href="/">← Search</Link>
      </p>
      <h1>{data.provision.citation}</h1>
      <p className="lede">
        {data.instrument.title} · {data.instrument.jurisdiction} · status on {data.as_of}:{" "}
        <strong data-testid="status-on-date">{data.status_on_date.replaceAll("_", " ")}</strong>
      </p>

      <form method="get" action="/provision" className="search" aria-label="Change date or language">
        <input type="hidden" name="uri" value={data.provision.uri} />
        <div className="row">
          <label>
            Law as of
            <input type="date" name="as_of" defaultValue={data.as_of} />
          </label>
          <label>
            Language version
            <select name="language" defaultValue={data.language}>
              {data.available_languages.map((l) => (
                <option key={l} value={l}>
                  {languageName(l)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary" type="submit">
          Show version
        </button>
      </form>

      {v ? (
        <article className="card">
          <div className="card-head">
            <p className="meta">
              {v.heading ? `${v.heading} · ` : ""}
              {formatPeriod(v.valid_from, v.valid_to, v.valid_to_basis)}
            </p>
            <span className={`tag ${authorityTone(v.authority.category)}`} title={v.authority.rationale}>
              {v.authority.label}
            </span>
          </div>
          <blockquote className="text" lang={data.language} data-testid="exact-text">
            {v.text || "(no text: repealed)"}
          </blockquote>
          <dl className="kv">
            <dt>Expression</dt>
            <dd className="mono">{v.expression_uri}</dd>
            <dt>Source</dt>
            <dd>
              {v.source.source_name} · {v.source.licence_id} · document{" "}
              <span className="mono">{v.source.document_id}</span>
            </dd>
            <dt>Document SHA-256</dt>
            <dd className="mono" title={v.source.sha256}>
              {shortHash(v.source.sha256)}
            </dd>
            <dt>Text SHA-256</dt>
            <dd className="mono" title={v.text_sha256}>
              {shortHash(v.text_sha256)}
            </dd>
            <dt>Currency</dt>
            <dd>{v.currency_date ?? "not stated by source"}</dd>
          </dl>
        </article>
      ) : null}

      <LimitationList items={data.limitations} />

      <h2>Version timeline ({languageName(data.language)})</h2>
      <ol className="timeline" data-testid="timeline">
        {data.timeline.map((t) => (
          <li key={t.id} className={t.selected ? "selected" : undefined}>
            {t.status.replaceAll("_", " ")}: {formatPeriod(t.valid_from, t.valid_to, t.valid_to_basis)}
            {t.selected ? " (applies on the selected date)" : ""}
            {t.text ? <blockquote className="text">{t.text}</blockquote> : null}
            {t.note ? <p className="meta">{t.note}</p> : null}
          </li>
        ))}
      </ol>
    </>
  );
}
