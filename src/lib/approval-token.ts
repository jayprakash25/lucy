const APPROVAL_PREFIX = "approve_";
const CHANGE_PREFIX = "change_";
const CANCEL_PREFIX = "cancel_";

export type ApprovalCommand =
  | { action: "approve" | "cancel" | "change"; token: string }
  | { action: "unknown" };

export async function createEventApprovalToken(sourceEventId: string, secret: string): Promise<string> {
  return (await hmacHex(`proposal:${sourceEventId}`, secret)).slice(0, 24);
}

export function hashApprovalToken(token: string, secret: string): Promise<string> {
  return hmacHex(token, secret);
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
