import assert from "node:assert/strict";
import test from "node:test";

import { approvalButtonId, createEventApprovalToken, hashApprovalToken, parseApprovalCommand } from "@/lib/approval-token";

test("approval button IDs bind an action to one opaque token", () => {
  const token = "opaque-token";

  assert.deepEqual(parseApprovalCommand(approvalButtonId("approve", token)), { action: "approve", token });
  assert.deepEqual(parseApprovalCommand(approvalButtonId("change", token)), { action: "change", token });
  assert.deepEqual(parseApprovalCommand("yes"), { action: "unknown" });
});

test("approval token hashes are secret-bound and deterministic", async () => {
  assert.equal(await hashApprovalToken("token", "secret"), await hashApprovalToken("token", "secret"));
  assert.notEqual(await hashApprovalToken("token", "secret"), await hashApprovalToken("token", "other-secret"));
});

test("proposal retries reproduce the same event-bound token", async () => {
  assert.equal(await createEventApprovalToken("event-id", "secret"), await createEventApprovalToken("event-id", "secret"));
  assert.notEqual(await createEventApprovalToken("event-id", "secret"), await createEventApprovalToken("other-event", "secret"));
});
