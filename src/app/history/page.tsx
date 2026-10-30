import Link from "next/link";
import { Shell } from "@/components/shell";
import { Card, Chip } from "@/components/ui";
import { getRule } from "@/content/rules";
import { listAttempts } from "@/db/queries";
import { requirePageSession } from "@/lib/auth/session";
import { isPickCorrect } from "@/lib/ai/prompts";
import type { Pick } from "@/lib/ai/schemas";
import { SECTION_LABEL, SECTIONS, type Section } from "@/lib/questions/taxonomy";

export const metadata = { title: "History · Rulecard" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const params = await searchParams;
  const filter: Section | null = params.section === "math" || params.section === "rw" ? params.section : null;
  const session = await requirePageSession();
  const all = await listAttempts(session.userId);
  const rows = filter ? all.filter(({ question }) => (question.section ?? "rw") === filter) : all;
  const tabs: Array<{ key: Section | null; label: string; href: string }> = [
    { key: null, label: "All", href: "/history" },
    ...SECTIONS.map((s) => ({ key: s, label: SECTION_LABEL[s], href: `/history?section=${s}` })),
  ];
  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
        <span className="text-sm text-muted">{rows.length} reviewed</span>
      </div>
      <nav className="mb-4 flex gap-1 text-sm" aria-label="Filter by section">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.key === filter ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 transition ${t.key === filter ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card className="text-sm text-muted">Nothing reviewed yet{filter ? ` in ${SECTION_LABEL[filter]}` : ""}. Capture or paste a question on the Review page.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Section</th>
                <th className="px-4 py-2">Skill</th>
                <th className="px-4 py-2">Rule</th>
                <th className="px-4 py-2">Your answer</th>
                <th className="px-4 py-2">Correct</th>
                <th className="px-4 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ attempt, question }) => {
                const rule = getRule(attempt.ruleId);
                const right = attempt.isCorrect ?? isPickCorrect(question, attempt.picked as Pick, attempt.response);
                const gridIn = question.format === "spr";
                const yours = attempt.picked === "correct" ? "right" : attempt.picked === "spr" ? (attempt.response ?? "?") : attempt.picked;
                const correct = gridIn ? (question.answers?.[0] ?? "?") : (question.correct ?? "?");
                return (
                  <tr key={attempt.id} className="border-b border-line last:border-0 hover:bg-bg">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Link href={`/history/${attempt.id}`} className="text-accent underline-offset-2 hover:underline">
                        {attempt.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{question.section === "math" ? "Math" : "R&W"}</td>
                    <td className="px-4 py-2">{question.skill ?? question.domain ?? "?"}</td>
                    <td className="px-4 py-2">{rule ? `${rule.id} ${rule.name}` : (attempt.ruleId ?? "pending")}</td>
                    <td className="px-4 py-2">{yours}</td>
                    <td className="px-4 py-2">{correct}</td>
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
