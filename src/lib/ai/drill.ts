import { generateText, Output } from "ai";
import type { Rule } from "@/content/rules";
import type { QuestionRow } from "@/db/schema";
import { drillInstructions } from "./prompts";
import { withFailover, type FailoverResult } from "./providers";
import { DrillSchema, type Drill } from "./schemas";

export async function generateDrill(rule: Rule, question: QuestionRow): Promise<FailoverResult<Drill>> {
  const result = await withFailover("drill", async (provider) => {
    const res = await generateText({
      model: provider.model("drill"),
      instructions: drillInstructions(rule, question),
      messages: [{ role: "user", content: `Write one new mini-question that tests ${rule.id} (${rule.name}).` }],
      output: Output.object({ schema: DrillSchema, name: "drill_question" }),
      providerOptions: provider.providerOptions("drill"),
      maxOutputTokens: 4000,
    });
    if (!res.output) throw new Error("The model did not return a drill question.");
    return res.output;
  });
  const drill = { ...result.result, rule_id: rule.id };
  if (Object.values(drill.choices).some((c) => !c.trim()) || !drill.stem.trim()) {
    throw new Error("The drill question was incomplete.");
  }
  return { ...result, result: drill };
}
