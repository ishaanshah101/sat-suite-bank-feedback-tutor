"use client";

import { useState } from "react";
import type { QuestionRow } from "@/db/schema";
import type { ParsedPdfQuestion } from "@/lib/questions/pdf-parse";
import { postJson } from "@/lib/client/api";
import { renderPdfPage, renderPdfPages } from "@/lib/client/pdf";
import { mathToPlain } from "@/lib/math/render";
import type { PdfImport } from "./input-strip";
import { Button, Chip, ErrorNote, Spinner } from "./ui";

/** A queued question: already saved, or a Math question that is read with vision when it is reached. */
export interface QueueItem {
  label: string;
  load: () => Promise<QuestionRow>;
}

type PdfQuestion = ParsedPdfQuestion & { section?: "rw" | "math"; needsVision?: boolean };

/** Math equations do not survive the PDF text layer, so Math questions are read from the rendered pages. */
export function needsVision(q: ParsedPdfQuestion): boolean {
  const pq = q as PdfQuestion;
  return Boolean(pq.needsVision) || pq.section === "math";
}

export function PdfList({
  pdf,
  onOpen,
  onQueue,
  onClose,
}: {
  pdf: PdfImport;
  onOpen: (question: QuestionRow) => void;
  onQueue: (items: QueueItem[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const good = pdf.parsed.filter((q) => q.ok);
  const bad = pdf.parsed.filter((q) => !q.ok);
  const mathCount = good.filter(needsVision).length;

  const save = async (items: ParsedPdfQuestion[]): Promise<QuestionRow[]> => {
    const payload = items.map((q) => {
      const pq = q as PdfQuestion;
      return {
        qb_id: q.qb_id,
        section: pq.section ?? "rw",
        format: q.format ?? "mcq",
        test: q.test,
        domain: q.domain,
        skill: q.skill,
        difficulty: q.difficulty,
        passage: q.passage,
        stem: q.stem,
        choices: q.choices,
        correct: q.correct,
        answers: q.answers ?? null,
        figure: q.figure ?? null,
        rationale: q.rationale,
      };
    });
    const rows: QuestionRow[] = [];
    for (let i = 0; i < payload.length; i += 40) {
      const data = await postJson<{ questions: QuestionRow[] }>("/api/questions", { questions: payload.slice(i, i + 40) });
      rows.push(...data.questions);
    }
    return rows;
  };

  /** Read a question from its rendered page(s) with the vision extractor. */
  const readWithVision = async (q: ParsedPdfQuestion, allPages: boolean): Promise<QuestionRow> => {
    const image = allPages ? await renderPdfPages(pdf.file, q.pages) : await renderPdfPage(pdf.file, q.pages[0] ?? 1);
    const data = await postJson<{ question: QuestionRow }>("/api/extract", { image, source: "pdf" });
    return data.question;
  };

  const run = async (key: string, task: () => Promise<void>) => {
    setLoading(key);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  const open = (q: ParsedPdfQuestion) =>
    run(q.qb_id ?? "", async () => {
      if (needsVision(q)) onOpen(await readWithVision(q, true));
      else onOpen((await save([q]))[0]);
    });

  const vision = (q: ParsedPdfQuestion) => run(q.qb_id ?? "", async () => onOpen(await readWithVision(q, needsVision(q))));

  const queue = () =>
    run("queue", async () => {
      const items = good.filter((_, i) => selected.has(i));
      if (!items.length) return;
      // Save the text-parsed (Reading and Writing) questions in one go; read Math ones lazily, when reached.
      const textItems = items.filter((q) => !needsVision(q));
      const saved = textItems.length ? await save(textItems) : [];
      const byItem = new Map(textItems.map((q, i) => [q, saved[i]]));
      onQueue(
        items.map((q) => {
          const row = byItem.get(q);
          return row
            ? { label: q.qb_id ?? "question", load: async () => row }
            : { label: q.qb_id ?? "question", load: () => readWithVision(q, true) };
        }),
      );
    });

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
      {mathCount ? (
        <p className="text-sm text-muted" data-testid="pdf-math-note">
          Math: equations do not survive the PDF text, so each Math question is read with vision when you open it (a few seconds each).
        </p>
      ) : null}
      <ErrorNote message={error} />
      <ol className="divide-y divide-line rounded-xl border border-line">
        {good.map((q, i) => (
          <li key={`${q.qb_id}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
            <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} aria-label="I missed this one" className="h-4 w-4" />
            <button type="button" onClick={() => open(q)} className="min-w-0 flex-1 truncate text-left hover:text-accent" disabled={loading !== null}>
              <span className="font-mono text-xs text-muted">{q.qb_id}</span> <span className="text-muted">{q.skill ?? q.domain ?? ""}</span> {mathToPlain(q.stem)}
            </button>
            {needsVision(q) ? <Chip tone="accent">Math</Chip> : null}
            {q.difficulty ? <Chip>{q.difficulty}</Chip> : null}
            {loading === q.qb_id ? <Spinner /> : null}
          </li>
        ))}
        {bad.map((q, i) => (
          <li key={`bad-${q.qb_id}-${i}`} className="flex items-center gap-3 bg-warn-soft/40 px-3 py-2 text-sm">
            <span className="h-4 w-4" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-mono text-xs text-muted">{q.qb_id}</span> {q.stem ? mathToPlain(q.stem) : "(no stem found)"} <span className="text-warn">({q.issues.join("; ")})</span>
            </span>
            <Button variant="secondary" onClick={() => vision(q)} disabled={loading !== null} className="px-2 py-1 text-xs">
              {loading === q.qb_id ? <Spinner /> : null} Read page{needsVision(q) && q.pages.length > 1 ? "s" : ""} {needsVision(q) ? q.pages.slice(0, 2).join(" and ") : (q.pages[0] ?? "?")} with vision
            </Button>
          </li>
        ))}
      </ol>
    </div>
  );
}
