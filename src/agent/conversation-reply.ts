import { z } from "zod";

import type { ConversationHistoryMessage } from "@/db/conversation-queries";

export const PROPERTY_INTAKE_FIELDS = [
  "property name",
  "property type",
  "location",
  "dimensions or total area",
  "pricing",
  "configuration",
  "features",
  "amenities",
  "key highlights or USP",
  "property photos",
  "property videos",
  "brand logo",
  "brand colors or visual style",
  "contact information",
] as const;

export const ConversationReplySchema = z.object({
  intent: z.enum(["greeting", "property_intake", "history", "campaign_status", "help", "unclear"]),
  reply: z.string().min(1).max(1_000),
  nextField: z.enum(PROPERTY_INTAKE_FIELDS).nullable(),
  readyForDraft: z.boolean(),
});

export type ConversationReply = z.infer<typeof ConversationReplySchema>;

export function buildConversationTranscript(messages: ConversationHistoryMessage[]): string {
  return messages
    .map((message) => {
      const speaker = message.direction === "inbound" ? "Customer" : "Lucy";
      const content = message.text?.trim() || `[${message.messageType}]`;
      return `${speaker}: ${content}`;
    })
    .join("\n");
}
