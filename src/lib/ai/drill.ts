import { generateText, Output } from "ai";
import type { Rule } from "@/content/rules";
import type { QuestionRow } from "@/db/schema";
import { drillInstructions } from "./prompts";
import { abortAfter, isNoOutputError, retryOnNoOutput, withFailover, type FailoverResult } from "./providers";
import { HttpError } from "@/lib/api";
import { DrillSchema, type Drill } from "./schemas";

export async function generateDrill(rule: Rule, question: QuestionRow): Promise<FailoverResult<Drill>> {
  const result = await withFailover("drill", async (provider) => {
    try {
      const res = await retryOnNoOutput(() => generateText({
        model: provider.model("drill"),
        instructions: drillInstructions(rule, question),
        messages: [{ role: "user", content: `Write one new mini-question that tests ${rule.id} (${rule.name}).` }],
        output: Output.object({ schema: DrillSchema, name: "drill_question" }),
        providerOptions: provider.providerOptions("drill"),
        maxOutputTokens: 6000,
        abortSignal: abortAfter(25_000),
      }));
      return res.output;
    } catch (error) {
      if (isNoOutputError(error)) throw new HttpError(502, "The model did not return a complete drill. Try again.", "no_output");
      throw error;
    }
  });
  const drill = { ...result.result, rule_id: rule.id };
  if (Object.values(drill.choices).some((c) => !c.trim()) || !drill.stem.trim()) {
    throw new Error("The drill question was incomplete.");
  }
  return { ...result, result: drill };
}
