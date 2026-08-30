import { extractMetaEvents } from "@/services/meta-webhook";
import { ingestSignedWebhook, verifyWebhookSubscription, webhookErrorResponse } from "@/services/webhook-ingestion";

export function GET(request: Request) {
  return verifyWebhookSubscription(request);
}

export async function POST(request: Request) {
  try {
    return Response.json(await ingestSignedWebhook(request, extractMetaEvents));
  } catch (error) {
    return webhookErrorResponse(error);
  }
}
