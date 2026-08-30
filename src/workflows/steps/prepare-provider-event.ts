import "server-only";

import {
  recordInboundMessage,
  updateOutboundMessageStatus,
} from "@/db/conversation-queries";
import { claimWebhookEvent } from "@/db/webhook-queries";
import { parseApprovalCommand } from "@/lib/approval-token";
import { StoredWhatsAppPayloadSchema } from "@/services/whatsapp-webhook";

export type PreparedEvent =
  | { kind: "duplicate" | "meta" | "status" }
  | {
      kind: "acknowledge";
      businessId: string;
      conversationId: string;
      recipient: string;
      sourceEventId: string;
    }
  | {
      kind: "draft";
      businessId: string;
      conversationId: string;
      recipient: string;
      sourceEventId: string;
    }
  | {
      kind: "image";
      businessId: string;
      conversationId: string;
      messageId: string;
      providerMediaId: string;
      recipient: string;
      sourceEventId: string;
      mimeType: string;
      sha256: string | null;
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

export async function prepareProviderEvent(eventId: string): Promise<PreparedEvent> {
  "use step";

  const event = await claimWebhookEvent(eventId);
  if (!event) {
    return { kind: "duplicate" };
  }

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

  const text = message.text?.body ?? message.image?.caption ?? message.interactive?.button_reply?.title ?? null;
  const storedMessage = await recordInboundMessage({
    businessId: event.businessId,
    externalContactId: message.from,
    externalMessageId: message.id,
    messageType: message.type,
    occurredAt: event.occurredAt,
    payload: event.payload,
    text,
  });

  if (message.type === "image" && message.image) {
    return {
      kind: "image",
      businessId: event.businessId,
      conversationId: storedMessage.conversationId,
      messageId: storedMessage.id,
      providerMediaId: message.image.id,
      recipient: message.from,
      sourceEventId: event.id,
      mimeType: message.image.mime_type,
      sha256: message.image.sha256 ?? null,
    };
  }

  const buttonId = message.interactive?.button_reply?.id;
  if (buttonId) {
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

  if (isDraftRequest(message.text?.body ?? "")) {
    return {
      kind: "draft",
      businessId: event.businessId,
      conversationId: storedMessage.conversationId,
      recipient: message.from,
      sourceEventId: event.id,
    };
  }

  return {
    kind: "acknowledge",
    businessId: event.businessId,
    conversationId: storedMessage.conversationId,
    recipient: message.from,
    sourceEventId: event.id,
  };
}

export function isDraftRequest(text: string): boolean {
  return ["done", "done uploading", "create ad", "generate ad"].includes(text.trim().toLowerCase());
}
