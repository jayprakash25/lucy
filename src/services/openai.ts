import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { GeneratedAdDraftSchema, type GeneratedAdDraft } from "@/domain/ad-proposal";
import { ConversationReplySchema, type ConversationReply } from "@/agent/conversation-reply";
import { config } from "@/lib/config";

export function createOpenAIClient() {
  return new OpenAI({ apiKey: config.openAiApiKey });
}

export async function parseAdDraft(input: {
  instructions: string;
  propertyNotes: string;
  mediaCount: number;
}): Promise<GeneratedAdDraft> {
  const client = createOpenAIClient();
  const response = await client.responses.parse({
    model: config.openAiModel,
    store: false,
    instructions: input.instructions,
    input: `Operator notes:\n${input.propertyNotes || "(none)"}\n\nSupplied property photos: ${input.mediaCount}`,
    text: { format: zodTextFormat(GeneratedAdDraftSchema, "property_ad_draft") },
  });

  if (!response.output_parsed) {
    throw new Error("The model returned no structured draft.");
  }

  return response.output_parsed;
}

export async function parseConversationReply(input: {
  instructions: string;
  transcript: string;
  mediaCount: number;
  latestMessageType: string;
}): Promise<ConversationReply> {
  const client = createOpenAIClient();
  const response = await client.responses.parse({
    model: config.openAiModel,
    store: false,
    instructions: input.instructions,
    input: [
      `Conversation:\n${input.transcript || "(new conversation)"}`,
      `Stored property media: ${input.mediaCount}`,
      `Latest message type: ${input.latestMessageType}`,
    ].join("\n\n"),
    text: { format: zodTextFormat(ConversationReplySchema, "whatsapp_conversation_reply") },
  });

  if (!response.output_parsed) {
    throw new Error("The model returned no WhatsApp reply.");
  }

  return response.output_parsed;
}
