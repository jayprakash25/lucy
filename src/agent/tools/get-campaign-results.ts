import "server-only";

import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";

import { getStoredCampaign } from "@/db/campaign-queries";
import { getMetaCampaignResults } from "@/services/meta-campaigns";

import { executeAuditedTool } from "../tool-execution";
import { readLucyToolContext } from "../tool-context";

async function getCampaignResultsStep(
  input: { proposalId: string; window: "last_7d" | "last_30d" | "lifetime" },
  options: ToolExecutionOptions,
) {
  "use step";
  const context = readLucyToolContext(options);
  return executeAuditedTool({
    context,
    name: "get_campaign_results",
    callId: options.toolCallId,
    inputSummary: input,
    run: async () => {
      const campaign = await getStoredCampaign(context.businessId, input.proposalId);
      if (!campaign.metaCampaignId) throw new Error("This proposal has not been submitted to Meta.");
      return {
        projectName: campaign.projectName,
        window: input.window,
        ...(await getMetaCampaignResults(campaign.metaCampaignId, input.window)),
      };
    },
    summarize: (result) => ({ window: result.window }),
  });
}

export const getCampaignResultsTool = tool({
  description: "Get verified Meta delivery results for a campaign selected from list_campaigns.",
  inputSchema: z.object({
    proposalId: z.string().uuid(),
    window: z.enum(["last_7d", "last_30d", "lifetime"]).default("last_7d"),
  }),
  execute: getCampaignResultsStep,
});
