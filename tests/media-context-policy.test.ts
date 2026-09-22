import assert from "node:assert/strict";
import test from "node:test";

import { shouldIncludeMedia } from "@/agent/media-context-policy";
import type { ConversationMessage } from "@/db/conversation-queries";

function message(overrides: Partial<ConversationMessage>): ConversationMessage {
  return {
    id: "message-id",
    direction: "inbound",
    messageType: "text",
    text: null,
    occurredAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

test("loads media only for media messages or ad work", () => {
  assert.equal(shouldIncludeMedia([message({ text: "Show campaign results" })]), true);
  assert.equal(shouldIncludeMedia([message({ messageType: "document" })]), true);
  assert.equal(shouldIncludeMedia([message({ text: "Why did it fail?" })]), false);
});

test("uses the latest inbound message instead of an outbound acknowledgement", () => {
  assert.equal(
    shouldIncludeMedia([
      message({ text: "Create the ad" }),
      message({ direction: "outbound", text: "Working on it." }),
    ]),
    true,
  );
});
