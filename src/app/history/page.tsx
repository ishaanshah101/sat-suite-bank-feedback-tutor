import Link from "next/link";
import { Shell } from "@/components/shell";
import { Card, Chip } from "@/components/ui";
import { getRule } from "@/content/rules";
import { listAttempts } from "@/db/queries";
import { requireSession } from "@/lib/auth/session";
import { isPickCorrect } from "@/lib/ai/prompts";
import type { Pick } from "@/lib/ai/schemas";

export const metadata = { title: "History · Rulecard" };

export default async function HistoryPage() {
  const session = await requireSession();
  const rows = await listAttempts(session.userId);
  return (
    <Shell>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
        <span className="text-sm text-muted">{rows.length} reviewed</span>
      </div>
      {rows.length === 0 ? (
        <Card className="text-sm text-muted">Nothing reviewed yet. Capture or paste a question on the Review page.</Card>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Skill</th>
                <th className="px-4 py-2">Rule</th>
                <th className="px-4 py-2">Pick</th>
                <th className="px-4 py-2">Correct</th>
                <th className="px-4 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ attempt, question }) => {
                const rule = getRule(attempt.ruleId);
                const right = isPickCorrect(attempt.picked as Pick, question.correct);
                return (
                  <tr key={attempt.id} className="border-b border-line last:border-0 hover:bg-bg">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Link href={`/history/${attempt.id}`} className="text-accent underline-offset-2 hover:underline">
                        {attempt.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{question.skill ?? question.domain ?? "?"}</td>
                    <td className="px-4 py-2">{rule ? `${rule.id} ${rule.name}` : (attempt.ruleId ?? "pending")}</td>
                    <td className="px-4 py-2">{attempt.picked === "correct" ? "right" : attempt.picked}</td>
                    <td className="px-4 py-2">{question.correct ?? "?"}</td>
                    <td className="px-4 py-2">{right === null ? <Chip>unknown</Chip> : right ? <Chip tone="good">right</Chip> : <Chip tone="danger">missed</Chip>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </Shell>
  );
}
