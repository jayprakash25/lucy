import "server-only";

import { recordProposalDecision } from "@/db/proposal-queries";
import { hashApprovalToken } from "@/lib/approval-token";
import { config } from "@/lib/config";

export async function recordProposalDecisionStep(input: {
  action: "approve" | "cancel" | "change";
  approvalToken: string;
  businessId: string;
  approverExternalId: string;
  sourceMessageId: string;
}): Promise<{ proposalId: string; status: string }> {
  "use step";

  const proposal = await recordProposalDecision({
    businessId: input.businessId,
    tokenHash: hashApprovalToken(input.approvalToken, config.approvalHmacSecret),
    action: input.action,
    approverExternalId: input.approverExternalId,
    sourceExternalMessageId: input.sourceMessageId,
  });

  return { proposalId: proposal.id, status: proposal.status };
}
