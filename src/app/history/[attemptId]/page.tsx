import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { ChatPanel } from "@/components/chat-panel";
import { DrillPanel } from "@/components/drill-panel";
import { QuestionCard } from "@/components/question-card";
import { RuleCardView } from "@/components/rule-card";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui";
import { getAttempt, listChatMessages } from "@/db/queries";
import { requireSession } from "@/lib/auth/session";
import { RuleCardSchema, type Pick } from "@/lib/ai/schemas";

export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId)) notFound();
  const session = await requireSession();
  const data = await getAttempt(session.userId, attemptId);
  if (!data) notFound();
  const { attempt, question } = data;
  const card = RuleCardSchema.safeParse(attempt.explanation);
  const chat = await listChatMessages(attempt.id);
  const initial: UIMessage[] = chat.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.content }] }));
  return (
    <Shell>
      <div className="mb-4 text-sm text-muted">
        Reviewed {attempt.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        {attempt.provider ? ` · ${attempt.provider} ${attempt.model ?? ""}` : ""}
      </div>
      <div className="space-y-5">
        <Card>
          <QuestionCard question={question} picked={attempt.picked as Pick} showAnswer />
          {attempt.reasoning ? <p className="mt-3 text-sm text-muted">Your thinking: {attempt.reasoning}</p> : null}
        </Card>
        {card.success ? (
          <Card>
            <RuleCardView card={card.data} picked={attempt.picked} />
            <div className="mt-5 border-t border-line pt-4">
              <DrillPanel attemptId={attempt.id} />
            </div>
          </Card>
        ) : null}
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Ask about this question</h2>
          <ChatPanel attemptId={attempt.id} initialMessages={initial} />
        </Card>
      </div>
    </Shell>
  );
}
