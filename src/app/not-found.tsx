import Link from "next/link";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui";

export default function NotFound() {
  return (
    <Shell>
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted">There is nothing at this address.</p>
        <Link href="/" className="text-sm font-medium text-accent underline underline-offset-2">
          Back to Review
        </Link>
      </Card>
    </Shell>
  );
}
