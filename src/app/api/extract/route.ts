import { z } from "zod";
import { json, readJson, withApi } from "@/lib/api";
import { extractQuestion } from "@/lib/ai/extract";
import { upsertQuestion } from "@/db/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.union([
  z.object({ image: z.string().min(32).max(6_000_000), source: z.enum(["capture", "image", "pdf"]).default("capture") }),
  z.object({ text: z.string().min(20).max(20_000), source: z.literal("paste").default("paste") }),
]);

export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request));
    const extracted = "image" in body ? await extractQuestion({ image: body.image }) : await extractQuestion({ text: body.text });
    const question = await upsertQuestion(session.userId, extracted.result, body.source);
    return json({ question, provider: extracted.provider, model: extracted.model });
  });
}
