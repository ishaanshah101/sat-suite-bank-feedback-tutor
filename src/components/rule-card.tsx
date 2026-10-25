import Link from "next/link";
import type { RuleCard as RuleCardData } from "@/lib/ai/schemas";
import { getRule } from "@/content/rules";
import { Chip } from "./ui";

const DIAGNOSIS: Record<RuleCardData["diagnosis"], { label: string; tone: "neutral" | "accent" | "good" | "danger" | "warn" }> = {
  misread: { label: "misread the sentence", tone: "warn" },
  rule_gap: { label: "rule gap", tone: "danger" },
  careless: { label: "careless slip", tone: "warn" },
  got_it_right: { label: "you got it", tone: "good" },
  unknown: { label: "no reasoning given", tone: "neutral" },
};

export function RuleCardView({ card, picked }: { card: RuleCardData; picked: string | null }) {
  const rule = getRule(card.rule_id);
  const diag = DIAGNOSIS[card.diagnosis] ?? DIAGNOSIS.unknown;
  return (
    <div className="space-y-4" data-testid="rule-card">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={diag.tone}>{diag.label}</Chip>
        <Chip>confidence {Math.round(card.confidence * 100)}%</Chip>
        {card.solved_by_model ? <Chip tone="warn">answer worked out by the model, double check it</Chip> : null}
        {card.suggested_rule ? <Chip tone="neutral">suggested new rule: {card.suggested_rule}</Chip> : null}
      </div>
      <section className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">
          Rule{" "}
          <Link href={`/rules#${card.rule_id}`} className="underline underline-offset-2">
            {card.rule_id}
            {rule ? ` · ${rule.name}` : ""}
          </Link>
        </div>
        <p className="mt-1 text-[15px] font-medium leading-relaxed">{card.rule_statement}</p>
      </section>
      <Section title={`Why ${card.correct_letter} is right`}>{card.why_correct}</Section>
      {card.why_pick_fails && picked && picked !== "correct" ? <Section title={`Why ${picked} fails`}>{card.why_pick_fails}</Section> : null}
      {card.eliminations.length ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Kill the rest</h3>
          <ul className="mt-1 space-y-1 text-[15px]">
            {card.eliminations.map((e) => (
              <li key={e.letter} className="flex gap-2">
                <span className="w-5 shrink-0 font-semibold">{e.letter}.</span>
                <span>{e.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="rounded-xl bg-bg px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Takeaway</h3>
        <p className="mt-1 text-[15px] font-medium">{card.takeaway}</p>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <p className="mt-1 text-[15px] leading-relaxed">{children}</p>
    </section>
  );
}
