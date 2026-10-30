// "Progress" card: today's goal, accuracy, streak, mastery, a 14-day chart, why you miss,
// most-missed rules and skills, and plain-language coaching. Pure DOM + inline SVG, no libs.

import { h, svg } from "./dom";
import type { Countdown, Insight, Summary } from "./stats";
import { dayKey } from "./stats";

let open = true;

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);

function tile(label: string, value: string, sub?: string, tone = "") {
  return h("div", { class: `rc-tile ${tone}`.trim() }, h("span", { class: "rc-tile-value", text: value }), h("span", { class: "rc-tile-label", text: label }), sub ? h("span", { class: "rc-tile-sub", text: sub }) : null);
}

function dailyChart(daily: Summary["daily"]): SVGElement {
  const W = 280, H = 64, gap = 3;
  const bw = (W - gap * (daily.length - 1)) / daily.length;
  const max = Math.max(1, ...daily.map((d) => d.attempts));
  const bars: SVGElement[] = [];
  daily.forEach((d, i) => {
    const x = i * (bw + gap);
    const total = (d.attempts / max) * (H - 12);
    const miss = (d.misses / max) * (H - 12);
    const label = `${d.day}: ${d.attempts} question${d.attempts === 1 ? "" : "s"}, ${d.misses} missed`;
    bars.push(svg("rect", { x, y: H - 12 - total, width: bw, height: Math.max(total, d.attempts ? 1 : 0), rx: 2, class: "rc-bar-right" }, svg("title", {}, label)));
    if (miss) bars.push(svg("rect", { x, y: H - 12 - miss, width: bw, height: miss, rx: 2, class: "rc-bar-miss" }, svg("title", {}, label)));
    if (d.attempts === 0) bars.push(svg("rect", { x, y: H - 13, width: bw, height: 1, class: "rc-bar-empty" }));
  });
  const first = daily[0]?.day.slice(5) ?? "", last = daily[daily.length - 1]?.day.slice(5) ?? "";
  bars.push(svg("text", { x: 0, y: H - 1, class: "rc-axis" }, first), svg("text", { x: W, y: H - 1, "text-anchor": "end", class: "rc-axis" }, last === dayKey(Date.now()).slice(5) ? "today" : last));
  return svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "rc-chart", role: "img", "aria-label": "Questions per day, last 14 days" }, ...bars);
}

function diagnosisBar(s: Summary): HTMLElement | null {
  const parts = [
    { key: "rule_gap", label: "rule gap", n: s.missesByDiagnosis.rule_gap, cls: "danger" },
    { key: "careless", label: "careless", n: s.missesByDiagnosis.careless, cls: "warn" },
    { key: "misread", label: "misread", n: s.missesByDiagnosis.misread, cls: "accent" },
    { key: "unknown", label: "no reason given", n: s.missesByDiagnosis.unknown, cls: "" },
  ].filter((p) => p.n > 0);
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (!total) return null;
  return h(
    "section",
    null,
    h("h2", { text: "Why you miss" }),
    h("div", { class: "rc-stack" }, ...parts.map((p) => h("span", { class: `rc-seg ${p.cls}`.trim(), style: `flex:${p.n}`, title: `${p.label}: ${p.n}` }))),
    h("div", { class: "row rc-wrap small" }, ...parts.map((p) => h("span", { class: "row" }, h("span", { class: `rc-dot ${p.cls}`.trim() }), `${p.label} ${Math.round((p.n / total) * 100)}%`))),
  );
}

function groupList(title: string, items: Summary["byRule"], onClick?: (key: string) => void): HTMLElement | null {
  const shown = items.filter((g) => g.misses > 0).slice(0, 5);
  if (!shown.length) return null;
  return h(
    "section",
    null,
    h("h2", { text: title }),
    h("ul", { class: "rc-groups" }, ...shown.map((g) => {
      const inner = [
        h("span", { class: "rc-group-label", text: g.label }),
        h("span", { class: "rc-meter" }, h("span", { style: `width:${Math.round(g.missRate * 100)}%` })),
        h("span", { class: "small muted rc-group-n", text: `${g.misses}/${g.attempts}` }),
      ];
      return h("li", null, onClick ? h("button", { class: "rc-group", onclick: () => onClick(g.key), title: "Open this rule in the web app" }, ...inner) : h("div", { class: "rc-group" }, ...inner));
    })),
  );
}

function calibrationTable(s: Summary): HTMLElement | null {
  const rows = (["sure", "unsure", "guess"] as const).filter((k) => s.calibration[k].attempts > 0);
  if (!rows.length) return null;
  const label = { sure: "Felt sure", unsure: "Unsure", guess: "Guessed" } as const;
  return h(
    "section",
    null,
    h("h2", { text: "Confidence vs. results" }),
    h("ul", { class: "rc-groups" }, ...rows.map((k) => {
      const c = s.calibration[k];
      return h("li", null, h("div", { class: "rc-group" },
        h("span", { class: "rc-group-label", text: label[k] }),
        h("span", { class: "rc-meter good" }, h("span", { style: `width:${Math.round((c.accuracy ?? 0) * 100)}%` })),
        h("span", { class: "small muted rc-group-n", text: `${c.right}/${c.attempts}` })));
    })),
    s.confidentlyWrong ? h("p", { class: "small muted", text: `${s.confidentlyWrong} miss${s.confidentlyWrong === 1 ? "" : "es"} you felt sure about. Those are the misconceptions to fix first.` }) : null,
  );
}

export interface ProgressExtras {
  countdown?: Countdown | null;
  onShare?: () => void;
}

export function renderProgress(s: Summary, tips: Insight[], dailyGoal: number, openWeb: (path: string) => void, extras: ProgressExtras = {}): HTMLElement {
  const today = s.daily[s.daily.length - 1]?.attempts ?? 0;
  const goalPct = Math.min(1, today / Math.max(1, dailyGoal));
  const details = h("details", { class: "card rc-progress", open: open ? "" : null, ontoggle: (ev: Event) => { open = (ev.target as HTMLDetailsElement).open; } });
  details.append(
    h("summary", null, h("h2", { text: "Progress" }), h("span", { class: "small muted", text: s.attempts ? `${s.attempts} questions · ${pct(s.accuracy)} right` : "no questions yet" })),
  );
  if (!s.attempts) {
    details.append(h("p", { class: "muted small", text: tips[0]?.text ?? "" }));
    return details;
  }
  const cd = extras.countdown;
  if (cd) {
    details.append(h("div", { class: "rc-countdown" },
      h("span", { class: "rc-countdown-days", text: String(cd.days) }),
      h("span", null,
        h("span", { text: cd.days === 1 ? `day to your SAT (${cd.label})` : `days to your SAT (${cd.label})` }),
        h("span", { class: "small muted", text: cd.perDay ? ` At this week's pace (${cd.perDay}/day) that's about ${cd.projected} more questions.` : " Start a daily habit. Even 5 a day adds up." }))));
  }
  details.append(
    h("div", { class: "rc-goal", title: `${today} of ${dailyGoal} today` }, h("span", { style: `width:${Math.round(goalPct * 100)}%` })),
    h(
      "div",
      { class: "rc-tiles" },
      tile("today", `${today}/${dailyGoal}`, goalPct >= 1 ? "goal met" : undefined, goalPct >= 1 ? "good" : ""),
      tile("accuracy", pct(s.accuracy), s.thisWeek.attempts ? `${pct(s.thisWeek.accuracy)} this week` : undefined),
      tile("streak", `${s.streakDays}d`, s.practicedToday ? undefined : "practice today", s.streakDays >= 3 ? "good" : ""),
      tile("mastered", String(s.mastery.mastered), `${s.mastery.learning} learning`),
    ),
    dailyChart(s.daily),
  );
  if (tips.length) details.append(h("ul", { class: "rc-insights" }, ...tips.slice(0, 4).map((t) => h("li", { class: t.tone }, t.text))));
  const diag = diagnosisBar(s);
  if (diag) details.append(diag);
  const cal = calibrationTable(s);
  if (cal) details.append(cal);
  const rules = groupList("Most-missed rules", s.byRule, (key) => openWeb(`/rules#${encodeURIComponent(key)}`));
  if (rules) details.append(rules);
  const skills = groupList("Weakest skills", s.bySkill);
  if (skills) details.append(skills);
  const diff = groupList("By difficulty", s.byDifficulty);
  if (diff) details.append(diff);
  if (s.pacing.timed) {
    details.append(h("p", { class: "small muted", text: `Pacing: avg ${s.pacing.avgSeconds}s over ${s.pacing.timed} timed questions · ${s.pacing.slow} over 71s` }));
  }
  if (s.drills.total) details.append(h("p", { class: "small muted", text: `Test me: ${s.drills.correct}/${s.drills.total} right (${pct(s.drills.accuracy)})` }));
  if (extras.onShare) details.append(h("div", { class: "row" }, h("button", { class: "btn small", text: "Share progress image", onclick: extras.onShare })));
  return details;
}
