import "server-only";

import { createHash } from "node:crypto";

import { config } from "@/lib/config";
import { AmbiguousMutationError, ExternalServiceError } from "@/lib/errors";

type WhatsAppResponse = { messages?: Array<{ id?: string }> };

export async function sendWhatsAppText(to: string, text: string, operationKey: string): Promise<string> {
  return sendWhatsAppPayload(
    to,
    { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text } },
    operationKey,
  );
}

export async function sendWhatsAppApproval(input: {
  to: string;
  text: string;
  approveButtonId: string;
  changeButtonId: string;
  cancelButtonId: string;
  operationKey: string;
}): Promise<string> {
  if (input.text.length > 1_024) {
    throw new Error("WhatsApp approval text exceeds the 1,024 character limit.");
  }

  return sendWhatsAppPayload(
    input.to,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: input.text },
        action: {
          buttons: [
            { type: "reply", reply: { id: input.approveButtonId, title: "Approve & publish" } },
            { type: "reply", reply: { id: input.changeButtonId, title: "Request changes" } },
            { type: "reply", reply: { id: input.cancelButtonId, title: "Cancel" } },
          ],
        },
      },
    },
    input.operationKey,
  );
}

async function sendWhatsAppPayload(
  to: string,
  payload: Record<string, unknown>,
  operationKey: string,
): Promise<string> {
  if (config.providerMode === "mock") {
    return `mock_wamid_${createHash("sha256").update(`${to}:${operationKey}`).digest("hex").slice(0, 20)}`;
  }

  const url = `https://graph.facebook.com/${config.metaGraphVersion}/${config.whatsappPhoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.metaAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network failure";
    throw new AmbiguousMutationError(`WhatsApp delivery is uncertain: ${message}`, "whatsapp");
  }

  const body = (await response.json().catch(() => ({}))) as WhatsAppResponse & { error?: { message?: string } };
  if (!response.ok) {
    const message = body.error?.message ?? `WhatsApp returned HTTP ${response.status}`;
    if (response.status === 429 || response.status >= 500) {
      throw new AmbiguousMutationError(`WhatsApp delivery is uncertain: ${message}`, "whatsapp", response.status);
    }
    throw new ExternalServiceError(`WhatsApp rejected the message: ${message}`, "whatsapp", response.status);
  }

  const messageId = body.messages?.[0]?.id;
  if (!messageId) {
    throw new AmbiguousMutationError("WhatsApp accepted the request without returning a message ID.", "whatsapp");
  }

  return messageId;
}

export async function downloadWhatsAppImage(mediaId: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  if (config.providerMode === "mock") {
    return { bytes: new TextEncoder().encode(`mock-image:${mediaId}`), mimeType: "image/jpeg" };
  }

  const metadataResponse = await fetch(
    `https://graph.facebook.com/${config.metaGraphVersion}/${encodeURIComponent(mediaId)}`,
    { headers: { Authorization: `Bearer ${config.metaAccessToken}` }, signal: AbortSignal.timeout(10_000) },
  );
  const metadata = (await metadataResponse.json().catch(() => ({}))) as {
    url?: string;
    mime_type?: string;
    error?: { message?: string };
  };
  if (!metadataResponse.ok || !metadata.url) {
    throw new ExternalServiceError(
      `Could not retrieve WhatsApp media URL: ${metadata.error?.message ?? metadataResponse.status}`,
      "whatsapp",
      metadataResponse.status,
    );
  }

  const fileResponse = await fetch(metadata.url, {
    headers: { Authorization: `Bearer ${config.metaAccessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!fileResponse.ok) {
    throw new ExternalServiceError(`Could not download WhatsApp media: HTTP ${fileResponse.status}`, "whatsapp");
  }

  const bytes = new Uint8Array(await fileResponse.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1_024 * 1_024) {
    throw new ExternalServiceError("WhatsApp image is empty or exceeds the 5 MB limit.", "whatsapp");
  }

  const mimeType = metadata.mime_type ?? fileResponse.headers.get("content-type") ?? "application/octet-stream";
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
    throw new ExternalServiceError(`Unsupported WhatsApp image type: ${mimeType}`, "whatsapp");
  }

  return { bytes, mimeType };
}
