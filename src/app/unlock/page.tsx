import { UnlockForm } from "./unlock-form";

export const metadata = { title: "Unlock · Rulecard" };

export default function UnlockPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted">Rulecard</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Enter your passcode</h1>
          <p className="mt-2 text-sm text-muted">Private study tool. One passcode, one student.</p>
        </div>
        <UnlockForm />
      </div>
    </main>
  );
}
