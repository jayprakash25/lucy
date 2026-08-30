import { createHmac, randomBytes } from "node:crypto";

const APPROVAL_PREFIX = "approve_";
const CHANGE_PREFIX = "change_";
const CANCEL_PREFIX = "cancel_";

export type ApprovalCommand =
  | { action: "approve" | "cancel" | "change"; token: string }
  | { action: "unknown" };

export function createApprovalToken(): string {
  return randomBytes(18).toString("base64url");
}

export function hashApprovalToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function approvalButtonId(action: "approve" | "cancel" | "change", token: string): string {
  return `${action}_${token}`;
}

export function parseApprovalCommand(value: string): ApprovalCommand {
  for (const [prefix, action] of [
    [APPROVAL_PREFIX, "approve"],
    [CHANGE_PREFIX, "change"],
    [CANCEL_PREFIX, "cancel"],
  ] as const) {
    if (value.startsWith(prefix) && value.length > prefix.length) {
      return { action, token: value.slice(prefix.length) };
    }
  }

  return { action: "unknown" };
}
