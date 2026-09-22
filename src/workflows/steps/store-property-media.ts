import "server-only";

import { storeMediaAsset } from "@/db/conversation-queries";
import { downloadWhatsAppMedia } from "@/services/whatsapp";

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export async function storePropertyMedia(input: {
  businessId: string;
  conversationId: string;
  messageId: string;
  providerMediaId: string;
  mimeType: string;
  sha256: string | null;
}): Promise<string> {
  "use step";

  const media = await downloadWhatsAppMedia(input.providerMediaId, input.mimeType, input.sha256);
  if (media.mimeType !== input.mimeType) {
    throw new Error("WhatsApp media type changed between webhook and download.");
  }
  const extension = EXTENSIONS[media.mimeType];
  if (!extension) {
    throw new Error(`Unsupported property media type: ${media.mimeType}`);
  }
  const storagePath = `${input.businessId}/${input.conversationId}/${input.messageId}.${extension}`;
  return storeMediaAsset({ ...input, storagePath, bytes: media.bytes });
}
