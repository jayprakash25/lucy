import { extractWhatsAppEvents } from "@/services/whatsapp-webhook";
import { ingestSignedWebhook, verifyWebhookSubscription, webhookErrorResponse } from "@/services/webhook-ingestion";

export function GET(request: Request) {
  return verifyWebhookSubscription(request);
}

export async function POST(request: Request) {
  try {
    return Response.json(await ingestSignedWebhook(request, extractWhatsAppEvents));
  } catch (error) {
    return webhookErrorResponse(error);
  }
}
