import Link from "next/link";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in · Rulecard" };

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted">Rulecard</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Learn the rule behind every miss</h1>
          <p className="mt-2 text-sm text-muted">Free SAT Reading &amp; Writing review. Your history is saved to your account and shared with the Chrome extension.</p>
        </div>
        <AuthForm />
        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </p>
      </div>
    </main>
  );
}
