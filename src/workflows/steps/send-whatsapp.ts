import "server-only";

import { listConversationMediaByIds, recordOutboundMessage } from "@/db/conversation-queries";
import { approvalButtonId } from "@/lib/approval-token";
import { executeProviderMutation } from "@/services/provider-operation";
import { sendWhatsAppApproval, sendWhatsAppMediaReference, sendWhatsAppText } from "@/services/whatsapp";

type SendContext = {
  businessId: string;
  conversationId: string;
  recipient: string;
  operationKey: string;
  proposalId: string | null;
};

export async function sendWhatsAppTextStep(input: SendContext & { text: string }): Promise<void> {
  "use step";

  return sendWhatsAppTextMessage(input);
}

async function sendWhatsAppTextMessage(input: SendContext & { text: string }): Promise<void> {
  const messageId = await executeProviderMutation({
    businessId: input.businessId,
    proposalId: input.proposalId,
    provider: "whatsapp",
    operationKey: input.operationKey,
    operationType: "send_text",
    requestSummary: { recipient: input.recipient, textLength: input.text.length },
    mutate: async () => ({
      remoteId: await sendWhatsAppText(input.recipient, input.text),
    }),
  });
  await recordOutboundMessage({
    businessId: input.businessId,
    conversationId: input.conversationId,
    externalContactId: input.recipient,
    externalMessageId: messageId,
    messageType: "text",
    text: input.text,
  });
}

sendWhatsAppTextStep.maxRetries = 0;

export async function sendWhatsAppTextBestEffortStep(input: SendContext & { text: string }): Promise<boolean> {
  "use step";
  try {
    await sendWhatsAppTextMessage(input);
    return true;
  } catch {
    return false;
  }
}

sendWhatsAppTextBestEffortStep.maxRetries = 0;

export async function sendWhatsAppApprovalStep(
  input: SendContext & { text: string; token: string },
): Promise<void> {
  "use step";

  return sendWhatsAppApprovalMessage(input);
}

export async function sendWhatsAppApprovalMessage(
  input: SendContext & { text: string; token: string },
): Promise<void> {
  const messageId = await executeProviderMutation({
    businessId: input.businessId,
    proposalId: input.proposalId,
    provider: "whatsapp",
    operationKey: input.operationKey,
    operationType: "send_approval",
    requestSummary: { recipient: input.recipient, textLength: input.text.length },
    mutate: async () => ({
      remoteId: await sendWhatsAppApproval({
        to: input.recipient,
        text: input.text,
        approveButtonId: approvalButtonId("approve", input.token),
        changeButtonId: approvalButtonId("change", input.token),
        cancelButtonId: approvalButtonId("cancel", input.token),
      }),
    }),
  });
  await recordOutboundMessage({
    businessId: input.businessId,
    conversationId: input.conversationId,
    externalContactId: input.recipient,
    externalMessageId: messageId,
    messageType: "interactive",
    text: input.text,
  });
}

sendWhatsAppApprovalStep.maxRetries = 0;

export async function sendWhatsAppMediaPreviewMessage(input: SendContext & {
  providerMediaId: string;
  mimeType: string;
  caption: string;
}): Promise<void> {
  const messageId = await executeProviderMutation({
    businessId: input.businessId,
    proposalId: input.proposalId,
    provider: "whatsapp",
    operationKey: input.operationKey,
    operationType: "send_media",
    requestSummary: { recipient: input.recipient, mimeType: input.mimeType },
    mutate: async () => ({
      remoteId: await sendWhatsAppMediaReference({
        to: input.recipient,
        providerMediaId: input.providerMediaId,
        mimeType: input.mimeType,
        caption: input.caption,
      }),
    }),
  });
  await recordOutboundMessage({
    businessId: input.businessId,
    conversationId: input.conversationId,
    externalContactId: input.recipient,
    externalMessageId: messageId,
    messageType: input.mimeType === "application/pdf" ? "document" : "image",
    text: input.caption,
  });
}

export async function sendWhatsAppProposalMediaPreviews(input: SendContext & {
  mediaAssetIds: string[];
  creativeMediaAssetId: string;
}): Promise<void> {
  const selectedMedia = await listConversationMediaByIds(input.conversationId, input.mediaAssetIds);
  if (selectedMedia.length !== input.mediaAssetIds.length) throw new Error("Proposal media could not be loaded.");
  for (const [index, asset] of selectedMedia.entries()) {
    await sendWhatsAppMediaPreviewMessage({
      ...input,
      operationKey: `proposal:${input.proposalId}:media-preview:${asset.id}`,
      providerMediaId: asset.providerMediaId,
      mimeType: asset.mimeType,
      caption: asset.id === input.creativeMediaAssetId
        ? `Ad creative — proposal media ${index + 1} of ${selectedMedia.length}`
        : `Supporting media ${index + 1} of ${selectedMedia.length}`,
    });
  }
}

export async function sendWhatsAppProposalMediaPreviewsStep(
  input: Parameters<typeof sendWhatsAppProposalMediaPreviews>[0],
): Promise<void> {
  "use step";
  return sendWhatsAppProposalMediaPreviews(input);
}

sendWhatsAppProposalMediaPreviewsStep.maxRetries = 0;
