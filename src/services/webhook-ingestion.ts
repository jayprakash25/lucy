import "server-only";

import { start } from "workflow/api";

import { ingestProviderEvents, markWebhookDispatched, markWebhookDispatchFailed } from "@/db/webhook-queries";
import type { ProviderEventInput } from "@/domain/provider-event";
import { config } from "@/lib/config";
import { InvalidWebhookError } from "@/lib/errors";
import { verifyMetaSignature } from "@/lib/verify-meta-signature";
import { processProviderEventWorkflow } from "@/workflows/process-provider-event";

export async function ingestSignedWebhook(
  request: Request,
  extractEvents: (rawBody: string) => ProviderEventInput[],
): Promise<{ accepted: number; dispatched: number }> {
  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), config.metaAppSecret)) {
    throw new InvalidWebhookError("Webhook signature is invalid.", 401);
  }

  const events = extractEvents(rawBody);
  const ingested = await ingestProviderEvents(events);
  const dispatchable = ingested.filter((event) => event.shouldStart);

  await Promise.all(
    dispatchable.map(async (event) => {
      try {
        const run = await start(processProviderEventWorkflow, [event.id, crypto.randomUUID()]);
        await markWebhookDispatched(event.id, run.runId);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown workflow dispatch failure";
        await markWebhookDispatchFailed(event.id, reason);
        throw error;
      }
    }),
  );

  return { accepted: ingested.length, dispatched: dispatchable.length };
}

export function verifyWebhookSubscription(request: Request): Response {
  const query = new URL(request.url).searchParams;
  const isValid =
    query.get("hub.mode") === "subscribe" && query.get("hub.verify_token") === config.metaVerifyToken;

  if (!isValid) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(query.get("hub.challenge") ?? "", { status: 200 });
}

export function webhookErrorResponse(error: unknown): Response {
  if (error instanceof InvalidWebhookError) {
    return Response.json({ error: error.message }, { status: error.statusCode });
  }

  console.error("Webhook ingestion failed", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "Webhook ingestion failed." }, { status: 500 });
}
