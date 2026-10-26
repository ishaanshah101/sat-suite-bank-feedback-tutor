import { Shell } from "@/components/shell";
import { Card, Chip } from "@/components/ui";
import { RULES, type Rule } from "@/content/rules";
import { getRuleStats, type RuleStat } from "@/db/queries";
import { requirePageSession } from "@/lib/auth/session";

export const metadata = { title: "Rules · Rulecard" };

export default async function RulesPage() {
  const session = await requirePageSession();
  let stats: RuleStat[] = [];
  try {
    stats = await getRuleStats(session.userId);
  } catch (error) {
    console.error("[rules] stats unavailable", error);
  }
  const misses = new Map(stats.map((s) => [s.ruleId, s]));
  const missed = RULES.filter((r) => (misses.get(r.id)?.misses ?? 0) > 0).sort((a, b) => (misses.get(b.id)?.misses ?? 0) - (misses.get(a.id)?.misses ?? 0));
  const groups = new Map<string, Map<string, Rule[]>>();
  for (const rule of RULES) {
    const domain = groups.get(rule.domain) ?? new Map<string, Rule[]>();
    const skill = domain.get(rule.skill) ?? [];
    skill.push(rule);
    domain.set(rule.skill, skill);
    groups.set(rule.domain, domain);
  }
  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight">Rules</h1>
      <p className="mt-1 text-sm text-muted">The cheat sheet. Rules you keep missing float to the top.</p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Rules you keep missing</h2>
        {missed.length === 0 ? (
          <Card className="mt-2 text-sm text-muted">No misses recorded yet.</Card>
        ) : (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {missed.map((rule) => (
              <RuleBlock key={rule.id} rule={rule} stat={misses.get(rule.id)} compact />
            ))}
          </div>
        )}
      </section>

      {[...groups.entries()].map(([domain, skills]) => (
        <section key={domain} className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">{domain}</h2>
          {[...skills.entries()].map(([skill, rules]) => (
            <div key={skill} className="mt-3">
              {skill !== domain ? <h3 className="text-sm font-semibold text-muted">{skill}</h3> : null}
              <div className="mt-2 space-y-3">
                {rules.map((rule) => (
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
      <p className="mt-2 text-[15px] leading-relaxed">{rule.statement}</p>
      {!compact ? (
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Spot it</dt>
            <dd className="mt-0.5">{rule.spot_it}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Test</dt>
            <dd className="mt-0.5">{rule.test}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Trap</dt>
            <dd className="mt-0.5">{rule.trap}</dd>
          </div>
        </dl>
      ) : null}
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <p className="rounded-lg bg-danger-soft px-3 py-2">
          <span className="font-semibold text-danger">Wrong:</span> {rule.example.wrong}
        </p>
        <p className="rounded-lg bg-good-soft px-3 py-2">
          <span className="font-semibold text-good">Right:</span> {rule.example.right}
        </p>
      </div>
    </Card>
  );
}
