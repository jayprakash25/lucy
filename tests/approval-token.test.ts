import assert from "node:assert/strict";
import test from "node:test";

import { approvalButtonId, hashApprovalToken, parseApprovalCommand } from "@/lib/approval-token";

test("approval button IDs bind an action to one opaque token", () => {
  const token = "opaque-token";

  assert.deepEqual(parseApprovalCommand(approvalButtonId("approve", token)), { action: "approve", token });
  assert.deepEqual(parseApprovalCommand(approvalButtonId("change", token)), { action: "change", token });
  assert.deepEqual(parseApprovalCommand("yes"), { action: "unknown" });
});

test("approval token hashes are secret-bound and deterministic", () => {
  assert.equal(hashApprovalToken("token", "secret"), hashApprovalToken("token", "secret"));
  assert.notEqual(hashApprovalToken("token", "secret"), hashApprovalToken("token", "other-secret"));
});
