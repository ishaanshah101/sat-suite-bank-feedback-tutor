import Link from "next/link";
import type { RuleCard as RuleCardData } from "@/lib/ai/schemas";
import { getRule } from "@/content/rules";
import { MathText } from "./math-text";
import { Chip } from "./ui";

const DIAGNOSIS: Record<
  RuleCardData["diagnosis"],
  { label: string; tone: "neutral" | "accent" | "good" | "danger" | "warn" }
> = {
  misread: { label: "misread the question", tone: "warn" },
  rule_gap: { label: "rule gap", tone: "danger" },
  careless: { label: "careless slip", tone: "warn" },
  got_it_right: { label: "you got it", tone: "good" },
  unknown: { label: "no reasoning given", tone: "neutral" },
};

export function RuleCardView({
  card,
  picked,
  response,
}: {
  card: RuleCardData;
  picked: string | null;
  response?: string | null;
}) {
  const rule = getRule(card.rule_id);
  const diag = DIAGNOSIS[card.diagnosis] ?? DIAGNOSIS.unknown;
  const answer = card.correct_letter ?? card.correct_answer ?? "the answer";
  const ruleHref =
    rule?.section === "math"
      ? `/rules?section=math#${card.rule_id}`
      : `/rules#${card.rule_id}`;
  const pickName =
    picked === "spr"
      ? response
        ? `your answer (${response})`
        : "your answer"
      : picked;
  const showPickFails = Boolean(
    card.why_pick_fails && picked && picked !== "correct" && picked !== "none",
  );
  const rules = card.key_rules.length ? card.key_rules : [card.rule_statement];
  const translated = card.mode === "translated";
  const quick = card.mode === "quick";
  return (
    <div className="space-y-4" data-testid="rule-card">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={translated ? "good" : "accent"}>
          {translated
            ? "official explanation, translated"
            : quick
              ? "captured from your screen"
              : "explained simply"}
        </Chip>
        <Chip tone={diag.tone}>{diag.label}</Chip>
        {card.solved_by_model ? (
          <Chip tone="warn">
            answer worked out by the model, double check it
          </Chip>
        ) : null}
        {card.suggested_rule ? (
          <Chip tone="neutral">suggested new rule: {card.suggested_rule}</Chip>
        ) : null}
      </div>
      <p className="text-[15px] font-semibold" data-testid="card-answer">
        Answer: {answer}
      </p>
      {!translated && card.simple_explanation ? (
        <Section title="Simple explanation" text={card.simple_explanation} />
      ) : null}
      <section
        className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3"
        data-testid="key-rules"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
          {rules.length === 1 ? "The rule you need" : "The rules you need"}
        </h3>
        <ul className="mt-1 list-disc space-y-1.5 pl-5 text-[15px] font-medium leading-relaxed">
          {rules.map((r, i) => (
            <MathText key={i} as="li" text={r} />
          ))}
        </ul>
        <div className="mt-2 text-xs text-accent">
          Rule{" "}
          <Link href={ruleHref} className="underline underline-offset-2">
            {card.rule_id}
            {rule ? ` · ${rule.name}` : ""}
          </Link>
        </div>
      </section>
      <details className="group space-y-4">
        <summary className="cursor-pointer text-sm text-muted">
          More detail
        </summary>
        <div className="mt-3 space-y-4">
          <MathText
            as="p"
            text={card.rule_statement}
            className="text-[15px] leading-relaxed"
          />
          <Section title={`Why ${answer} is right`} text={card.why_correct} />
          {showPickFails ? (
            <Section
              title={`Why ${pickName} fails`}
              text={card.why_pick_fails!}
            />
          ) : null}
          {card.steps.length ? (
            <section data-testid="rule-steps">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Steps
              </h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-[15px] leading-relaxed">
                {card.steps.map((step, i) => (
                  <MathText key={i} as="li" text={step} />
                ))}
              </ol>
            </section>
          ) : null}
          {card.shortcut ? (
            <section
              className="rounded-xl border border-good/30 bg-good-soft px-4 py-3"
              data-testid="rule-shortcut"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-good">
                Shortcut
              </h3>
              <MathText
                as="p"
                text={card.shortcut}
                className="mt-1 text-[15px] leading-relaxed"
              />
            </section>
          ) : null}
          {card.eliminations.length ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Kill the rest
              </h3>
              <ul className="mt-1 space-y-1 text-[15px]">
                {card.eliminations.map((e) => (
                  <li key={e.letter} className="flex gap-2">
                    <span className="w-5 shrink-0 font-semibold">
                      {e.letter}.
                    </span>
                    <MathText text={e.reason} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="rounded-xl bg-bg px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Takeaway
            </h3>
            <MathText
              as="p"
              text={card.takeaway}
              className="mt-1 text-[15px] font-medium"
            />
          </section>
          <p className="text-xs text-muted">
            Confidence {Math.round(card.confidence * 100)}%
          </p>
        </div>
      </details>
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      <MathText
        as="p"
        text={text}
        className="mt-1 text-[15px] leading-relaxed"
      />
    </section>
  );
}
