import { Shell } from "@/components/shell";
import { Card } from "@/components/ui";
import { resolveHandoff, safeNextPath } from "@/lib/auth/handoff";

export const metadata = { title: "Continue · Rulecard" };

/**
 * The one click between an extension link and a signed-in browser. The form posts same-origin only
 * (checked again by the route), so a link someone else sends cannot sign this browser into their account.
 */
export default async function HandoffPage({ searchParams }: { searchParams: Promise<{ code?: string; next?: string }> }) {
  const { code, next } = await searchParams;
  const handoff = await resolveHandoff(code);
  return (
    <Shell>
      <div className="mx-auto mt-10 max-w-md">
        <Card>
          {handoff ? (
            <form action="/api/auth/handoff/continue" method="post">
              <h1 className="text-lg font-semibold tracking-tight">Continue as {handoff.email}?</h1>
              <p className="mt-2 text-sm text-muted">The Rulecard extension opened this page. One click signs this browser in as the same account.</p>
              <input type="hidden" name="code" value={code ?? ""} />
              <input type="hidden" name="next" value={safeNextPath(next)} />
              <button type="submit" className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90" data-testid="handoff-continue">
                Continue
              </button>
              <p className="mt-3 text-xs text-muted">Not you? Close this tab. Nothing happens until you press Continue.</p>
            </form>
          ) : (
            <>
              <h1 className="text-lg font-semibold tracking-tight">This link has expired</h1>
              <p className="mt-2 text-sm text-muted">Links from the extension work once, for one minute. Open History or Rules from the extension again.</p>
            </>
          )}
        </Card>
      </div>
    </Shell>
  );
}
