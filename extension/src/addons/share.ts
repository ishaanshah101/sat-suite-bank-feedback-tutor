// "Share my progress": renders a 1080×1350 PNG (Instagram portrait) with the student's numbers.
// Everything is drawn locally on a canvas; nothing is uploaded.

import type { Summary } from "./stats";
import type { Countdown } from "./stats";

export interface ShareLine { big: string; small: string }

export function shareLines(s: Summary, cd: Countdown | null): ShareLine[] {
  const lines: ShareLine[] = [
    { big: `${s.streakDays}`, small: s.streakDays === 1 ? "day streak" : "day streak" },
    { big: `${s.thisWeek.attempts}`, small: "questions this week" },
    { big: s.accuracy === null ? "–" : `${Math.round(s.accuracy * 100)}%`, small: "accuracy overall" },
    { big: `${s.mastery.mastered}`, small: s.mastery.mastered === 1 ? "rule mastered" : "rules mastered" },
  ];
  if (cd) lines.push({ big: `${cd.days}`, small: `days to my SAT (${cd.label})` });
  return lines;
}

export async function renderShareImage(s: Summary, cd: Countdown | null): Promise<string> {
  const W = 1080, H = 1350;
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas not available");
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#1e3a8a");
  grad.addColorStop(1, "#2f5bea");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // soft circles
  g.fillStyle = "rgba(255,255,255,0.06)";
  for (const [x, y, r] of [[900, 180, 260], [120, 1180, 320], [980, 1100, 140]] as const) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const sans = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  g.fillStyle = "#ffffff";
  g.font = `700 64px ${sans}`;
  g.fillText("My SAT Reading & Writing", 80, 170);
  g.font = `500 40px ${sans}`;
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.fillText("practice, one rule at a time", 80, 230);

  const lines = shareLines(s, cd);
  let y = 380;
  for (const line of lines) {
    g.fillStyle = "rgba(255,255,255,0.12)";
    const h = 150;
    roundRect(g, 80, y, W - 160, h, 28);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = `800 92px ${sans}`;
    g.fillText(line.big, 120, y + 108);
    const bigW = g.measureText(line.big).width;
    g.font = `500 40px ${sans}`;
    g.fillStyle = "rgba(255,255,255,0.88)";
    g.fillText(line.small, 120 + bigW + 32, y + 100);
    y += h + 26;
  }
  g.font = `600 36px ${sans}`;
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.fillText("Rulecard · rulecard.vercel.app", 80, H - 80);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function roundRect(g: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}
