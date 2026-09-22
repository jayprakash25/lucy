import "server-only";

import {
  recordInboundMessage,
  updateOutboundMessageStatus,
} from "@/db/conversation-queries";
import { claimWebhookEvent } from "@/db/webhook-queries";
import { parseApprovalCommand } from "@/lib/approval-token";
import { StoredWhatsAppPayloadSchema } from "@/services/whatsapp-webhook";

export type PreparedEvent =
  | { kind: "deferred" | "duplicate" | "meta" | "status" }
  | {
      kind: "agent";
      businessId: string;
      conversationId: string;
      recipient: string;
      sourceEventId: string;
      currentText: string | null;
    }
  | {
      kind: "media";
      businessId: string;
      conversationId: string;
      messageId: string;
      providerMediaId: string;
      recipient: string;
      sourceEventId: string;
      mimeType: string;
      sha256: string | null;
      currentText: string | null;
    }
  | {
      kind: "proposal-decision";
      action: "approve" | "cancel" | "change";
      approvalToken: string;
      businessId: string;
      conversationId: string;
      recipient: string;
      sourceEventId: string;
      sourceMessageId: string;
    };

export async function prepareProviderEvent(eventId: string, processingToken: string): Promise<PreparedEvent> {
  "use step";

  const claim = await claimWebhookEvent(eventId, processingToken);
  if (claim.kind !== "claimed") {
    return { kind: claim.kind };
  }
  const event = claim.event;

  if (event.provider === "meta") {
    return { kind: "meta" };
  }

  const payload = StoredWhatsAppPayloadSchema.parse(event.payload);
  if (payload.status) {
    await updateOutboundMessageStatus(payload.status.id, payload.status.status);
    return { kind: "status" };
  }

  const message = payload.message;
  if (!message) {
    return { kind: "status" };
  }

  const text =
    message.type === "text"
      ? message.text.body
      : message.type === "image"
        ? (message.image.caption ?? null)
        : message.type === "document"
          ? (message.document.caption ?? null)
          : message.interactive.button_reply.title;
  const storedMessage = await recordInboundMessage({
    businessId: event.businessId,
    externalContactId: message.from,
    externalMessageId: message.id,
    messageType: message.type,
    occurredAt: event.occurredAt,
    payload: event.payload,
    text,
  });

  if (message.type === "image" || message.type === "document") {
    const media = message.type === "image" ? message.image : message.document;
    return {
      kind: "media",
      businessId: event.businessId,
      conversationId: storedMessage.conversationId,
      messageId: storedMessage.id,
      providerMediaId: media.id,
      recipient: message.from,
      sourceEventId: event.id,
      mimeType: media.mime_type,
      sha256: media.sha256 ?? null,
      currentText: text,
    };
  }

  if (message.type === "interactive") {
    const buttonId = message.interactive.button_reply.id;
    const command = parseApprovalCommand(buttonId);
    if (command.action !== "unknown") {
      return {
        kind: "proposal-decision",
        action: command.action,
        approvalToken: command.token,
        businessId: event.businessId,
        conversationId: storedMessage.conversationId,
        recipient: message.from,
        sourceEventId: event.id,
        sourceMessageId: message.id,
      };
    }
  }

  return {
    kind: "agent",
    businessId: event.businessId,
    conversationId: storedMessage.conversationId,
    recipient: message.from,
    sourceEventId: event.id,
    currentText: text,
  };
}
