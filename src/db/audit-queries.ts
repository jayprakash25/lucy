import "server-only";

import type { AgentToolAuditEvent } from "@/domain/audit-event";

import { createDatabaseClient } from "./client";
import { throwDatabaseError } from "./database-error";

export async function recordAgentToolAuditEvent(event: AgentToolAuditEvent): Promise<void> {
  const database = createDatabaseClient();
  const { error } = await database.from("audit_events").upsert({
    business_id: event.businessId,
    actor_type: "operator",
    actor_external_id: event.actorExternalId,
    event_type: event.eventType,
    subject_type: "conversation",
    subject_id: event.subjectId,
    dedupe_key: event.dedupeKey,
    metadata: { tool: event.toolName, sourceEventId: event.sourceEventId, ...event.metadata },
  }, { onConflict: "dedupe_key" });
  throwDatabaseError("Could not record agent tool audit event", error);
}
