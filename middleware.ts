// Early-access gate for the research assistant: invite code -> signed HttpOnly cookie.
import { NextResponse, type NextRequest } from "next/server";

import { gateDecision } from "@/lib/gate";
import { SESSION_COOKIE, currentAccessConfig, verifyActiveSession } from "@/lib/session";

export const config = { matcher: ["/research/:path*", "/api/research/:path*", "/api/feedback"] };

export async function middleware(req: NextRequest) {
  const cfg = currentAccessConfig();
  const { pathname, search } = req.nextUrl;
  const session = cfg.mode === "gated" ? await verifyActiveSession(req.cookies.get(SESSION_COOKIE)?.value, cfg) : null;

  switch (gateDecision(pathname, cfg, session)) {
    case "allow": {
      const res = NextResponse.next();
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    case "unauthorized":
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Enter your invite code to use the research assistant." } },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    case "unavailable": {
      const reason = cfg.mode === "unavailable" ? cfg.reason : "";
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: { code: "not_configured", message: "The research assistant is not available on this deployment." } },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      console.error(`[research] refusing to serve ${pathname}: ${reason}`);
      return new NextResponse(
        "<!doctype html><meta charset=utf-8><title>Research assistant unavailable</title>" +
          "<body style=\"font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem\">" +
          "<h1>Research assistant unavailable</h1><p>This deployment has not been configured for early access yet. " +
          "The operator needs to set the access settings (see docs/early-access.md).</p></body>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
      );
    }
    default: {
      // Serve the invite-code form in place (rewrite, not redirect): no absolute URL is needed, so
      // this is correct behind any reverse proxy. The form posts back to the requested page.
      const url = req.nextUrl.clone();
      url.pathname = "/access";
      url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
      const res = NextResponse.rewrite(url);
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
  }
}
