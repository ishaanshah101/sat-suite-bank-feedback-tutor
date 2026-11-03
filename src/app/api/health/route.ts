import { json, withApi } from "@/lib/api";
import { healthReportFor } from "@/lib/health";

export const runtime = "nodejs";

export async function GET() {
  return withApi(async (session) => json(await healthReportFor(session.userId)));
}
