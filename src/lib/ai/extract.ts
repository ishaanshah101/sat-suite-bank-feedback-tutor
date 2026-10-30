import { generateText, Output } from "ai";
import { EXTRACT_INSTRUCTIONS } from "./prompts";
import { ExtractionOutputSchema, type ExtractionOutput, type ParsedQuestion } from "./schemas";
import { abortAfter, isNoOutputError, retryOnNoOutput, withFailover, type FailoverResult } from "./providers";
import { SECTION_TEST_NAME, domainForSkill, inferSection, normalizeDifficulty, normalizeDomain, normalizeSkill } from "@/lib/questions/taxonomy";
import { splitAcceptedAnswers } from "@/lib/questions/spr";

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
  const skill = normalizeSkill(output.skill);
  const domain = normalizeDomain(output.domain) ?? domainForSkill(skill);
  const section = inferSection({ section: output.section, test: output.test, skill: output.skill, domain: output.domain });
  const choices = {
    A: output.choices?.A?.trim() ?? "",
    B: output.choices?.B?.trim() ?? "",
    C: output.choices?.C?.trim() ?? "",
    D: output.choices?.D?.trim() ?? "",
  };
  const hasChoices = Object.values(choices).every((c) => c.length > 0);
  // Only Math has grid-ins; a Math question without four choices is one.
  const format = section === "math" && (output.format === "spr" || !hasChoices) ? "spr" : "mcq";
  if (!output.question_found || !stem || (format === "mcq" && !hasChoices)) {
    throw new ExtractionError(
      output.notes?.trim() ||
        "No complete question was found. Make sure the whole question (and all four choices, if it has them) is visible.",
    );
  }
  const qbIdRaw = output.qb_id?.trim().toLowerCase() ?? "";
  const qb_id = /^[0-9a-f]{8}$/.test(qbIdRaw) ? qbIdRaw : null;
  const difficulty = normalizeDifficulty(output.difficulty);
  const answers =
    format === "spr" && output.visible_answer_panel
      ? [...new Set((output.accepted_answers ?? []).flatMap((a) => splitAcceptedAnswers(a)))].slice(0, 12)
      : [];
  return {
    qb_id,
    section,
    format,
    test: output.test?.trim() || (skill || section === "math" ? SECTION_TEST_NAME[section] : null),
    domain,
    skill,
    difficulty,
    passage: output.passage?.trim() || null,
    stem,
    choices: format === "mcq" ? choices : null,
    correct: format === "mcq" && output.visible_answer_panel ? output.correct : null,
    answers: answers.length ? answers : null,
    figure: output.figure?.trim() || null,
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
        maxOutputTokens: 6000,
        abortSignal: abortAfter(35_000),
      }));
      output = result.output;
    } catch (error) {
      if (isNoOutputError(error)) throw new ExtractionError("The model could not read a complete question. Try a clearer or closer screenshot.");
      throw error;
    }
    return normalizeExtraction(output);
  });
}
