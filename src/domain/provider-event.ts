export type Provider = "meta" | "whatsapp";

export type ProviderEventInput = {
  provider: Provider;
  channelExternalId: string;
  externalEventId: string;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type IngestedProviderEvent = {
  id: string;
  shouldStart: boolean;
};

export type StoredProviderEvent = ProviderEventInput & {
  id: string;
  businessId: string;
  status: "completed" | "dispatching" | "failed" | "processing" | "received";
};
