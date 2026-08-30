import "server-only";

import { completeWebhookEvent, failWebhookEvent } from "@/db/webhook-queries";

export async function completeProviderEvent(eventId: string): Promise<void> {
  "use step";
  await completeWebhookEvent(eventId);
}

export async function failProviderEvent(eventId: string, reason: string): Promise<void> {
  "use step";
  await failWebhookEvent(eventId, reason.slice(0, 1_000));
}
