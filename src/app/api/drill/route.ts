import { z } from "zod";
import { HttpError, json, readJson, withApi } from "@/lib/api";
import { generateDrill } from "@/lib/ai/drill";
import { getRule } from "@/content/rules";
import { createDrill, getAttempt } from "@/db/queries";
import { chargeAiQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";
// Math drills are written and then solved again independently before they are shown.
export const maxDuration = 120;

const Body = z.object({ attemptId: z.string().uuid() });

export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request));
    const data = await getAttempt(session.userId, body.attemptId);
    if (!data) throw new HttpError(404, "Attempt not found");
    const rule = getRule(data.attempt.ruleId);
    if (!rule) throw new HttpError(409, "This attempt has no rule yet. Explain it first.");
    await chargeAiQuota(session.userId, "drill");
    const { result: drill, provider, model } = await generateDrill(rule, data.question);
    const row = await createDrill(session.userId, { attemptId: data.attempt.id, ruleId: rule.id, question: drill });
    return json({
      drillId: row.id,
      ruleId: rule.id,
      ruleName: rule.name,
      format: drill.format,
      question: {
        passage: drill.passage,
        figure: drill.figure ?? null,
        stem: drill.stem,
        choices: drill.format === "mcq" ? drill.choices : null,
      },
      provider,
      model,
    });
  });
}
