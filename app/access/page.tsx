import { currentAccessConfig, safeNextPath } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const MESSAGES: Record<string, string> = {
  invalid: "That invite code was not recognised. Check it and try again.",
  rate: "Too many attempts. Wait ten minutes and try again.",
  unavailable: "Early access is not configured on this deployment.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AccessPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = safeNextPath(one(params.next));
  const error = MESSAGES[one(params.error)];
  const cfg = currentAccessConfig();

  return (
    <>
      <h1>Early access</h1>
      <p className="lede">
        The research assistant is open to invited testers. Enter the invite code you were given. A code unlocks this
        browser for seven days.
      </p>
      {cfg.mode === "unavailable" ? (
        <p className="error" role="alert">
          The research assistant is not available on this deployment yet.
        </p>
      ) : (
        <form className="search" method="post" action="/api/access">
          <input type="hidden" name="next" value={next} />
          <label>
            Invite code
            <input type="text" name="code" required autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={200} />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" type="submit">
            Continue
          </button>
        </form>
      )}
      <p className="meta">
        This is a research aid for lawyers, not legal advice. Cookies: one HttpOnly session cookie, set only after a
        valid code.
      </p>
    </>
  );
}
