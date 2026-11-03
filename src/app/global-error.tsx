"use client";

import Link from "next/link";
import "./globals.css";

/** Replaces the root layout when it fails, so it carries its own html and body. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  console.error(error);
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <main className="mx-auto w-full max-w-6xl px-4 py-6">
          <section className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
            <p className="text-sm text-muted">Rulecard could not load. Retry, or open the home page.</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => retry()} className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90">
                Retry
              </button>
              <Link href="/" className="text-sm font-medium text-accent underline underline-offset-2">
                Back to Review
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
