export type AgentToolAuditEvent = {
  businessId: string;
  eventType: "agent.tool.started" | "agent.tool.completed" | "agent.tool.failed";
  toolName: string;
  subjectId: string;
  actorExternalId: string;
  sourceEventId: string;
  dedupeKey: string;
  metadata: Record<string, unknown>;
};
