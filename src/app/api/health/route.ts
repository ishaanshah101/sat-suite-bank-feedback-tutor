import { json, withApi } from "@/lib/api";
import { healthReport } from "@/lib/health";

export const runtime = "nodejs";

export async function GET() {
  return withApi(async () => json(await healthReport()));
}
