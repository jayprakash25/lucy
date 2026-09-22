import "server-only";

import { recordAgentToolAuditEvent } from "@/db/audit-queries";

import type { LucyToolContext } from "./tool-context";

export async function executeAuditedTool<T>(input: {
  context: LucyToolContext;
  name: string;
  callId: string;
  run: () => Promise<T>;
  inputSummary: Record<string, unknown>;
  summarize: (result: T) => Record<string, unknown>;
}): Promise<T> {
  await record(input.context, input.name, input.callId, "agent.tool.started", { input: input.inputSummary });
  let result: T;
  try {
    result = await input.run();
  } catch (error) {
    await record(input.context, input.name, input.callId, "agent.tool.failed", {
      error: sanitizeError(error),
    });
    throw error;
  }
  await record(input.context, input.name, input.callId, "agent.tool.completed", { result: input.summarize(result) });
  return result;
}

async function record(
  context: LucyToolContext,
  toolName: string,
  callId: string,
  eventType: "agent.tool.started" | "agent.tool.completed" | "agent.tool.failed",
  metadata: Record<string, unknown>,
): Promise<void> {
  await recordAgentToolAuditEvent({
    businessId: context.businessId,
    eventType,
    toolName,
    subjectId: context.conversationId,
    actorExternalId: context.recipient,
    sourceEventId: context.sourceEventId,
    dedupeKey: `${context.sourceEventId}:${callId}:${eventType}`,
    metadata,
  });
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown tool failure";
  return message.replace(/(token|secret|key|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]").slice(0, 500);
}
