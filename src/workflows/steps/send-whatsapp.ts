import "server-only";

import { recordOutboundMessage } from "@/db/conversation-queries";
import { approvalButtonId } from "@/lib/approval-token";
import { executeProviderMutation } from "@/services/provider-operation";
import { sendWhatsAppApproval, sendWhatsAppText } from "@/services/whatsapp";

type SendContext = {
  businessId: string;
  conversationId: string;
  recipient: string;
  operationKey: string;
  proposalId: string | null;
};

export async function sendWhatsAppTextStep(input: SendContext & { text: string }): Promise<void> {
  "use step";

  const messageId = await executeProviderMutation({
    businessId: input.businessId,
    proposalId: input.proposalId,
    provider: "whatsapp",
    operationKey: input.operationKey,
    operationType: "send_text",
    requestSummary: { recipient: input.recipient, textLength: input.text.length },
    mutate: async () => ({
      remoteId: await sendWhatsAppText(input.recipient, input.text, input.operationKey),
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

export async function sendWhatsAppApprovalStep(
  input: SendContext & { text: string; token: string },
): Promise<void> {
  "use step";

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
        operationKey: input.operationKey,
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
