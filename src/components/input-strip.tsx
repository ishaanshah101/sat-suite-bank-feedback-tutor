"use client";

import { useRef, useState } from "react";
import type { QuestionRow } from "@/db/schema";
import type { ParsedPdfQuestion } from "@/lib/questions/pdf-parse";
import { postJson } from "@/lib/client/api";
import { useCapture } from "@/lib/client/capture";
import { fileToDataUrl } from "@/lib/client/image";
import { parsePdfFile } from "@/lib/client/pdf";
import { Button, ErrorNote, Spinner } from "./ui";

type Mode = "capture" | "pdf" | "paste" | "image";

export interface PdfImport {
  file: File;
  parsed: ParsedPdfQuestion[];
  warnings: string[];
  totalPages: number;
}

export function InputStrip({
  onQuestion,
  onPdf,
  busy,
  setBusy,
}: {
  onQuestion: (question: QuestionRow) => void;
  onPdf: (pdf: PdfImport) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const capture = useCapture();
  const [mode, setMode] = useState<Mode>(() => "capture");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const pdfInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setStatus(label);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const extractImage = async (image: string, source: "capture" | "image" | "pdf") => {
    const data = await postJson<{ question: QuestionRow }>("/api/extract", { image, source });
    onQuestion(data.question);
  };

  const onCaptureClick = () =>
    run(capture.state === "live" ? "Reading the tab..." : "Pick the Question Bank tab...", async () => {
      if (capture.state !== "live") {
        await capture.connect();
        setStatus("Reading the tab...");
      }
      const image = await capture.grab();
      await extractImage(image, "capture");
    });

  const onPdfFile = (file: File | undefined) => {
    if (!file) return;
    void run("Parsing PDF in your browser...", async () => {
      const { result, totalPages } = await parsePdfFile(file);
      onPdf({ file, parsed: result.questions, warnings: result.warnings, totalPages });
    });
  };

  const onImageFile = (file: File | undefined) => {
    if (!file) return;
    void run("Reading the image...", async () => {
      const image = await fileToDataUrl(file);
      await extractImage(image, "image");
    });
  };

  const onPaste = () =>
    run("Reading the text...", async () => {
      const data = await postJson<{ question: QuestionRow }>("/api/extract", { text: pasted, source: "paste" });
      setPasted("");
      onQuestion(data.question);
    });

  const tabs: Array<{ id: Mode; label: string }> = [
    { id: "capture", label: "Capture tab" },
    { id: "pdf", label: "Upload PDF" },
    { id: "paste", label: "Paste text" },
    { id: "image", label: "Upload image" },
  ];

  return (
    <div className="space-y-3" data-testid="input-strip">
      <div className="flex flex-wrap gap-1 rounded-xl bg-bg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mode === t.id ? "bg-surface shadow-sm" : "text-muted hover:text-ink"}`}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "capture" ? (
        <div className="space-y-2">
          {capture.state === "unsupported" ? (
            <p className="text-sm text-muted">Tab capture needs desktop Chrome or Edge. Use Upload PDF, Paste text or Upload image here.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onCaptureClick} disabled={busy} data-testid="capture-button">
                {busy && status ? <Spinner /> : null}
                {capture.state === "live" ? "Capture again" : capture.state === "ended" ? "Reconnect" : "Capture tab"}
              </Button>
              {capture.state === "live" ? (
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="inline-block h-2 w-2 rounded-full bg-good" /> sharing a tab
                  <button type="button" onClick={capture.stop} className="underline underline-offset-2 hover:text-ink">
                    Stop
                  </button>
                </span>
              ) : (
                <span className="text-xs text-muted">
                  First time: in the picker choose the Chrome Tab list, pick the tab named SAT Suite Question Bank, check the preview, click Share. Nothing is recorded; one picture is taken each time you press Capture.
                </span>
              )}
            </div>
          )}
        </div>
      ) : null}

      {mode === "pdf" ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="pdf-panel">
          <input ref={pdfInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => onPdfFile(e.target.files?.[0])} data-testid="pdf-input" />
          <Button onClick={() => pdfInput.current?.click()} disabled={busy}>
            {busy && status ? <Spinner /> : null} Choose PDF export
          </Button>
          <span className="text-xs text-muted">Export from the Question Bank with correct answers and explanations. Parsed in your browser, nothing uploaded until you pick a question.</span>
        </div>
      ) : null}

      {mode === "paste" ? (
        <div className="space-y-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            placeholder="Paste the passage, the question and the four choices (and the correct answer if you have it)."
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
            data-testid="paste-textarea"
          />
          <Button onClick={onPaste} disabled={busy || pasted.trim().length < 20} data-testid="paste-submit">
            {busy && status ? <Spinner /> : null} Read question
          </Button>
        </div>
      ) : null}

      {mode === "image" ? (
        <div className="flex flex-wrap items-center gap-3">
          <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onImageFile(e.target.files?.[0])} data-testid="image-input" />
          <Button onClick={() => imageInput.current?.click()} disabled={busy}>
            {busy && status ? <Spinner /> : null} Choose screenshot
          </Button>
          <span className="text-xs text-muted">PNG, JPEG or WebP of one question.</span>
        </div>
      ) : null}

      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <ErrorNote message={error} />
    </div>
  );
}
