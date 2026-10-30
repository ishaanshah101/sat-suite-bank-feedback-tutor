import Link from "next/link";
import { MathText } from "@/components/math-text";
import { Shell } from "@/components/shell";
import { Card, Chip } from "@/components/ui";
import { rulesForSection, type Rule } from "@/content/rules";
import { getRuleStats, type RuleStat } from "@/db/queries";
import { requirePageSession } from "@/lib/auth/session";
import { SECTION_LABEL, SECTIONS, domainsForSection, skillsForSection, type Section } from "@/lib/questions/taxonomy";

export const metadata = { title: "Rules · Rulecard" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const params = await searchParams;
  const section: Section = params.section === "math" ? "math" : "rw";
  const session = await requirePageSession();
  let stats: RuleStat[] = [];
  try {
    stats = await getRuleStats(session.userId);
  } catch (error) {
    console.error("[rules] stats unavailable", error);
  }
  const misses = new Map(stats.map((s) => [s.ruleId, s]));
  const rules = rulesForSection(section);
  const missed = rules.filter((r) => (misses.get(r.id)?.misses ?? 0) > 0).sort((a, b) => (misses.get(b.id)?.misses ?? 0) - (misses.get(a.id)?.misses ?? 0));

  // Official domain and skill order, then the section-wide strategy rules.
  const skills = skillsForSection(section);
  const groups: Array<{ domain: string; skills: Array<{ skill: string; rules: Rule[] }> }> = domainsForSection(section).map((domain) => ({
    domain,
    skills: skills
      .filter((skill) => rules.some((r) => r.domain === domain && r.skill === skill))
      .map((skill) => ({ skill, rules: rules.filter((r) => r.skill === skill) })),
  }));
  const general = rules.filter((r) => r.skill === "General");
  if (general.length) groups.push({ domain: section === "math" ? "Test-wide strategy" : "General", skills: [{ skill: "General", rules: general }] });

  const missesIn = (s: Section) => rulesForSection(s).reduce((sum, r) => sum + (misses.get(r.id)?.misses ?? 0), 0);

  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight">Rules</h1>
      <p className="mt-1 text-sm text-muted">The cheat sheet. Rules you keep missing float to the top.</p>

      <nav className="mt-4 flex gap-1 rounded-xl bg-bg p-1 text-sm" aria-label="Section">
        {SECTIONS.map((s) => {
          const active = s === section;
          const count = rulesForSection(s).length;
          const missedCount = missesIn(s);
          return (
            <Link
              key={s}
              href={s === "math" ? "/rules?section=math" : "/rules"}
              aria-current={active ? "page" : undefined}
              className={`flex-1 rounded-lg px-3 py-2 text-center font-medium transition ${active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              data-testid={`rules-tab-${s}`}
            >
              {SECTION_LABEL[s]} <span className="text-xs text-muted">· {count} rules{missedCount ? ` · ${missedCount} missed` : ""}</span>
            </Link>
          );
        })}
      </nav>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Rules you keep missing</h2>
        {missed.length === 0 ? (
          <Card className="mt-2 text-sm text-muted">No {SECTION_LABEL[section]} misses recorded yet.</Card>
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
        {count > 0 ? <Chip tone="danger">missed {count} time{count === 1 ? "" : "s"}</Chip> : null}
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
        <p className="rounded-lg bg-danger-soft px-3 py-2">
          <span className="font-semibold text-danger">Wrong:</span> <MathText text={rule.example.wrong} />
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
    </Card>
  );
}
