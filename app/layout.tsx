import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Blue Cat · Legal research",
  description: "Jurisdiction-aware legal research with exact citations and legal-status limitations.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="container">
            <Link className="brand" href="/">
              Blue Cat · ULIS
            </Link>
            <nav aria-label="Main">
              <Link href="/">Search</Link>
              <Link href="/coverage">Coverage &amp; sources</Link>
            </nav>
          </div>
        </header>
        <div className="notice" role="note">
          <div className="container">
            Research aid, not legal advice. Coverage is a <strong>small sample</strong>: selected UK legislation with full
            history, part of US federal law, and fictional test jurisdictions. Verify every authority against the
            official source.
          </div>
        </div>
        <main>
          <div className="container">{children}</div>
        </main>
      </body>
    </html>
  );
}
