import "server-only";

import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";

import { listRecentCampaigns } from "@/db/campaign-queries";

import { executeAuditedTool } from "../tool-execution";
import { readLucyToolContext } from "../tool-context";

async function listCampaignsStep(_: Record<string, never>, options: ToolExecutionOptions) {
  "use step";
  const context = readLucyToolContext(options);
  return executeAuditedTool({
    context,
    name: "list_campaigns",
    callId: options.toolCallId,
    inputSummary: {},
    run: () => listRecentCampaigns(context.businessId),
    summarize: (result) => ({ count: result.length }),
  });
}

export const listCampaignsTool = tool({
  description: "List the ten most recent campaigns so the user can identify one by project and status.",
  inputSchema: z.object({}),
  execute: listCampaignsStep,
});
