import assert from "node:assert/strict";
import test from "node:test";

import { extractMetaEvents } from "@/services/meta-webhook";

test("derives a stable deduplication ID for Meta status changes", () => {
  const body = JSON.stringify({
    object: "ad_account",
    entry: [{ id: "act-1", time: 1788020000, changes: [{ field: "ad", value: { id: "ad-1", status: "PENDING_REVIEW" } }] }],
  });

  const first = extractMetaEvents(body)[0];
  const second = extractMetaEvents(body)[0];

  assert.ok(first);
  assert.equal(first.externalEventId, second?.externalEventId);
  assert.equal(first.channelExternalId, "act-1");
  assert.equal(first.eventType, "ad.ad");
});
