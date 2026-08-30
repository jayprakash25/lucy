import "server-only";

import { createHash } from "node:crypto";

import { listConversationMedia, listConversationMessages } from "@/db/conversation-queries";
import { createAdProposalVersion } from "@/db/proposal-queries";
import {
  AdProposalContentSchema,
  assertSpendWithinLimits,
  formatProposalPreview,
  type AdProposalContent,
} from "@/domain/ad-proposal";
import { generateAdDraft } from "@/agent/generate-ad-draft";
import { createApprovalToken, hashApprovalToken } from "@/lib/approval-token";
import { config } from "@/lib/config";

export type ProposalBuildResult =
  | { kind: "missing"; message: string }
  | { kind: "proposal"; proposalId: string; token: string; preview: string; version: number };

export async function buildAdProposal(input: {
  businessId: string;
  conversationId: string;
}): Promise<ProposalBuildResult> {
  "use step";

  const [messages, media] = await Promise.all([
    listConversationMessages(input.conversationId),
    listConversationMedia(input.conversationId),
  ]);
  const draft = await generateAdDraft({ messages, mediaCount: media.length });

  if (draft.missingFields.length > 0 || !draft.property || !draft.copy) {
    return {
      kind: "missing",
      message: `I still need: ${draft.missingFields.join(", ")}. Send those details, then reply DONE.`,
    };
  }

  const startAt = new Date(Date.now() + 2 * 60 * 60 * 1_000);
  const endAt = new Date(startAt.getTime() + config.defaultCampaignDays * 24 * 60 * 60 * 1_000);
  const content: AdProposalContent = AdProposalContentSchema.parse({
    property: draft.property,
    copy: draft.copy,
    evidence: draft.evidence,
    mediaAssetIds: media.map((asset) => asset.id),
    campaign: {
      countryCode: config.defaultCountryCode,
      currency: config.defaultCurrency,
      timeZone: config.defaultTimeZone,
      dailyBudgetMinor: config.defaultDailyBudgetMinor,
      durationDays: config.defaultCampaignDays,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      destination: "WHATSAPP",
      objective: "OUTCOME_ENGAGEMENT",
    },
  });
  assertSpendWithinLimits(content.campaign, config.maximumDailyBudgetMinor, config.maximumTotalBudgetMinor);

  const contentHash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  const token = createApprovalToken();
  const proposal = await createAdProposalVersion({
    businessId: input.businessId,
    conversationId: input.conversationId,
    content,
    contentHash,
    approvalTokenHash: hashApprovalToken(token, config.approvalHmacSecret),
    approvalExpiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
  });

  return {
    kind: "proposal",
    proposalId: proposal.id,
    token,
    preview: formatProposalPreview(content, proposal.version),
    version: proposal.version,
  };
}
