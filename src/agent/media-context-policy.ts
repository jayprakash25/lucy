import type { ConversationMessage } from "@/db/conversation-queries";

const MEDIA_INTENT = /\b(ad|campaign|creative|create|draft|generate|revise|change|done)\b/i;

export function shouldIncludeMedia(messages: ConversationMessage[]): boolean {
  const latestInbound = messages.findLast((message) => message.direction === "inbound");
  return Boolean(
    latestInbound &&
      (latestInbound.messageType === "image" ||
        latestInbound.messageType === "document" ||
        MEDIA_INTENT.test(latestInbound.text ?? "")),
  );
}
