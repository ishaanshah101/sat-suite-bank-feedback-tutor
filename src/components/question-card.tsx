"use client";

import { useState } from "react";
import type { QuestionRow } from "@/db/schema";
import type { Letter, Pick } from "@/lib/ai/schemas";
import { MathText } from "./math-text";
import { Chip } from "./ui";

const LETTERS: Letter[] = ["A", "B", "C", "D"];

export function QuestionCard({
  question,
  picked,
  response,
  isCorrect,
  showAnswer,
  children,
}: {
  question: QuestionRow;
  picked?: Pick | null;
  /** Grid-in only: what the student typed. */
  response?: string | null;
  /** Graded result of the student's answer, when known. */
  isCorrect?: boolean | null;
  showAnswer?: boolean;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const passage = question.passage ?? "";
  const long = passage.length > 700;
  const visible = long && !expanded ? `${passage.slice(0, 700)}...` : passage;
  const correct = showAnswer ? question.correct : null;
  const gridIn = question.format === "spr";
  const math = question.section === "math";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={math ? "accent" : "neutral"}>{math ? "Math" : "Reading and Writing"}</Chip>
        {question.qbId ? <Chip>ID {question.qbId}</Chip> : null}
        {question.domain ? <Chip tone="accent">{question.domain}</Chip> : null}
        {question.skill ? <Chip tone="accent">{question.skill}</Chip> : null}
        {question.difficulty ? <Chip>{question.difficulty}</Chip> : null}
        {gridIn ? <Chip>grid-in</Chip> : null}
        <Chip>{question.source}</Chip>
        {question.answerSource === "model" ? <Chip tone="warn">answer solved by the model</Chip> : null}
      </div>
      {passage ? (
        <div className="prose-passage rounded-xl bg-bg px-4 py-3 text-[15px]">
          <MathText text={visible} />
          {long ? (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="ml-2 text-sm font-medium text-accent">
              {expanded ? "Show less" : "Show all"}
            </button>
          ) : null}
        </div>
      ) : null}
      {question.figure ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-3 text-sm" data-testid="question-figure">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Figure, as read</div>
          <MathText as="div" text={question.figure} className="figure-text mt-1" />
        </div>
      ) : null}
      <MathText as="p" text={question.stem} className="font-medium leading-relaxed" />
      {!gridIn && question.choices ? (
        <ol className="space-y-2">
          {LETTERS.map((letter) => {
            const isPick = picked === letter;
            const isCorrect = correct === letter;
            const tone = isCorrect ? "border-good bg-good-soft" : isPick ? "border-danger bg-danger-soft" : "border-line";
            return (
              <li key={letter} className={`flex gap-3 rounded-xl border px-3 py-2 text-[15px] ${tone}`}>
                <span className="w-5 shrink-0 font-semibold">{letter}.</span>
                <MathText text={question.choices![letter]} className="leading-relaxed" />
                {isCorrect ? <span className="ml-auto text-xs font-semibold text-good">correct</span> : null}
                {isPick && !isCorrect ? <span className="ml-auto text-xs font-semibold text-danger">your pick</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {gridIn && showAnswer ? (
        <div className="space-y-2 text-[15px]" data-testid="grid-in-answer">
          {picked === "spr" && response ? (
            <p className={`rounded-xl border px-3 py-2 ${isCorrect === true ? "border-good bg-good-soft" : isCorrect === false ? "border-danger bg-danger-soft" : "border-line"}`}>
              <span className="font-semibold">Your answer:</span> {response}
              {isCorrect === true ? <span className="ml-2 text-xs font-semibold text-good">correct</span> : null}
              {isCorrect === false ? <span className="ml-2 text-xs font-semibold text-danger">not accepted</span> : null}
            </p>
          ) : null}
          {question.answers?.length ? (
            <p className="rounded-xl border border-good bg-good-soft px-3 py-2">
              <span className="font-semibold">Accepted answers:</span> {question.answers.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
