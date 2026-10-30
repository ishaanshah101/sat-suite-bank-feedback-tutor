"use client";

import { useState } from "react";
import type { Choices, Letter } from "@/lib/ai/schemas";
import { ApiError, postJson } from "@/lib/client/api";
import { parseSprEntry } from "@/lib/questions/spr";
import { MathText } from "./math-text";
import { Button, ErrorNote, Spinner } from "./ui";

interface DrillResponse {
  drillId: string;
  ruleId: string;
  ruleName: string;
  format?: "mcq" | "spr";
  question: { passage: string | null; figure?: string | null; stem: string; choices: Choices | null };
}

interface CheckResponse {
  correct: boolean;
  format?: "mcq" | "spr";
  correctLetter: Letter | null;
  correctAnswer?: string | null;
  whyCorrect: string;
  fix: string | null;
  solution?: string[];
}

const LETTERS: Letter[] = ["A", "B", "C", "D"];

function drillError(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.code === "unverified") return "Could not double-check that question. Try again.";
  return e instanceof Error ? e.message : fallback;
}

export function DrillPanel({ attemptId }: { attemptId: string }) {
  const [drill, setDrill] = useState<DrillResponse | null>(null);
  const [picked, setPicked] = useState<Letter | null>(null);
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setPicked(null);
    setResponse("");
    try {
      setDrill(await postJson<DrillResponse>("/api/drill", { attemptId }));
    } catch (e) {
      setError(drillError(e, "Could not write a drill"));
    } finally {
      setLoading(false);
    }
  };

  const answer = async (letter: Letter) => {
    if (!drill || result || checking) return;
    setChecking(true);
    setPicked(letter);
    setError(null);
    try {
      setResult(await postJson<CheckResponse>("/api/drill/check", { drillId: drill.drillId, picked: letter }));
    } catch (e) {
      setPicked(null);
      setError(drillError(e, "Could not check that"));
    } finally {
      setChecking(false);
    }
  };

  const gridIn = drill?.format === "spr" || (drill !== null && !drill.question.choices);
  const entry = parseSprEntry(response);

  const submitGridIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!drill || result || checking || !entry.ok) return;
    setChecking(true);
    setError(null);
    try {
      setResult(await postJson<CheckResponse>("/api/drill/check", { drillId: drill.drillId, response: entry.text }));
    } catch (e) {
      setError(drillError(e, "Could not check that"));
    } finally {
      setChecking(false);
    }
  };

  if (!drill) {
    return (
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={start} disabled={loading} title="Writes one new mini-question on the same rule">
          {loading ? <Spinner /> : null} Test me
        </Button>
        {loading ? <span className="text-sm text-muted">Writing and double-checking a question...</span> : null}
        <ErrorNote message={error} />
      </div>
    );
  }

  const answerLabel = result ? (result.correctLetter ?? result.correctAnswer ?? "") : "";

  return (
    <div className="space-y-3" data-testid="drill-panel">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        Test me · {drill.ruleId} {drill.ruleName}
      </div>
      {drill.question.passage ? <MathText as="div" text={drill.question.passage} className="prose-passage rounded-xl bg-bg px-4 py-3 text-[15px]" /> : null}
      {drill.question.figure ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Figure</div>
          <MathText as="div" text={drill.question.figure} className="figure-text mt-1" />
        </div>
      ) : null}
      <MathText as="p" text={drill.question.stem} className="font-medium" />
      {gridIn ? (
        <form onSubmit={submitGridIn} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              disabled={Boolean(result) || checking}
              inputMode="decimal"
              maxLength={6}
              placeholder="Your answer"
              aria-label="Your answer"
              className="w-36 rounded-lg border border-line bg-bg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
              data-testid="drill-spr-input"
            />
            <Button type="submit" disabled={Boolean(result) || checking || !entry.ok} data-testid="drill-spr-submit">
              {checking ? <Spinner /> : null} Check
            </Button>
          </div>
          {response && !entry.ok ? <p className="text-sm text-danger">{entry.error}</p> : null}
        </form>
      ) : drill.question.choices ? (
        <ol className="space-y-2">
          {LETTERS.map((letter) => {
            const isPick = picked === letter;
            const isCorrect = result?.correctLetter === letter;
            const tone = result ? (isCorrect ? "border-good bg-good-soft" : isPick ? "border-danger bg-danger-soft" : "border-line") : isPick ? "border-accent" : "border-line hover:bg-bg";
            return (
              <li key={letter}>
                <button type="button" onClick={() => answer(letter)} disabled={Boolean(result) || checking} className={`flex w-full gap-3 rounded-xl border px-3 py-2 text-left text-[15px] ${tone}`}>
                  <span className="w-5 shrink-0 font-semibold">{letter}.</span>
                  <MathText text={drill.question.choices![letter]} />
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
      {result ? (
        <div className={`rounded-xl px-4 py-3 text-[15px] ${result.correct ? "bg-good-soft" : "bg-danger-soft"}`} data-testid="drill-result">
          <p className="font-medium">{result.correct ? "Right." : `Not quite. The answer is ${answerLabel}.`}</p>
          <MathText as="p" text={result.correct ? result.whyCorrect : (result.fix ?? result.whyCorrect)} className="mt-1" />
          {!result.correct && result.fix ? <MathText as="p" text={result.whyCorrect} className="mt-1 text-muted" /> : null}
          {result.solution?.length ? (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm" data-testid="drill-solution">
              {result.solution.map((step, i) => (
                <MathText key={i} as="li" text={step} />
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
      <ErrorNote message={error} />
      {result ? (
        <Button variant="secondary" onClick={start} disabled={loading}>
          {loading ? <Spinner /> : null} Another one
        </Button>
      ) : null}
    </div>
  );
}
