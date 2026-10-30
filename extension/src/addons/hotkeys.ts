// Keyboard-first flow inside the side panel. Chrome's global shortcut (Alt+Shift+R) already
// captures; these work once the panel has focus.

export interface HotkeyActions {
  pick?: (letter: "A" | "B" | "C" | "D") => void;
  pickCorrect?: () => void;
  explain?: () => void;
  capture?: () => void;
  testMe?: () => void;
  review?: () => void;
  focusChat?: () => void;
  copyCard?: () => void;
  help?: () => void;
  /** Sees every key first, e.g. an open practice screen (pressPracticeKey). True when it used the key. */
  raw?: (key: string) => boolean;
}

export const HOTKEY_HELP: [string, string][] = [
  ["1–4", "pick answer A–D (A, B, D keys work too)"],
  ["G", "I got it right, explain anyway"],
  ["Enter", "explain"],
  ["C", "capture this tab (so use 3 for choice C)"],
  ["T", "Test me (new question on the rule)"],
  ["R", "start a review"],
  ["/", "ask a follow-up"],
  ["Y", "copy the rule card"],
  ["?", "show these shortcuts"],
  ["Esc", "leave a text box, or quit practice"],
  ["Space", "practice: flip the card, or go to the next question"],
  ["1–3", "flashcards: Again, Hard, Good"],
  ["S", "redo my misses: skip this question"],
];

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Pure mapping, exported for tests. */
export function actionFor(key: string): { name: Exclude<keyof HotkeyActions, "raw">; arg?: "A" | "B" | "C" | "D" } | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  const letters = { a: "A", b: "B", c: null, d: "D", "1": "A", "2": "B", "3": "C", "4": "D" } as const;
  if (k in letters && letters[k as keyof typeof letters]) return { name: "pick", arg: letters[k as keyof typeof letters]! };
  switch (k) {
    case "c": return { name: "capture" };
    case "g": return { name: "pickCorrect" };
    case "Enter": return { name: "explain" };
    case "t": return { name: "testMe" };
    case "r": return { name: "review" };
    case "/": return { name: "focusChat" };
    case "y": return { name: "copyCard" };
    case "?": return { name: "help" };
    default: return null;
  }
}

/**
 * Note: "C" means capture, so choice C is picked with "3". (A/B/D letters and 1–4 always work.)
 * Returns an uninstall function.
 */
export function installHotkeys(getActions: () => HotkeyActions, target: Document = document): () => void {
  const onKey = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "Escape" && typing(ev.target)) { (ev.target as HTMLElement).blur(); return; }
    if (typing(ev.target)) return;
    if ((ev.key === "Enter" || ev.key === " ") && ev.target instanceof HTMLElement && ev.target.closest("button, a, summary, [role=button]")) return;
    const actions = getActions();
    if (actions.raw?.(ev.key)) { ev.preventDefault(); return; }
    const hit = actionFor(ev.key);
    if (!hit) return;
    const fn = actions[hit.name] as ((arg?: unknown) => void) | undefined;
    if (!fn) return;
    ev.preventDefault();
    fn(hit.arg);
  };
  target.addEventListener("keydown", onKey);
  return () => target.removeEventListener("keydown", onKey);
}
