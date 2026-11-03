import { generateText, Output } from "ai";
import { EXTRACT_INSTRUCTIONS } from "./prompts";
import { ExtractionOutputSchema, ParsedQuestionSchema, QUESTION_LIMITS, type ExtractionOutput, type ParsedQuestion } from "./schemas";
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

const cut = (text: string | null | undefined, max: number): string => (text ?? "").trim().slice(0, max);

/**
 * Turn the model's reply into a stored question. `sourceText` is the pasted text when there was one:
 * the model's answer fields only count as official when that text really shows an answer line.
 */
export function normalizeExtraction(output: ExtractionOutput, sourceText?: string): ParsedQuestion {
  const stem = cut(output.stem, QUESTION_LIMITS.stem);
  const skill = normalizeSkill(output.skill);
  const domain = normalizeDomain(output.domain) ?? domainForSkill(skill);
  const section = inferSection({ section: output.section, test: output.test, skill: output.skill, domain: output.domain });
  const choices = {
    A: cut(output.choices?.A, QUESTION_LIMITS.choice),
    B: cut(output.choices?.B, QUESTION_LIMITS.choice),
    C: cut(output.choices?.C, QUESTION_LIMITS.choice),
    D: cut(output.choices?.D, QUESTION_LIMITS.choice),
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
  const official = output.visible_answer_panel && (sourceText === undefined || /correct answer|\banswer\s*:/i.test(sourceText));
  const answers =
    format === "spr" && official
      ? [...new Set((output.accepted_answers ?? []).flatMap((a) => splitAcceptedAnswers(a)))].slice(0, 12)
      : [];
  const parsed = ParsedQuestionSchema.safeParse({
    qb_id,
    section,
    format,
    test: cut(output.test, QUESTION_LIMITS.label) || (skill || section === "math" ? SECTION_TEST_NAME[section] : null),
    domain,
    skill,
    difficulty,
    passage: cut(output.passage, QUESTION_LIMITS.passage) || null,
    stem,
    choices: format === "mcq" ? choices : null,
    correct: format === "mcq" && official ? output.correct : null,
    answers: answers.length ? answers : null,
    figure: cut(output.figure, QUESTION_LIMITS.figure) || null,
    rationale: cut(output.rationale, QUESTION_LIMITS.rationale) || null,
  });
  if (!parsed.success) throw new ExtractionError("The extracted question was malformed. Try again with a clearer capture.");
  return parsed.data;
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
      // `.output` is where an off-schema reply throws, so it stays inside the retry.
      output = await retryOnNoOutput(
        async () =>
          (
            await generateText({
              model: provider.model("extract"),
              instructions: EXTRACT_INSTRUCTIONS,
              messages: [{ role: "user", content }],
              output: Output.object({ schema: ExtractionOutputSchema, name: "parsed_question" }),
              providerOptions: provider.providerOptions("extract"),
              maxOutputTokens: 6000,
              maxRetries: 1,
              abortSignal: abortAfter(35_000),
            })
          ).output as ExtractionOutput,
      );
    } catch (error) {
      if (isNoOutputError(error)) throw new ExtractionError("The model could not read a complete question. Try a clearer or closer screenshot.");
      throw error;
    }
    return normalizeExtraction(output, input.text);
  });
}
