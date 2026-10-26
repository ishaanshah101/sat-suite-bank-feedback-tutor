import { Shell } from "@/components/shell";
import { Card, Chip } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";
import { healthReport } from "@/lib/health";

export const metadata = { title: "Status · Rulecard" };

export default async function HealthPage() {
  await requirePageSession();
  const report = await healthReport();
  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight">Status</h1>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold">App</h2>
          <p className="mt-2 text-sm">
            {report.ok ? <Chip tone="good">healthy</Chip> : <Chip tone="danger">needs attention</Chip>} <span className="ml-2 text-muted">version {report.version}</span>
          </p>
          <p className="mt-2 text-sm text-muted">Old passcode set (lets the original history be claimed): {report.passcodeConfigured ? "yes" : "no"}</p>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Database</h2>
          <p className="mt-2 text-sm">
            {report.db.ok ? <Chip tone="good">ok · {report.db.ms} ms</Chip> : <Chip tone="danger">down</Chip>} <span className="ml-2 text-muted">{report.db.kind}</span>
          </p>
          <p className="mt-2 text-sm text-muted">{report.db.message}</p>
          {report.db.error ? <p className="mt-1 break-all font-mono text-xs text-danger">{report.db.error}</p> : null}
        </Card>
        <Card className="md:col-span-2">
          <h2 className="text-sm font-semibold">AI providers</h2>
          <p className="mt-2 text-sm text-muted">
            Order: {report.ai.order.join(" then ")}. Live now: {report.ai.live ?? "none"}.
            {report.ai.configured.length === 0 && !report.ai.stub ? " No API key is set. Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel." : ""}
            {report.ai.configured.length === 1 && report.ai.configured[0] === "gateway" ? " Running on Vercel AI Gateway credits. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to use your own account first." : ""}
          </p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {report.ai.providers.map((p) => (
              <li key={p.name} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-24 font-medium">{p.name}</span>
                {p.configured ? <Chip tone="good">{p.auth}</Chip> : <Chip>{p.auth}</Chip>}
                {p.cooldownUntil && p.cooldownUntil > new Date() ? <Chip tone="warn">cooling down until {p.cooldownUntil.toLocaleTimeString()}</Chip> : null}
                <span className="text-muted">last ok: {p.lastOkAt ? p.lastOkAt.toLocaleString() : "never"}</span>
                <span className="text-muted">last error: {p.lastErrorAt ? `${p.lastErrorAt.toLocaleString()} ${p.lastError ?? ""}` : "none"}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}
