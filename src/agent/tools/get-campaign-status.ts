import "server-only";

import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";

import { getStoredCampaign } from "@/db/campaign-queries";
import { getMetaCampaignStatus } from "@/services/meta-campaigns";

import { executeAuditedTool } from "../tool-execution";
import { readLucyToolContext } from "../tool-context";

async function getCampaignStatusStep(input: { proposalId: string }, options: ToolExecutionOptions) {
  "use step";
  const context = readLucyToolContext(options);
  return executeAuditedTool({
    context,
    name: "get_campaign_status",
    callId: options.toolCallId,
    inputSummary: input,
    run: async () => {
      const campaign = await getStoredCampaign(context.businessId, input.proposalId);
      if (!campaign.metaCampaignId) throw new Error("This proposal has not been submitted to Meta.");
      return { projectName: campaign.projectName, ...(await getMetaCampaignStatus(campaign.metaCampaignId)) };
    },
    summarize: (result) => ({ status: result.effectiveStatus }),
  });
}

export const getCampaignStatusTool = tool({
  description: "Get verified Meta status for a campaign selected from list_campaigns.",
  inputSchema: z.object({ proposalId: z.string().uuid() }),
  execute: getCampaignStatusStep,
});
