import assert from "node:assert/strict";
import test from "node:test";

import { buildConversationTranscript, ConversationReplySchema } from "@/agent/conversation-reply";

test("builds a role-labelled transcript including media messages", () => {
  const transcript = buildConversationTranscript([
    { id: "1", direction: "inbound", messageType: "text", text: "Hi Lucy", occurredAt: "2026-01-01" },
    { id: "2", direction: "outbound", messageType: "text", text: "How can I help?", occurredAt: "2026-01-01" },
    { id: "3", direction: "inbound", messageType: "image", text: null, occurredAt: "2026-01-01" },
  ]);

  assert.equal(transcript, "Customer: Hi Lucy\nLucy: How can I help?\nCustomer: [image]");
});

test("rejects an empty or oversized generated WhatsApp reply", () => {
  assert.equal(
    ConversationReplySchema.safeParse({
      intent: "greeting",
      reply: "Hello!",
      nextField: null,
      readyForDraft: false,
    }).success,
    true,
  );
  assert.equal(
    ConversationReplySchema.safeParse({
      intent: "greeting",
      reply: "",
      nextField: null,
      readyForDraft: false,
    }).success,
    false,
  );
});
