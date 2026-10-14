# Blue Cat Web: ULIS research UI

Next.js (App Router, TypeScript) frontend for the Universal Legal Intelligence System. The
backend, data model and design documents are in
[`Blue-Cat-Backend`](https://github.com/CHEDFOX/Blue-Cat-Backend) (start with
`docs/architecture.md`).

> Research aid, not legal advice. Coverage is a small sample: part of US federal law (official
> GPO files) plus fictional test jurisdictions.

## Features

- **Search** (`/`): question, jurisdiction (tree), "law as of" date, optional forum court,
  and toggles for foreign law, bills, provisions not yet in force and historical versions.
  Each result shows the jurisdiction-specific citation, the exact source text, the authority
  label with its rationale, legal-status limitations (critical and warning always visible),
  provenance (source, licence, document and text SHA-256, locator), version timeline,
  judicial and legislative treatment, parallel authentic language versions, and the ranking
  breakdown.
- **Point-in-time view** (`/provision?uri=…&as_of=…&language=…`): what a provision said on a
  date, its status on that date and its full version history.
- **Coverage and sources** (`/coverage`): what is actually indexed per jurisdiction, known
  gaps, and each source's licence-review status.
- **Research assistant** (`/research`, invite-only): see [`docs/early-access.md`](docs/early-access.md).

## Security

The API key is read from server-side environment variables (`ULIS_API_URL`,
`ULIS_API_KEY`) and used only in server components (`lib/api.ts` imports `server-only`).
It never reaches the browser. Search input is validated before being forwarded. Security
headers are set in `next.config.ts`.

## Run

```bash
npm ci
cp .env.example .env.local          # set ULIS_API_URL and ULIS_API_KEY
npm run dev                         # http://localhost:3000
```

Start the backend first (see the backend README): migrate, ingest the sample corpus, then
`uvicorn ulis.api.app:create_app --factory --port 8000`.

## Test

```bash
npm run typecheck && npm test && npm run build
# end-to-end (needs the API running with the sample corpus ingested):
ULIS_API_URL=http://localhost:8000 ULIS_API_KEY=... npm run e2e
```

Screenshots from the end-to-end run are in `docs/screenshots/`.
