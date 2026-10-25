"use client";

import { useState } from "react";
import type { QuestionRow } from "@/db/schema";
import type { ParsedPdfQuestion } from "@/lib/questions/pdf-parse";
import { postJson } from "@/lib/client/api";
import { renderPdfPage } from "@/lib/client/pdf";
import type { PdfImport } from "./input-strip";
import { Button, Chip, ErrorNote, Spinner } from "./ui";

export function PdfList({
  pdf,
  onOpen,
  onQueue,
  onClose,
}: {
  pdf: PdfImport;
  onOpen: (question: QuestionRow) => void;
  onQueue: (questions: QuestionRow[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const good = pdf.parsed.filter((q) => q.ok);
  const bad = pdf.parsed.filter((q) => !q.ok);

  const save = async (items: ParsedPdfQuestion[]): Promise<QuestionRow[]> => {
    const payload = items.map((q) => ({
      qb_id: q.qb_id,
      test: q.test,
      domain: q.domain,
      skill: q.skill,
      difficulty: q.difficulty,
      passage: q.passage,
      stem: q.stem,
      choices: q.choices,
      correct: q.correct,
      rationale: q.rationale,
    }));
    const rows: QuestionRow[] = [];
    for (let i = 0; i < payload.length; i += 40) {
      const data = await postJson<{ questions: QuestionRow[] }>("/api/questions", { questions: payload.slice(i, i + 40) });
      rows.push(...data.questions);
    }
    return rows;
  };

  const open = async (q: ParsedPdfQuestion) => {
    setLoading(q.qb_id ?? "");
    setError(null);
    try {
      const [row] = await save([q]);
      onOpen(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  const vision = async (q: ParsedPdfQuestion) => {
    setLoading(q.qb_id ?? "");
    setError(null);
    try {
      const image = await renderPdfPage(pdf.file, q.pages[0] ?? 1);
      const data = await postJson<{ question: QuestionRow }>("/api/extract", { image, source: "pdf" });
      onOpen(data.question);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  const queue = async () => {
    const items = good.filter((_, i) => selected.has(i));
    if (!items.length) return;
    setLoading("queue");
    setError(null);
    try {
      onQueue(await save(items));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="space-y-3" data-testid="pdf-list">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">
          {pdf.file.name}: {good.length} question{good.length === 1 ? "" : "s"} parsed from {pdf.totalPages} pages
        </h2>
        {bad.length ? <Chip tone="warn">{bad.length} need a look</Chip> : null}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={queue} disabled={!selected.size || loading !== null}>
            {loading === "queue" ? <Spinner /> : null} Review the {selected.size || ""} I marked
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      {pdf.warnings.map((wg) => (
        <p key={wg} className="text-sm text-warn">
          {wg}
        </p>
      ))}
      <ErrorNote message={error} />
      <ol className="divide-y divide-line rounded-xl border border-line">
        {good.map((q, i) => (
          <li key={`${q.qb_id}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
            <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} aria-label="I missed this one" className="h-4 w-4" />
            <button type="button" onClick={() => open(q)} className="min-w-0 flex-1 truncate text-left hover:text-accent" disabled={loading !== null}>
              <span className="font-mono text-xs text-muted">{q.qb_id}</span> <span className="text-muted">{q.skill ?? q.domain ?? ""}</span> {q.stem}
            </button>
            {q.difficulty ? <Chip>{q.difficulty}</Chip> : null}
            {loading === q.qb_id ? <Spinner /> : null}
          </li>
        ))}
        {bad.map((q, i) => (
          <li key={`bad-${q.qb_id}-${i}`} className="flex items-center gap-3 bg-warn-soft/40 px-3 py-2 text-sm">
            <span className="h-4 w-4" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-mono text-xs text-muted">{q.qb_id}</span> {q.stem || "(no stem found)"} <span className="text-warn">({q.issues.join("; ")})</span>
            </span>
            <Button variant="secondary" onClick={() => vision(q)} disabled={loading !== null} className="px-2 py-1 text-xs">
              {loading === q.qb_id ? <Spinner /> : null} Read page {q.pages[0] ?? "?"} with vision
            </Button>
          </li>
        ))}
      </ol>
    </div>
  );
}
