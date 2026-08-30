import { createHash } from "node:crypto";

import { z } from "zod";

import type { ProviderEventInput } from "@/domain/provider-event";
import { InvalidWebhookError } from "@/lib/errors";

const payloadSchema = z.object({
  object: z.string().min(1),
  entry: z.array(
    z
      .object({
        id: z.string().min(1),
        time: z.number().optional(),
        changes: z.array(
          z.object({
            field: z.string().min(1),
            value: z.record(z.string(), z.unknown()),
          }),
        ),
      })
      .passthrough(),
  ),
});

export function extractMetaEvents(rawBody: string): ProviderEventInput[] {
  let json: unknown;

  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new InvalidWebhookError("Webhook body is not valid JSON.", 400);
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new InvalidWebhookError("Webhook payload does not match the Meta schema.", 422);
  }

  return parsed.data.entry.flatMap((entry) =>
    entry.changes.map((change) => {
      const occurredAt = new Date((entry.time ?? Math.floor(Date.now() / 1_000)) * 1_000).toISOString();
      const digest = createHash("sha256")
        .update(JSON.stringify([entry.id, entry.time, change.field, change.value]))
        .digest("hex");

      return {
        provider: "meta" as const,
        channelExternalId: entry.id,
        externalEventId: digest,
        eventType: `ad.${change.field}`,
        occurredAt,
        payload: { entryId: entry.id, field: change.field, value: change.value },
      };
    }),
  );
}
