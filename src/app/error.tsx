"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Shell } from "@/components/shell";
import { Button, Card } from "@/components/ui";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Shell>
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted">This page hit an error. Retrying usually fixes it; if not, head back to Review.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => retry()}>Retry</Button>
          <Link href="/" className="text-sm font-medium text-accent underline underline-offset-2">
            Back to Review
          </Link>
        </div>
      </Card>
    </Shell>
  );
}
