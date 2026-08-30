import "server-only";

import type {
  IngestedProviderEvent,
  ProviderEventInput,
  StoredProviderEvent,
} from "@/domain/provider-event";

import { createDatabaseClient } from "./client";
import { throwDatabaseError } from "./database-error";

type WebhookRow = {
  id: string;
  business_id: string;
  provider: "meta" | "whatsapp";
  channel_external_id: string;
  external_event_id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  status: StoredProviderEvent["status"];
};

export async function ingestProviderEvents(events: ProviderEventInput[]): Promise<IngestedProviderEvent[]> {
  if (events.length === 0) {
    return [];
  }

  const database = createDatabaseClient();
  const payload = events.map((event) => ({
    provider: event.provider,
    channel_external_id: event.channelExternalId,
    external_event_id: event.externalEventId,
    event_type: event.eventType,
    occurred_at: event.occurredAt,
    payload: event.payload,
  }));
  const { data, error } = await database.rpc("ingest_webhook_events", { p_events: payload });
  throwDatabaseError("Could not ingest webhook events", error);

  return ((data ?? []) as Array<{ event_id: string; should_start: boolean }>).map((row) => ({
    id: row.event_id,
    shouldStart: row.should_start,
  }));
}

export async function markWebhookDispatched(eventId: string, workflowRunId: string): Promise<void> {
  const database = createDatabaseClient();
  const { error } = await database
    .from("webhook_events")
    .update({ workflow_run_id: workflowRunId, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("workflow_run_id", null);
  throwDatabaseError("Could not record workflow dispatch", error);
}

export async function markWebhookDispatchFailed(eventId: string, reason: string): Promise<void> {
  const database = createDatabaseClient();
  const { error } = await database
    .from("webhook_events")
    .update({ status: "failed", last_error: reason, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("status", "dispatching");
  throwDatabaseError("Could not record workflow dispatch failure", error);
}

export async function claimWebhookEvent(eventId: string): Promise<StoredProviderEvent | null> {
  const database = createDatabaseClient();
  const { data, error } = await database.rpc("claim_webhook_event", { p_event_id: eventId });
  throwDatabaseError("Could not claim webhook event", error);

  const row = ((data ?? []) as WebhookRow[])[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    businessId: row.business_id,
    provider: row.provider,
    channelExternalId: row.channel_external_id,
    externalEventId: row.external_event_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    payload: row.payload,
    status: row.status,
  };
}

export async function completeWebhookEvent(eventId: string): Promise<void> {
  await updateWebhookEventStatus(eventId, "completed", null);
}

export async function failWebhookEvent(eventId: string, reason: string): Promise<void> {
  await updateWebhookEventStatus(eventId, "failed", reason);
}

async function updateWebhookEventStatus(
  eventId: string,
  status: "completed" | "failed",
  lastError: string | null,
): Promise<void> {
  const database = createDatabaseClient();
  const { error } = await database
    .from("webhook_events")
    .update({ status, last_error: lastError, updated_at: new Date().toISOString() })
    .eq("id", eventId);
  throwDatabaseError(`Could not mark webhook event ${status}`, error);
}
