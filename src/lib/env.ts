export function env(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const DEFAULT_OWNER_USER_ID = "68311219-1a38-469e-ab48-b3bf632be848";

export function ownerUserId(): string {
  return env("OWNER_USER_ID") ?? DEFAULT_OWNER_USER_ID;
}

export function appVersion(): string {
  return env("VERCEL_GIT_COMMIT_SHA")?.slice(0, 7) ?? "dev";
}
