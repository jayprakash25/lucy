import "server-only";

import {
  getConversationDraftBoundary,
  listConversationMedia,
  listConversationMediaByIds,
  listConversationMessages,
  listConversationMessagesByIds,
} from "@/db/conversation-queries";
import { createAdProposalVersion, getProposalBySourceEvent, getRevisionBase } from "@/db/proposal-queries";
import {
  AdDraftInputSchema,
  AdProposalContentSchema,
  assertSpendWithinLimits,
  createGroundedAdCopy,
  formatProposalPreview,
  type AdDraftInput,
  type AdProposalContent,
} from "@/domain/ad-proposal";
import { assertGroundedDraft } from "@/domain/draft-grounding";
import { createEventApprovalToken, hashApprovalToken } from "@/lib/approval-token";
import { config } from "@/lib/config";

export type ProposalBuildResult = {
  mediaAssetIds: string[];
  creativeMediaAssetId: string;
  proposalId: string;
  token: string;
  preview: string;
  version: number;
};

export async function buildAdProposal(input: {
  businessId: string;
  conversationId: string;
  sourceEventId: string;
  draft: AdDraftInput;
}): Promise<ProposalBuildResult> {
  const draft = AdDraftInputSchema.parse(input.draft);
  const token = await createEventApprovalToken(input.sourceEventId, config.approvalHmacSecret);
  const existing = await getProposalBySourceEvent(input.businessId, input.conversationId, input.sourceEventId);
  if (existing) {
    return {
      mediaAssetIds: existing.content.mediaAssetIds,
      creativeMediaAssetId: existing.content.creativeMediaAssetId,
      proposalId: existing.id,
      token,
      preview: formatProposalPreview(existing.content, existing.version),
      version: existing.version,
    };
  }
  const boundary = await getConversationDraftBoundary(input.conversationId, input.sourceEventId);
  const revisionBase = await getRevisionBase(input.conversationId);
  const [currentMedia, currentMessages, priorMedia, priorEvidence] = await Promise.all([
    listConversationMedia(input.conversationId, boundary),
    listConversationMessages(input.conversationId, boundary),
    listConversationMediaByIds(input.conversationId, revisionBase?.content.mediaAssetIds ?? []),
    listConversationMessagesByIds(
      input.conversationId,
      [...new Set(revisionBase?.content.evidence.map((item) => item.sourceId) ?? [])],
    ),
  ]);
  const media = [...new Map([...priorMedia, ...currentMedia].map((asset) => [asset.id, asset])).values()];
  const messages = [...new Map([...priorEvidence, ...currentMessages].map((message) => [message.id, message])).values()];
  const selectedMedia = media.filter((asset) => draft.mediaAssetIds.includes(asset.id));
  if (selectedMedia.length !== draft.mediaAssetIds.length) {
    throw new Error("Selected media must belong to this conversation.");
  }
  if (!selectedMedia.some((asset) => asset.mimeType.startsWith("image/"))) {
    throw new Error("At least one JPEG or PNG property photo is required. PDFs may support facts only.");
  }
  const creative = selectedMedia.find((asset) => asset.id === draft.creativeMediaAssetId);
  if (!creative || !creative.mimeType.startsWith("image/")) {
    throw new Error("The selected ad creative must be a JPEG or PNG property photo.");
  }
  assertGroundedDraft(draft, messages);

  const startAt = new Date(Date.now() + 2 * 60 * 60 * 1_000);
  const endAt = new Date(startAt.getTime() + config.defaultCampaignDays * 24 * 60 * 60 * 1_000);
  const content: AdProposalContent = AdProposalContentSchema.parse({
    property: draft.property,
    copy: createGroundedAdCopy(draft.property),
    evidence: draft.evidence,
    mediaAssetIds: draft.mediaAssetIds,
    creativeMediaAssetId: draft.creativeMediaAssetId,
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

  const contentHash = await sha256Hex(JSON.stringify(content));
  const proposal = await createAdProposalVersion({
    businessId: input.businessId,
    conversationId: input.conversationId,
    sourceEventId: input.sourceEventId,
    content,
    contentHash,
    approvalTokenHash: await hashApprovalToken(token, config.approvalHmacSecret),
    approvalExpiresAt: new Date(Date.now() + 90 * 60 * 1_000).toISOString(),
  });

  return {
    mediaAssetIds: proposal.content.mediaAssetIds,
    creativeMediaAssetId: proposal.content.creativeMediaAssetId,
    proposalId: proposal.id,
    token,
    preview: formatProposalPreview(proposal.content, proposal.version),
    version: proposal.version,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildAdProposalStep(input: Parameters<typeof buildAdProposal>[0]) {
  "use step";
  return buildAdProposal(input);
}
