"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteAccount() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!password || !window.confirm("Delete your Rulecard account and all saved history?")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not delete the account.");
        return;
      }
      router.replace("/signin");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <input
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm outline-none ring-accent focus:ring-2"
      />
      <button
        type="button"
        disabled={busy || !password}
        onClick={() => void remove()}
        className="rounded-lg border border-danger px-3 py-1.5 text-sm text-danger hover:bg-danger hover:text-white disabled:opacity-50"
      >
        {busy ? "Deleting..." : "Delete account"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
