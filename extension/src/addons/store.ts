// Tiny key/value layer over chrome.storage.local, swappable for tests and the preview.

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export const chromeKV: KV = {
  async get<T>(key: string) {
    const out = await chrome.storage.local.get(key);
    return out[key] as T | undefined;
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  },
};

export function memoryKV(seed: Record<string, unknown> = {}): KV & { dump(): Record<string, unknown> } {
  const data: Record<string, unknown> = structuredClone(seed);
  return {
    async get<T>(key: string) {
      return structuredClone(data[key]) as T | undefined;
    },
    async set(key, value) {
      data[key] = structuredClone(value);
    },
    async remove(key) {
      delete data[key];
    },
    dump: () => structuredClone(data),
  };
}

let current: KV | null = null;
/** Defaults to chrome.storage.local when it exists, otherwise in-memory. */
export function kv(): KV {
  if (!current) current = typeof chrome !== "undefined" && chrome?.storage?.local ? chromeKV : memoryKV();
  return current;
}
export function setKV(next: KV): void {
  current = next;
}

/** Storage keys used by the addons. Kept in one place to avoid collisions with `settings`. */
export const KEYS = {
  log: "rc.addons.log.v1",
  srs: "rc.addons.srs.v1",
  prefs: "rc.addons.prefs.v1",
  timer: "rc.addons.timer.v1",
  sets: "rc.addons.sets.v1",
  /** achievements.ts: { [badgeId]: earnedAt } */
  badges: "rc.addons.badges.v1",
} as const;
