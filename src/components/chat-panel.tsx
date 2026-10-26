"use client";

import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Button, Spinner } from "./ui";

export function ChatPanel({ attemptId, initialMessages = [] }: { attemptId: string; initialMessages?: UIMessage[] }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { attemptId },
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (response.status === 401) window.location.assign(new URL("/signin", window.location.origin).href);
          return response;
        },
      }),
    [attemptId],
  );
  const { messages, sendMessage, status, error } = useChat({ id: `attempt-${attemptId}`, transport, messages: initialMessages });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  };

  return (
    <div className="space-y-3" data-testid="chat-panel">
      {messages.length ? (
        <ol className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className={`rounded-xl px-3 py-2 text-[15px] leading-relaxed ${m.role === "user" ? "ml-8 bg-accent-soft" : "mr-8 bg-bg"}`}>
              <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted">{m.role === "user" ? "you" : "tutor"}</span>
              {m.parts.map((part, i) => (part.type === "text" ? <span key={i} className="whitespace-pre-wrap">{part.text}</span> : null))}
            </li>
          ))}
        </ol>
      ) : null}
      {error ? <p className="text-sm text-danger">{error.message}</p> : null}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this question"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
          data-testid="chat-input"
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          {busy ? <Spinner /> : "Send"}
        </Button>
      </form>
    </div>
  );
}
