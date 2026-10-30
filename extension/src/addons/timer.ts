// Pacing timer. The time between two captures is roughly the time spent on one question,
// so no extra clicks are needed. Target is the real test pace: ~71 s per Reading and Writing
// question, ~95 s per Math question (pass targetSecondsFor(question) from stats.ts).

import { h } from "./dom";
import { TARGET_SECONDS } from "./stats";
import { KEYS, kv } from "./store";

export interface TimerState {
  /** When the current question started (last capture, or when the timer was reset). */
  startedAt: number | null;
  laps: number[];
}

export const emptyTimer = (): TimerState => ({ startedAt: null, laps: [] });

/** A capture happened: close the current lap (if any) and start the next one. */
export function lap(state: TimerState, now: number): { state: TimerState; seconds: number | null } {
  const seconds = state.startedAt !== null ? Math.round((now - state.startedAt) / 1000) : null;
  // Ignore gaps over 30 minutes: that's a break, not one question.
  const valid = seconds !== null && seconds > 0 && seconds <= 1800 ? seconds : null;
  return { state: { startedAt: now, laps: valid !== null ? [...state.laps, valid].slice(-200) : state.laps }, seconds: valid };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function sessionStats(state: TimerState, target = TARGET_SECONDS): { count: number; avg: number | null; overTarget: number } {
  const n = state.laps.length;
  return {
    count: n,
    avg: n ? Math.round(state.laps.reduce((a, b) => a + b, 0) / n) : null,
    overTarget: state.laps.filter((s) => s > target).length,
  };
}

export async function readTimer(): Promise<TimerState> {
  return (await kv().get<TimerState>(KEYS.timer)) ?? emptyTimer();
}
export async function writeTimer(state: TimerState): Promise<void> {
  await kv().set(KEYS.timer, state);
}

let ticker: ReturnType<typeof setInterval> | null = null;

/** Small strip under the capture button. Ticks itself without re-rendering the panel. */
export function renderTimer(state: TimerState, actions: { reset: () => void }, target = TARGET_SECONDS): HTMLElement {
  const clock = h("span", { class: "rc-clock", text: "0:00" });
  const s = sessionStats(state, target);
  const tick = () => {
    if (state.startedAt === null) { clock.textContent = "--:--"; return; }
    const secs = (Date.now() - state.startedAt) / 1000;
    clock.textContent = formatClock(secs);
    clock.classList.toggle("over", secs > target);
  };
  tick();
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => (clock.isConnected ? tick() : ticker && clearInterval(ticker)), 1000);
  return h(
    "div",
    { class: "rc-timer row between small", title: `Time on this question. Target pace is ${target}s (${target > TARGET_SECONDS ? "44 Math questions in 70 minutes" : "54 questions in 64 minutes"}).` },
    h("span", { class: "row" }, h("span", { class: "muted", text: state.startedAt !== null ? "This question" : "Timer starts at your next capture" }), state.startedAt !== null ? clock : null),
    h(
      "span",
      { class: "row" },
      s.count ? h("span", { class: "muted", text: `${s.count} done · avg ${formatClock(s.avg ?? 0)}${s.overTarget ? ` · ${s.overTarget} slow` : ""}` }) : null,
      h("button", { class: "btn link small", text: "Reset", onclick: actions.reset }),
    ),
  );
}
