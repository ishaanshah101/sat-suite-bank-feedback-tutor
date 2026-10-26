import { generateText, Output } from "ai";
import { EXTRACT_INSTRUCTIONS } from "./prompts";
import { ExtractionOutputSchema, type ExtractionOutput, type ParsedQuestion } from "./schemas";
import { abortAfter, isNoOutputError, retryOnNoOutput, withFailover, type FailoverResult } from "./providers";
import { normalizeDifficulty, normalizeDomain, normalizeSkill, domainForSkill } from "@/lib/questions/taxonomy";

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export type ExtractInput = { image: string; text?: undefined } | { text: string; image?: undefined };

const DATA_URL = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/;

export function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw new ExtractionError("Expected a PNG, JPEG or WebP data URL");
  const mediaType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  return { mediaType, base64: match[2] };
}

export function normalizeExtraction(output: ExtractionOutput): ParsedQuestion {
  const stem = output.stem?.trim() ?? "";
  const choices = {
    A: output.choices.A?.trim() ?? "",
    B: output.choices.B?.trim() ?? "",
    C: output.choices.C?.trim() ?? "",
    D: output.choices.D?.trim() ?? "",
  };
  if (!output.question_found || !stem || Object.values(choices).some((c) => !c)) {
    throw new ExtractionError(output.notes?.trim() || "No complete question with four choices was found. Make sure the whole question and all four choices are visible.");
  }
  const qbIdRaw = output.qb_id?.trim().toLowerCase() ?? "";
  const qb_id = /^[0-9a-f]{8}$/.test(qbIdRaw) ? qbIdRaw : null;
  const skill = normalizeSkill(output.skill);
  const domain = normalizeDomain(output.domain) ?? domainForSkill(skill);
  const difficulty = normalizeDifficulty(output.difficulty);
  const correct = output.visible_answer_panel ? output.correct : null;
  return {
    qb_id,
    test: output.test?.trim() || (skill ? "SAT Reading and Writing" : null),
    domain,
    skill,
    difficulty,
    passage: output.passage?.trim() || null,
    stem,
    choices,
    correct,
    rationale: output.rationale?.trim() || null,
  };
}

export async function extractQuestion(input: ExtractInput): Promise<FailoverResult<ParsedQuestion>> {
  return withFailover("extract", async (provider) => {
    const content: Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; data: string }> = [];
    if (input.image) {
      const { mediaType, base64 } = parseDataUrl(input.image);
      content.push({ type: "file", mediaType, data: base64 });
      content.push({ type: "text", text: "Extract the question in this screenshot." });
    } else {
      content.push({ type: "text", text: `Extract the question from this pasted text:\n\n${input.text}` });
    }
    let output: ExtractionOutput;
    try {
      const result = await retryOnNoOutput(() => generateText({
        model: provider.model("extract"),
        instructions: EXTRACT_INSTRUCTIONS,
        messages: [{ role: "user", content }],
        output: Output.object({ schema: ExtractionOutputSchema, name: "parsed_question" }),
        providerOptions: provider.providerOptions("extract"),
        maxOutputTokens: 4000,
        abortSignal: abortAfter(28_000),
      }));
      output = result.output;
    } catch (error) {
      if (isNoOutputError(error)) throw new ExtractionError("The model could not read a complete question. Try a clearer or closer screenshot.");
      throw error;
    }
    return normalizeExtraction(output);
  });
}
