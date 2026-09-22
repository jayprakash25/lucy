import "server-only";

import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";

import { getLatestProviderFailure } from "@/db/campaign-queries";

import { executeAuditedTool } from "../tool-execution";
import { readLucyToolContext } from "../tool-context";

async function explainLastFailureStep(_: Record<string, never>, options: ToolExecutionOptions) {
  "use step";
  const context = readLucyToolContext(options);
  return executeAuditedTool({
    context,
    name: "explain_last_failure",
    callId: options.toolCallId,
    inputSummary: {},
    run: () => getLatestProviderFailure(context.businessId, context.conversationId),
    summarize: (result) => ({ found: result !== null }),
  });
}

export const explainLastFailureTool = tool({
  description: "Read this chat's latest recorded Meta failure. Do not guess beyond this record.",
  inputSchema: z.object({}),
  execute: explainLastFailureStep,
});
