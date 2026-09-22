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

export type WebhookClaim =
  | { kind: "claimed"; event: StoredProviderEvent }
  | { kind: "deferred" | "duplicate" };

export async function claimWebhookEvent(eventId: string, processingToken: string): Promise<WebhookClaim> {
  const database = createDatabaseClient();
  const { data, error } = await database.rpc("claim_webhook_event", {
    p_event_id: eventId,
    p_processing_token: processingToken,
  });
  throwDatabaseError("Could not claim webhook event", error);

  const row = ((data ?? []) as WebhookRow[])[0];
  if (!row) {
    const { data: current, error: lookupError } = await database
      .from("webhook_events")
      .select("status")
      .eq("id", eventId)
      .single();
    throwDatabaseError("Could not inspect webhook event", lookupError);

    return { kind: current?.status === "dispatching" ? "deferred" : "duplicate" };
  }

  return {
    kind: "claimed",
    event: {
      id: row.id,
      businessId: row.business_id,
      provider: row.provider,
      channelExternalId: row.channel_external_id,
      externalEventId: row.external_event_id,
      eventType: row.event_type,
      occurredAt: row.occurred_at,
      payload: row.payload,
      status: row.status,
    },
  };
}

export async function completeWebhookEvent(eventId: string, processingToken: string): Promise<void> {
  await updateWebhookEventStatus(eventId, processingToken, "completed", null);
}

export async function renewWebhookEventLease(eventId: string, processingToken: string): Promise<void> {
  const database = createDatabaseClient();
  const { data, error } = await database.rpc("renew_webhook_event_lease", {
    p_event_id: eventId,
    p_processing_token: processingToken,
  });
  throwDatabaseError("Could not renew webhook processing lease", error);
  if (!data) throw new Error("Could not renew webhook processing lease: lease was lost.");
}

export async function isWebhookEventLeaseActive(
  eventId: string,
  businessId: string,
  processingToken: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1_000).toISOString();
  const database = createDatabaseClient();
  const { count, error } = await database
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("id", eventId)
    .eq("business_id", businessId)
    .eq("status", "processing")
    .eq("processing_token", processingToken)
    .gte("updated_at", cutoff);
  throwDatabaseError("Could not verify webhook processing lease", error);
  return count === 1;
}

export async function failWebhookEvent(eventId: string, processingToken: string, reason: string): Promise<void> {
  await updateWebhookEventStatus(eventId, processingToken, "failed", reason);
}

async function updateWebhookEventStatus(
  eventId: string,
  processingToken: string,
  status: "completed" | "failed",
  lastError: string | null,
): Promise<void> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("webhook_events")
    .update({ status, last_error: lastError, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("status", "processing")
    .eq("processing_token", processingToken)
    .select("id")
    .maybeSingle();
  throwDatabaseError(`Could not mark webhook event ${status}`, error);
  if (!data) throw new Error(`Could not mark webhook event ${status}: processing lease was lost.`);
}
