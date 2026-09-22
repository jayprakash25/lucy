import { z } from "zod";

import { getMediaBytes } from "@/db/conversation-queries";
import { isWebhookEventLeaseActive } from "@/db/webhook-queries";
import { config } from "@/lib/config";
import { verifyMediaAccessToken } from "@/lib/media-access-token";

const RequestSchema = z.object({
  businessId: z.string().uuid(),
  mediaAssetId: z.string().uuid(),
  sourceEventId: z.string().uuid(),
  processingToken: z.string().uuid(),
  token: z.string().min(1).max(128),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  const url = new URL(request.url);
  const parsed = RequestSchema.safeParse({
    businessId: url.searchParams.get("business"),
    mediaAssetId: (await context.params).mediaAssetId,
    sourceEventId: url.searchParams.get("event"),
    processingToken: url.searchParams.get("lease"),
    token: url.searchParams.get("token"),
  });
  if (!parsed.success) return new Response("Not found", { status: 404 });

  const { businessId, mediaAssetId, sourceEventId, processingToken, token } = parsed.data;
  const [validToken, activeLease] = await Promise.all([
    verifyMediaAccessToken(
      businessId,
      mediaAssetId,
      sourceEventId,
      processingToken,
      token,
      config.approvalHmacSecret,
    ),
    isWebhookEventLeaseActive(sourceEventId, businessId, processingToken),
  ]);
  if (!validToken || !activeLease) {
    return new Response("Not found", { status: 404 });
  }

  const media = await getMediaBytes(mediaAssetId, businessId);
  return new Response(Uint8Array.from(media.bytes).buffer, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": media.mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
