import { z } from "zod";

import type { ProviderEventInput } from "@/domain/provider-event";
import { InvalidWebhookError } from "@/lib/errors";

const metadataSchema = z.object({
  display_phone_number: z.string().optional(),
  phone_number_id: z.string().min(1),
});

const messageSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    timestamp: z.string().min(1),
    type: z.string().min(1),
    text: z.object({ body: z.string() }).optional(),
    image: z
      .object({
        id: z.string().min(1),
        mime_type: z.string().min(1),
        sha256: z.string().optional(),
        caption: z.string().optional(),
      })
      .optional(),
    interactive: z
      .object({
        type: z.string(),
        button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      })
      .optional(),
  })
  .passthrough();

const statusSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
    timestamp: z.string().min(1),
    recipient_id: z.string().optional(),
  })
  .passthrough();

const valueSchema = z
  .object({
    messaging_product: z.literal("whatsapp"),
    metadata: metadataSchema,
    messages: z.array(messageSchema).optional(),
    statuses: z.array(statusSchema).optional(),
  })
  .passthrough();

const payloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(z.object({ field: z.literal("messages"), value: valueSchema })),
    }),
  ),
});

export const StoredWhatsAppPayloadSchema = z.object({
  metadata: metadataSchema,
  message: messageSchema.optional(),
  status: statusSchema.optional(),
});

function unixSecondsToIso(timestamp: string): string {
  const milliseconds = Number(timestamp) * 1_000;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : new Date().toISOString();
}

export function extractWhatsAppEvents(rawBody: string): ProviderEventInput[] {
  let json: unknown;

  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new InvalidWebhookError("Webhook body is not valid JSON.", 400);
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new InvalidWebhookError("Webhook payload does not match the WhatsApp schema.", 422);
  }

  const events: ProviderEventInput[] = [];

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const { metadata } = change.value;

      for (const message of change.value.messages ?? []) {
        events.push({
          provider: "whatsapp",
          channelExternalId: metadata.phone_number_id,
          externalEventId: message.id,
          eventType: `message.${message.type}`,
          occurredAt: unixSecondsToIso(message.timestamp),
          payload: { metadata, message },
        });
      }

      for (const status of change.value.statuses ?? []) {
        events.push({
          provider: "whatsapp",
          channelExternalId: metadata.phone_number_id,
          externalEventId: `${status.id}:${status.status}:${status.timestamp}`,
          eventType: `message.status.${status.status}`,
          occurredAt: unixSecondsToIso(status.timestamp),
          payload: { metadata, status },
        });
      }
    }
  }

  return events;
}
