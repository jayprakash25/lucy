import "server-only";

import { completeWebhookEvent, failWebhookEvent, renewWebhookEventLease } from "@/db/webhook-queries";

export async function renewProviderEventLease(eventId: string, processingToken: string): Promise<void> {
  "use step";
  await renewWebhookEventLease(eventId, processingToken);
}

export async function completeProviderEvent(eventId: string, processingToken: string): Promise<void> {
  "use step";
  await completeWebhookEvent(eventId, processingToken);
}

export async function failProviderEvent(eventId: string, processingToken: string, reason: string): Promise<void> {
  "use step";
  await failWebhookEvent(eventId, processingToken, reason.slice(0, 1_000));
}
