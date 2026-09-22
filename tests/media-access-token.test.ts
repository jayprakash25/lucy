import assert from "node:assert/strict";
import test from "node:test";

import { createMediaAccessToken, verifyMediaAccessToken } from "@/lib/media-access-token";

test("media capability tokens are tenant- and asset-bound", async () => {
  const businessId = "5a7497d2-65c4-4b2e-a29f-d9f7bc47aade";
  const mediaAssetId = "df00408c-83b5-4500-bddb-b800638d7e49";
  const sourceEventId = crypto.randomUUID();
  const processingToken = crypto.randomUUID();
  const token = await createMediaAccessToken(businessId, mediaAssetId, sourceEventId, processingToken, "test-secret");

  assert.equal(await verifyMediaAccessToken(businessId, mediaAssetId, sourceEventId, processingToken, token, "test-secret"), true);
  assert.equal(await verifyMediaAccessToken(businessId, crypto.randomUUID(), sourceEventId, processingToken, token, "test-secret"), false);
  assert.equal(await verifyMediaAccessToken(crypto.randomUUID(), mediaAssetId, sourceEventId, processingToken, token, "test-secret"), false);
});
