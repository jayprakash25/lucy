import { buildConversationTranscript, PROPERTY_INTAKE_FIELDS } from "@/agent/conversation-reply";
import { AGENT_INSTRUCTIONS } from "@/agent/prompt";
import { listConversationHistory, listConversationMedia } from "@/db/conversation-queries";
import { parseConversationReply } from "@/services/openai";

export async function generateConversationReplyStep(input: {
  conversationId: string;
  latestMessageType: string;
}): Promise<string> {
  "use step";

  const [messages, media] = await Promise.all([
    listConversationHistory(input.conversationId),
    listConversationMedia(input.conversationId),
  ]);

  const result = await parseConversationReply({
    instructions: [
      AGENT_INSTRUCTIONS,
      "You are having a concise, friendly WhatsApp conversation with a real-estate operator.",
      "Write a fresh response grounded in the conversation; do not reuse a canned acknowledgement.",
      "If the customer greets you, greet them naturally and ask whether they want to create a property ad, review past work, or check campaign status.",
      "If property media was just received, acknowledge what was actually received and begin or continue property intake.",
      "During property intake, extract facts already supplied and ask exactly one question for the next missing field.",
      `Required property-profile fields, in preferred order: ${PROPERTY_INTAKE_FIELDS.join(", ")}.`,
      "Never invent a property fact, campaign result, prior record, or completed external action.",
      "Do not generate an ad or claim the profile is complete while any required field is missing.",
      "Keep the reply under 700 characters and easy to answer from a phone.",
    ].join("\n"),
    transcript: buildConversationTranscript(messages),
    mediaCount: media.length,
    latestMessageType: input.latestMessageType,
  });

  return result.reply;
}

generateConversationReplyStep.maxRetries = 1;
