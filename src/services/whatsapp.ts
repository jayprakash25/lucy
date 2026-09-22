import "server-only";

import { z } from "zod";

import { config } from "@/lib/config";
import { AmbiguousMutationError, ExternalServiceError } from "@/lib/errors";

const WhatsAppResponseSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) });
const WhatsAppErrorSchema = z.object({ error: z.object({ message: z.string().optional() }) });
const WhatsAppMediaMetadataSchema = z.object({
  url: z.string().url(),
  mime_type: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
});

export async function sendWhatsAppText(to: string, text: string): Promise<string> {
  return sendWhatsAppPayload(
    { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text } },
  );
}

export async function sendWhatsAppApproval(input: {
  to: string;
  text: string;
  approveButtonId: string;
  changeButtonId: string;
  cancelButtonId: string;
}): Promise<string> {
  if (input.text.length > 1_024) {
    throw new Error("WhatsApp approval text exceeds the 1,024 character limit.");
  }

  return sendWhatsAppPayload(
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
  );
}

export async function sendWhatsAppMediaReference(input: {
  to: string;
  providerMediaId: string;
  mimeType: string;
  caption: string;
}): Promise<string> {
  const type = input.mimeType === "application/pdf" ? "document" : "image";
  return sendWhatsAppPayload(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type,
      [type]: { id: input.providerMediaId, caption: input.caption },
    },
  );
}

async function sendWhatsAppPayload(payload: Record<string, unknown>): Promise<string> {
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

  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = WhatsAppErrorSchema.safeParse(body).data?.error.message ?? `WhatsApp returned HTTP ${response.status}`;
    if (response.status === 429 || response.status >= 500) {
      throw new AmbiguousMutationError(`WhatsApp delivery is uncertain: ${message}`, "whatsapp", response.status);
    }
    throw new ExternalServiceError(`WhatsApp rejected the message: ${message}`, "whatsapp", response.status);
  }

  const parsed = WhatsAppResponseSchema.safeParse(body);
  const messageId = parsed.success ? parsed.data.messages[0]?.id : null;
  if (!messageId) {
    throw new AmbiguousMutationError("WhatsApp accepted the request without returning a message ID.", "whatsapp");
  }

  return messageId;
}

const MAX_MEDIA_BYTES = 10 * 1_024 * 1_024;

export async function downloadWhatsAppMedia(
  mediaId: string,
  expectedMimeType: string,
  expectedSha256: string | null,
): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  const metadataResponse = await fetch(
    `https://graph.facebook.com/${config.metaGraphVersion}/${encodeURIComponent(mediaId)}`,
    { headers: { Authorization: `Bearer ${config.metaAccessToken}` }, signal: AbortSignal.timeout(10_000) },
  );
  const metadataBody: unknown = await metadataResponse.json().catch(() => ({}));
  const parsedMetadata = WhatsAppMediaMetadataSchema.safeParse(metadataBody);
  if (!metadataResponse.ok || !parsedMetadata.success) {
    throw new ExternalServiceError(
      `Could not retrieve WhatsApp media URL: ${WhatsAppErrorSchema.safeParse(metadataBody).data?.error.message ?? metadataResponse.status}`,
      "whatsapp",
      metadataResponse.status,
    );
  }
  const metadata = parsedMetadata.data;
  if (metadata.file_size && metadata.file_size > MAX_MEDIA_BYTES) {
    throw new ExternalServiceError("WhatsApp media exceeds the 10 MB limit.", "whatsapp");
  }

  const fileResponse = await fetch(metadata.url, {
    headers: { Authorization: `Bearer ${config.metaAccessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!fileResponse.ok) {
    throw new ExternalServiceError(`Could not download WhatsApp media: HTTP ${fileResponse.status}`, "whatsapp");
  }
  const contentLength = Number(fileResponse.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_BYTES) {
    throw new ExternalServiceError("WhatsApp media exceeds the 10 MB limit.", "whatsapp");
  }

  const bytes = await readBoundedBody(fileResponse, MAX_MEDIA_BYTES);
  if (bytes.byteLength === 0) {
    throw new ExternalServiceError("WhatsApp media is empty or exceeds the 10 MB limit.", "whatsapp");
  }

  const mimeType = metadata.mime_type ?? fileResponse.headers.get("content-type") ?? "application/octet-stream";
  if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "application/pdf") {
    throw new ExternalServiceError(`Unsupported WhatsApp media type: ${mimeType}`, "whatsapp");
  }
  if (mimeType !== expectedMimeType || !hasExpectedSignature(bytes, mimeType)) {
    throw new ExternalServiceError("WhatsApp media content does not match its declared type.", "whatsapp");
  }
  if (expectedSha256) {
    const actual = await sha256(bytes);
    const expected = Buffer.from(expectedSha256, "base64");
    if (expected.length !== actual.length || !actual.every((byte, index) => byte === expected[index])) {
      throw new ExternalServiceError("WhatsApp media checksum verification failed.", "whatsapp");
    }
  }

  return { bytes, mimeType };
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  const input = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new ExternalServiceError("WhatsApp returned no media body.", "whatsapp");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ExternalServiceError("WhatsApp media exceeds the 10 MB limit.", "whatsapp");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}
