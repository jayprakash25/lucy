import "server-only";

import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";

import { getStoredCampaign } from "@/db/campaign-queries";
import { markProposalPaused } from "@/db/proposal-queries";
import { pauseMetaCampaign } from "@/services/meta-campaigns";
import { executeProviderMutation } from "@/services/provider-operation";

import { executeAuditedTool } from "../tool-execution";
import { readLucyToolContext } from "../tool-context";

async function pauseCampaignStep(input: { proposalId: string }, options: ToolExecutionOptions) {
  "use step";
  const context = readLucyToolContext(options);
  if (!/^\s*(pause|stop)\b/i.test(context.currentText ?? "")) {
    throw new Error("Ask the operator to explicitly say pause or stop in the current message.");
  }
  return executeAuditedTool({
    context,
    name: "pause_campaign",
    callId: options.toolCallId,
    inputSummary: input,
    run: async () => {
      const campaign = await getStoredCampaign(context.businessId, input.proposalId);
      if (!campaign.metaCampaignId) throw new Error("This proposal has not been submitted to Meta.");
      await executeProviderMutation({
        businessId: context.businessId,
        proposalId: input.proposalId,
        provider: "meta",
        operationKey: `proposal:${input.proposalId}:pause-campaign:${context.sourceEventId}`,
        operationType: "pause-campaign",
        requestSummary: { proposalId: input.proposalId, sourceEventId: context.sourceEventId },
        mutate: async () => ({ remoteId: await pauseMetaCampaign(campaign.metaCampaignId!) }),
      });
      await markProposalPaused(input.proposalId);
      return { proposalId: input.proposalId, projectName: campaign.projectName, status: "PAUSED" as const };
    },
    summarize: (result) => ({ proposalId: result.proposalId, status: result.status }),
  });
}

export const pauseCampaignTool = tool({
  description: "Pause a campaign selected from list_campaigns, only when the current operator message explicitly says pause or stop.",
  inputSchema: z.object({ proposalId: z.string().uuid() }),
  execute: pauseCampaignStep,
});
