import { Shell } from "@/components/shell";
import { Card } from "@/components/ui";
import { getUser } from "@/db/queries";
import { aiUsedToday, dailyAiLimit } from "@/lib/ai/quota";
import { requirePageSession } from "@/lib/auth/session";
import { ownerUserId } from "@/lib/env";
import { DeleteAccount } from "./delete-account";

export const metadata = { title: "Account · Rulecard" };

export default async function AccountPage() {
  const session = await requirePageSession();
  const user = await getUser(session.userId);
  const used = await aiUsedToday(session.userId);
  const unlimited = session.userId === ownerUserId();
  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight">Account</h1>
      <div className="mt-6 grid max-w-xl gap-4">
        <Card>
          <div className="text-sm text-muted">Signed in as</div>
          <div className="mt-1 font-medium" data-testid="account-email">
            {user?.email}
          </div>
          <div className="mt-4 text-sm text-muted">AI requests in the last 24 hours</div>
          <div className="mt-1 font-medium">{unlimited ? `${used} (no limit on this account)` : `${used} of ${dailyAiLimit()}`}</div>
          <form action="/api/logout" method="post" className="mt-5">
            <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-bg">
              Sign out
            </button>
          </form>
        </Card>
        <Card>
          <h2 className="font-semibold">Delete account</h2>
          <p className="mt-1 text-sm text-muted">Removes your account and every saved question, explanation, chat and drill. This cannot be undone.</p>
          <DeleteAccount />
        </Card>
      </div>
    </Shell>
  );
}
