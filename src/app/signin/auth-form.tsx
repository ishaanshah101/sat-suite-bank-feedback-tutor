"use client";

import { useActionState, useState } from "react";
import { authenticate, type AuthFormState } from "./actions";

const input = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-base outline-none ring-accent focus:ring-2";

export function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action, pending] = useActionState<AuthFormState | null, FormData>(authenticate, null);
  const signup = mode === "signup";
  return (
    <div>
      <div role="tablist" className="mb-5 grid grid-cols-2 rounded-lg bg-bg p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${mode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="mode" value={mode} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input name="email" type="email" autoComplete="email" autoFocus required defaultValue={state?.email} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            aria-describedby={signup ? "password-hint" : undefined}
            required
            className={input}
          />
        </label>
        {signup ? (
          <p id="password-hint" className="-mt-3 text-xs text-muted">
            At least 8 characters.
          </p>
        ) : null}
        {signup ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">Used Rulecard with a passcode before?</summary>
            <label className="mt-2 block">
              <span className="mb-1 block text-xs text-muted">Enter the old passcode to move that history into this account. Otherwise leave it empty.</span>
              <input name="passcode" type="password" autoComplete="off" className={input} />
            </label>
          </details>
        ) : null}
        {state?.error ? (
          <p role="alert" data-testid="auth-error" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "One moment..." : signup ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
