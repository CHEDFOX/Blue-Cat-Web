# Early-access research assistant

The research assistant (`/research`) lets invited testers submit a question and an optional case
file, watch the job progress, and read structured guidance whose citations open the exact stored
authority text. It is a research aid for lawyers, not legal advice. The backend contract is
`POST /v1/research` and `GET /v1/research/{id}` (Blue-Cat-Backend).

## Environment variables (server-side only)

| Variable | Purpose |
| --- | --- |
| `ULIS_API_URL`, `ULIS_API_KEY` | Backend and its key. The key is only used in route handlers and never reaches the browser. |
| `EARLY_ACCESS_CODES` | Comma-separated invite codes. **Unset in production: the research routes return 503.** |
| `SESSION_SECRET` | 16+ random characters; HMAC key for the session cookie. Required in production. |
| `RESEARCH_DAILY_LIMIT` | Runs per invite code per UTC day (default 20, `0` = unlimited). |
| `FEEDBACK_FILE` | JSON-lines feedback file (default `./feedback.jsonl`). |
| `ULIS_IDENTITY_HEADER` | Header carrying the opaque id of the invite code to the backend (default `X-ULIS-Client`, `off` disables). |
| `ULIS_RESEARCH_MOCK` | `1` = scripted fictional jobs, no backend LLM. Never enable on a real deployment. |
| `ULIS_RESEARCH_MOCK_STEP_MS`, `ULIS_RESEARCH_POLL_MS` | Mock stage length (1500) and client poll base (2000), mainly for tests. |

## Run locally

```bash
cp .env.example .env.local     # set ULIS_API_URL / ULIS_API_KEY, or use mock mode
npm ci && npm run dev          # http://localhost:3000/research
```

With `EARLY_ACCESS_CODES` unset in development the gate is open. Set it to try the invite flow.
**Mock mode:** `ULIS_RESEARCH_MOCK=1 EARLY_ACCESS_CODES=test npm run dev` gives a job that goes through
the four stages and completes with three fictional authorities. Put `[mock:fail]` or `[mock:refuse]`
in the question for a failed or refused job. Mock results carry a visible "mock" notice.

Tests: `npm run typecheck && npm test && npm run build && npm run e2e`. The assistant e2e tests run
in mock mode on port 3100 and need no backend; the search tests skip themselves unless
`$ULIS_API_URL/health` answers.

## How access works

A visitor opens `/research`, is shown the invite-code form, and posts the code to `/api/access`
(10 attempts per IP per 10 minutes). A valid code sets an HttpOnly, SameSite=Lax cookie (Secure over
HTTPS) holding an HMAC-signed payload with an opaque hash of the code and a 7-day expiry. No user
database exists. `middleware.ts` gates `/research`, `/api/research/*` and `/api/feedback`; the route
handlers check again. Search, provision and coverage pages are not gated.

**Invite-code process:** generate one code per tester (for example `openssl rand -hex 6`), add it to
`EARLY_ACCESS_CODES`, restart the server, send the code privately. Revoke by removing it and
restarting: sessions from a removed code stop working at once. Daily limits and feedback are per code (opaque id), so you can follow up per tester.

## Deploying

- **Vercel:** set the variables above in the project settings, deploy. Limits are per serverless
  instance and `FEEDBACK_FILE` is not durable there; use the VPS option or replace both first.
- **Node on the VPS behind Caddy:** `npm ci && npm run build`, then `npm start` (port 3000) under
  systemd with an `EnvironmentFile`, and `reverse_proxy localhost:3000` in the Caddyfile (Caddy
  sets `X-Forwarded-For/Proto`, which the cookie and attempt limiter use). Run a single instance.

## Privacy notice shown on first visit

> This is a research aid for lawyers, not legal advice. Verify every authority against the official
> source. Do not paste confidential client data unless this deployment has been approved for it: the
> text you submit is processed by an AI provider. Results are deleted from the research service after
> 24 hours. Copy or print what you need.

The website stores no case text: it is forwarded to the backend, which keeps it in memory only.
Feedback lines contain timestamp, page, rating, comment and the opaque code id, never case text.
Pasted case text in the comment box is the tester's responsibility; the form warns against it.

## Not production-ready

- Daily limits and login-attempt limits are in-memory, per instance, and reset on restart.
- Invite codes live in an environment variable; adding or revoking one needs a restart.
- Anyone with a valid session and a job id can read that job; ids are unguessable but not per-user.
- Feedback is a local file with no rotation. No audit log, no CSRF token beyond SameSite and JSON-only posts.
- Only the research routes are gated; `/` (search) remains public as before.
- Printing relies on the browser; there is no server-side PDF export.
