import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyMetaSignature } from "@/lib/verify-meta-signature";

test("accepts the exact HMAC for the raw webhook body", () => {
  const body = '{"message":"hello"}';
  const secret = "test-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  assert.equal(verifyMetaSignature(body, signature, secret), true);
  assert.equal(verifyMetaSignature(`${body}\n`, signature, secret), false);
});

test("rejects missing and malformed signatures", () => {
  assert.equal(verifyMetaSignature("{}", null, "secret"), false);
  assert.equal(verifyMetaSignature("{}", "sha1=abc", "secret"), false);
  assert.equal(verifyMetaSignature("{}", "sha256=abc", "secret"), false);
});
