"use client";

import { useState } from "react";
import type { Choices, Letter } from "@/lib/ai/schemas";
import { postJson } from "@/lib/client/api";
import { Button, ErrorNote, Spinner } from "./ui";

interface DrillResponse {
  drillId: string;
  ruleId: string;
  ruleName: string;
  question: { passage: string | null; stem: string; choices: Choices };
}

interface CheckResponse {
  correct: boolean;
  correctLetter: Letter;
  whyCorrect: string;
  fix: string | null;
}

const LETTERS: Letter[] = ["A", "B", "C", "D"];

export function DrillPanel({ attemptId }: { attemptId: string }) {
  const [drill, setDrill] = useState<DrillResponse | null>(null);
  const [picked, setPicked] = useState<Letter | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setPicked(null);
    try {
      setDrill(await postJson<DrillResponse>("/api/drill", { attemptId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write a drill");
    } finally {
      setLoading(false);
    }
  };

  const answer = async (letter: Letter) => {
    if (!drill || result || checking) return;
    setChecking(true);
    setPicked(letter);
    try {
      setResult(await postJson<CheckResponse>("/api/drill/check", { drillId: drill.drillId, picked: letter }));
    } catch (e) {
      setPicked(null);
      setError(e instanceof Error ? e.message : "Could not check that");
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
        <ErrorNote message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="drill-panel">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        Test me · {drill.ruleId} {drill.ruleName}
      </div>
      {drill.question.passage ? <p className="prose-passage rounded-xl bg-bg px-4 py-3 text-[15px]">{drill.question.passage}</p> : null}
      <p className="font-medium">{drill.question.stem}</p>
      <ol className="space-y-2">
        {LETTERS.map((letter) => {
          const isPick = picked === letter;
          const isCorrect = result?.correctLetter === letter;
          const tone = result ? (isCorrect ? "border-good bg-good-soft" : isPick ? "border-danger bg-danger-soft" : "border-line") : isPick ? "border-accent" : "border-line hover:bg-bg";
          return (
            <li key={letter}>
              <button type="button" onClick={() => answer(letter)} disabled={Boolean(result) || checking} className={`flex w-full gap-3 rounded-xl border px-3 py-2 text-left text-[15px] ${tone}`}>
                <span className="w-5 shrink-0 font-semibold">{letter}.</span>
                <span>{drill.question.choices[letter]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {result ? (
        <div className={`rounded-xl px-4 py-3 text-[15px] ${result.correct ? "bg-good-soft" : "bg-danger-soft"}`} data-testid="drill-result">
          <p className="font-medium">{result.correct ? "Right." : `Not quite. The answer is ${result.correctLetter}.`}</p>
          <p className="mt-1">{result.correct ? result.whyCorrect : result.fix ?? result.whyCorrect}</p>
          {!result.correct ? <p className="mt-1 text-muted">{result.whyCorrect}</p> : null}
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
