"use client";

import { useState } from "react";
import type { QuestionRow } from "@/db/schema";
import type { Letter, Pick, RuleCard } from "@/lib/ai/schemas";
import { postJson } from "@/lib/client/api";
import { ChatPanel } from "./chat-panel";
import { DrillPanel } from "./drill-panel";
import { InputStrip, type PdfImport } from "./input-strip";
import { PdfList } from "./pdf-list";
import { QuestionCard } from "./question-card";
import { RuleCardView } from "./rule-card";
import { Button, Card, ErrorNote, Spinner } from "./ui";

const LETTERS: Letter[] = ["A", "B", "C", "D"];

interface Explained {
  attemptId: string;
  card: RuleCard;
  picked: Pick;
}

export function ReviewWorkspace() {
  const [question, setQuestion] = useState<QuestionRow | null>(null);
  const [pdf, setPdf] = useState<PdfImport | null>(null);
  const [queue, setQueue] = useState<QuestionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Pick | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [allowSolve, setAllowSolve] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explained, setExplained] = useState<Explained | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (q: QuestionRow) => {
    setQuestion(q);
    setPicked(null);
    setReasoning("");
    setAllowSolve(false);
    setExplained(null);
    setError(null);
  };

  const explain = async () => {
    if (!question || !picked) return;
    setExplaining(true);
    setError(null);
    try {
      const data = await postJson<{ attemptId: string; card: RuleCard; question: QuestionRow }>("/api/explain", {
        questionId: question.id,
        picked,
        reasoning: reasoning.trim() || null,
        allowModelSolve: allowSolve,
      });
      setQuestion(data.question);
      setExplained({ attemptId: data.attemptId, card: data.card, picked });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExplaining(false);
    }
  };

  const next = () => {
    const [head, ...rest] = queue;
    if (!head) return;
    setQueue(rest);
    load(head);
  };

  const needsAnswer = question && !question.correct;

  return (
    <div className="space-y-5">
      <Card>
        <InputStrip
          busy={busy}
          setBusy={setBusy}
          onQuestion={load}
          onPdf={(p) => {
            setPdf(p);
          }}
        />
      </Card>

      {pdf ? (
        <Card>
          <PdfList
            pdf={pdf}
            onOpen={(q) => {
              load(q);
            }}
            onQueue={(rows) => {
              const [head, ...rest] = rows;
              setQueue(rest);
              if (head) load(head);
            }}
            onClose={() => setPdf(null)}
          />
        </Card>
      ) : null}

      {queue.length ? (
        <p className="text-sm text-muted">
          {queue.length} more in your queue.{" "}
          <button type="button" onClick={next} className="font-medium text-accent underline underline-offset-2">
            Skip to next
          </button>
        </p>
      ) : null}

      {question ? (
        <Card>
          <QuestionCard question={question} picked={explained?.picked ?? null} showAnswer={Boolean(explained)}>
            {needsAnswer && !explained ? (
              <div className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm" data-testid="needs-answer-banner">
                <p className="font-medium">The correct answer is not in what I read.</p>
                <p className="mt-1 text-muted">Reveal the answer on the Question Bank tab and capture again, or let me solve it (less reliable).</p>
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={allowSolve} onChange={(e) => setAllowSolve(e.target.checked)} className="h-4 w-4" />
                  Let the model work out the answer
                </label>
              </div>
            ) : null}
            {!explained ? (
              <div className="space-y-3 border-t border-line pt-4" data-testid="pick-panel">
                <p className="text-sm font-medium">Which did you pick?</p>
                <div className="flex flex-wrap gap-2">
                  {LETTERS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setPicked(l)}
                      className={`h-10 w-10 rounded-lg border text-sm font-semibold transition ${picked === l ? "border-accent bg-accent text-white" : "border-line hover:bg-bg"}`}
                      data-testid={`pick-${l}`}
                    >
                      {l}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPicked("correct")}
                    className={`rounded-lg border px-3 text-sm font-medium transition ${picked === "correct" ? "border-accent bg-accent text-white" : "border-line hover:bg-bg"}`}
                    data-testid="pick-correct"
                  >
                    I got it right, but explain
                  </button>
                </div>
                <input
                  value={reasoning}
                  onChange={(e) => setReasoning(e.target.value)}
                  placeholder="What was your thinking? (one line, optional but useful)"
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
                  data-testid="reasoning-input"
                />
                <div className="flex items-center gap-3">
                  <Button onClick={explain} disabled={!picked || explaining || (Boolean(needsAnswer) && !allowSolve)} data-testid="explain-button">
                    {explaining ? <Spinner /> : null} Explain
                  </Button>
                  {explaining ? <span className="text-sm text-muted">Writing your rule card...</span> : null}
                </div>
                <ErrorNote message={error} />
              </div>
            ) : null}
          </QuestionCard>
        </Card>
      ) : (
        <Card className="text-sm text-muted">
          <p className="font-medium text-ink">How it works</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open the SAT Suite Question Bank in another tab and work a question.</li>
            <li>Click Capture tab once and pick that tab. Each later press takes one picture.</li>
            <li>Tell me what you picked (and why). You get the one rule it tested, why your pick breaks it, and a takeaway.</li>
            <li>Ask follow-ups in the chat, or press Test me for a fresh question on the same rule.</li>
          </ol>
        </Card>
      )}

      {explained && question ? (
        <>
          <Card>
            <RuleCardView card={explained.card} picked={explained.picked} />
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <DrillPanel attemptId={explained.attemptId} />
              {queue.length ? (
                <Button onClick={next} className="ml-auto">
                  Next question ({queue.length} left)
                </Button>
              ) : null}
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Ask about this question</h2>
            <ChatPanel attemptId={explained.attemptId} />
          </Card>
        </>
      ) : null}
    </div>
  );
}
