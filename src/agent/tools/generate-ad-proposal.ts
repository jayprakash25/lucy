import "server-only";

import { tool, type ToolExecutionOptions } from "ai";

import { AdDraftInputSchema, type AdDraftInput } from "@/domain/ad-proposal";
import { buildAdProposal } from "@/workflows/steps/build-ad-proposal";
import {
  sendWhatsAppApprovalMessage,
  sendWhatsAppProposalMediaPreviews,
} from "@/workflows/steps/send-whatsapp";

import { executeAuditedTool } from "../tool-execution";
import { readLucyToolContext } from "../tool-context";

async function generateAdProposalStep(draft: AdDraftInput, options: ToolExecutionOptions) {
  "use step";
  const context = readLucyToolContext(options);
  return executeAuditedTool({
    context,
    name: "generate_ad_proposal",
    callId: options.toolCallId,
    inputSummary: { projectName: draft.property.projectName, mediaAssetIds: draft.mediaAssetIds },
    run: async () => {
      const proposal = await buildAdProposal({ ...context, draft });
      await sendWhatsAppProposalMediaPreviews({
        ...context,
        proposalId: proposal.proposalId,
        operationKey: `proposal:${proposal.proposalId}:media-previews`,
        mediaAssetIds: proposal.mediaAssetIds,
        creativeMediaAssetId: proposal.creativeMediaAssetId,
      });
      await sendWhatsAppApprovalMessage({
        ...context,
        proposalId: proposal.proposalId,
        operationKey: `proposal:${proposal.proposalId}:approval-preview`,
        text: proposal.preview,
        token: proposal.token,
      });
      return { proposalId: proposal.proposalId, version: proposal.version, approvalSent: true };
    },
    summarize: (result) => result,
  });
}

export const generateAdProposalTool = tool({
  description: "Create one immutable ad proposal and send its approval buttons. Call only when all required facts and selected media are ready.",
  inputSchema: AdDraftInputSchema,
  execute: generateAdProposalStep,
});
