import Link from "next/link";
import { MathText } from "@/components/math-text";
import { Shell } from "@/components/shell";
import { Card, Chip } from "@/components/ui";
import { examsOf, rulesForExamSection, type Rule } from "@/content/rules";
import { getRuleStats, type RuleStat } from "@/db/queries";
import { requirePageSession } from "@/lib/auth/session";
import { actSkillsForSection, domainsForSection, skillsForSection, type ActSection, type Exam, type Section } from "@/lib/questions/taxonomy";

/** The tabs: two SAT sections, four ACT sections. ACT tabs also show the SAT rules that decide ACT questions. */
const TABS = [
  { key: "rw", exam: "sat", section: "rw", label: "SAT Reading and Writing" },
  { key: "math", exam: "sat", section: "math", label: "SAT Math" },
  { key: "act-english", exam: "act", section: "english", label: "ACT English" },
  { key: "act-math", exam: "act", section: "math", label: "ACT Math" },
  { key: "act-reading", exam: "act", section: "reading", label: "ACT Reading" },
  { key: "act-science", exam: "act", section: "science", label: "ACT Science" },
] as const satisfies ReadonlyArray<{ key: string; exam: Exam; section: Section; label: string }>;
type Tab = (typeof TABS)[number];
const hrefOf = (t: Tab) => (t.key === "rw" ? "/rules" : `/rules?section=${t.key}`);

export const metadata = { title: "Rules · Rulecard" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const params = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === params.section) ?? TABS[0];
  const section = tab.section;
  const session = await requirePageSession();
  let stats: RuleStat[] = [];
  try {
    stats = await getRuleStats(session.userId);
  } catch (error) {
    console.error("[rules] stats unavailable", error);
  }
  const misses = new Map(stats.map((s) => [s.ruleId, s]));
  const rules = rulesForExamSection(tab.exam, section);
  const missed = rules.filter((r) => (misses.get(r.id)?.misses ?? 0) > 0).sort((a, b) => (misses.get(b.id)?.misses ?? 0) - (misses.get(a.id)?.misses ?? 0));

  const groups: Array<{ domain: string; skills: Array<{ skill: string; rules: Rule[] }> }> = [];
  if (tab.exam === "sat") {
    // Official domain and skill order, then the section-wide strategy rules.
    const sat = section === "math" ? "math" : "rw";
    const skills = skillsForSection(sat);
    for (const domain of domainsForSection(sat)) {
      groups.push({
        domain,
        skills: skills.filter((skill) => rules.some((r) => r.domain === domain && r.skill === skill)).map((skill) => ({ skill, rules: rules.filter((r) => r.skill === skill) })),
      });
    }
  } else {
    // ACT: the ACT-only rules by skill, then the SAT rules that decide the same questions.
    const actOnly = rules.filter((r) => !examsOf(r).includes("sat"));
    groups.push({
      domain: tab.label,
      skills: actSkillsForSection(section as ActSection)
        .filter((skill) => actOnly.some((r) => r.skill === skill))
        .map((skill) => ({ skill, rules: actOnly.filter((r) => r.skill === skill) })),
    });
    const shared = rules.filter((r) => examsOf(r).includes("sat") && r.skill !== "General");
    if (shared.length) groups.push({ domain: "Same rule on the SAT", skills: [...new Set(shared.map((r) => r.skill))].map((skill) => ({ skill, rules: shared.filter((r) => r.skill === skill) })) });
  }
  const general = rules.filter((r) => r.skill === "General");
  if (general.length) groups.push({ domain: section === "math" ? "Test-wide strategy" : "General", skills: [{ skill: "General", rules: general }] });

  const missesIn = (t: Tab) => rulesForExamSection(t.exam, t.section).reduce((sum, r) => sum + (misses.get(r.id)?.misses ?? 0), 0);

  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight">Rules</h1>
      <p className="mt-1 text-sm text-muted">The cheat sheet. Rules you keep missing float to the top.</p>

      <nav className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-bg p-1 text-sm sm:grid-cols-3" aria-label="Section">
        {TABS.map((t) => {
          const active = t.key === tab.key;
          const count = rulesForExamSection(t.exam, t.section).length;
          const missedCount = missesIn(t);
          return (
            <Link
              key={t.key}
              href={hrefOf(t)}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-center font-medium transition ${active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              data-testid={`rules-tab-${t.key}`}
            >
              {t.label} <span className="text-xs text-muted">· {count} rules{missedCount ? ` · ${missedCount} missed` : ""}</span>
            </Link>
          );
        })}
      </nav>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Rules you keep missing</h2>
        {missed.length === 0 ? (
          <Card className="mt-2 text-sm text-muted">No {tab.label} misses recorded yet.</Card>
        ) : (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {missed.map((rule) => (
              <RuleBlock key={rule.id} rule={rule} stat={misses.get(rule.id)} compact />
            ))}
          </div>
        )}
      </section>

      {groups.map(({ domain, skills: skillGroups }) => (
        <section key={domain} className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">{domain}</h2>
          {skillGroups.map(({ skill, rules: skillRules }) => (
            <div key={skill} className="mt-3">
              {skill !== "General" ? <h3 className="text-sm font-semibold text-muted">{skill}</h3> : null}
              <div className="mt-2 space-y-3">
                {skillRules.map((rule) => (
                  <RuleBlock key={rule.id} rule={rule} stat={misses.get(rule.id)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </Shell>
  );
}

function RuleBlock({ rule, stat, compact }: { rule: Rule; stat?: RuleStat; compact?: boolean }) {
  const count = stat?.misses ?? 0;
  return (
    <Card>
      <div id={compact ? undefined : rule.id} className="flex scroll-mt-20 flex-wrap items-center gap-2">
        {compact ? (
          <a href={`#${rule.id}`} className="font-mono text-xs text-muted underline-offset-2 hover:underline">
            {rule.id}
          </a>
        ) : (
          <span className="font-mono text-xs text-muted">{rule.id}</span>
        )}
        <h4 className="font-semibold">{rule.name}</h4>
        {count > 0 ? <Chip tone="miss">missed {count} time{count === 1 ? "" : "s"}</Chip> : null}
      </div>
      <MathText as="p" text={rule.statement} className="mt-2 text-[15px] leading-relaxed" />
      {!compact ? (
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Spot it</dt>
            <MathText as="dd" text={rule.spot_it} className="mt-0.5" />
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Test</dt>
            <MathText as="dd" text={rule.test} className="mt-0.5" />
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Trap</dt>
            <MathText as="dd" text={rule.trap} className="mt-0.5" />
          </div>
        </dl>
      ) : null}
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <p className="rounded-lg bg-miss-soft px-3 py-2">
          <span className="font-semibold text-miss">Wrong:</span> <MathText text={rule.example.wrong} />
        </p>
        <p className="rounded-lg bg-good-soft px-3 py-2">
          <span className="font-semibold text-good">Right:</span> <MathText text={rule.example.right} />
        </p>
      </div>
      {rule.shortcut && !compact ? (
        <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm">
          <span className="font-semibold text-accent">Shortcut:</span> <MathText text={rule.shortcut} />
        </p>
      ) : null}
      {rule.tips?.length && !compact ? (
        <div className="mt-2 rounded-lg border border-line px-3 py-2 text-sm" data-testid="rule-tips">
          <span className="font-semibold">Tips:</span>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {rule.tips.map((tip, i) => (
              <MathText key={i} as="li" text={tip} />
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
