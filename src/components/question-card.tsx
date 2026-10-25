"use client";

import { useState } from "react";
import type { QuestionRow } from "@/db/schema";
import type { Letter, Pick } from "@/lib/ai/schemas";
import { Chip } from "./ui";

const LETTERS: Letter[] = ["A", "B", "C", "D"];

export function QuestionCard({
  question,
  picked,
  showAnswer,
  children,
}: {
  question: QuestionRow;
  picked?: Pick | null;
  showAnswer?: boolean;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const passage = question.passage ?? "";
  const long = passage.length > 700;
  const visible = long && !expanded ? `${passage.slice(0, 700)}...` : passage;
  const correct = showAnswer ? question.correct : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {question.qbId ? <Chip>ID {question.qbId}</Chip> : null}
        {question.domain ? <Chip tone="accent">{question.domain}</Chip> : null}
        {question.skill ? <Chip tone="accent">{question.skill}</Chip> : null}
        {question.difficulty ? <Chip>{question.difficulty}</Chip> : null}
        <Chip>{question.source}</Chip>
        {question.answerSource === "model" ? <Chip tone="warn">answer solved by the model</Chip> : null}
      </div>
      {passage ? (
        <div className="prose-passage rounded-xl bg-bg px-4 py-3 text-[15px]">
          {visible}
          {long ? (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="ml-2 text-sm font-medium text-accent">
              {expanded ? "Show less" : "Show all"}
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="font-medium leading-relaxed">{question.stem}</p>
      <ol className="space-y-2">
        {LETTERS.map((letter) => {
          const isPick = picked === letter;
          const isCorrect = correct === letter;
          const tone = isCorrect ? "border-good bg-good-soft" : isPick ? "border-danger bg-danger-soft" : "border-line";
          return (
            <li key={letter} className={`flex gap-3 rounded-xl border px-3 py-2 text-[15px] ${tone}`}>
              <span className="w-5 shrink-0 font-semibold">{letter}.</span>
              <span className="leading-relaxed">{question.choices[letter]}</span>
              {isCorrect ? <span className="ml-auto text-xs font-semibold text-good">correct</span> : null}
              {isPick && !isCorrect ? <span className="ml-auto text-xs font-semibold text-danger">your pick</span> : null}
            </li>
          );
        })}
      </ol>
      {children}
    </div>
  );
}
