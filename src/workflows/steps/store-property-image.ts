import "server-only";

import { storeMediaAsset } from "@/db/conversation-queries";
import { downloadWhatsAppImage } from "@/services/whatsapp";

export async function storePropertyImage(input: {
  businessId: string;
  conversationId: string;
  messageId: string;
  providerMediaId: string;
  mimeType: string;
  sha256: string | null;
}): Promise<string> {
  "use step";

  const image = await downloadWhatsAppImage(input.providerMediaId);
  if (image.mimeType !== input.mimeType) {
    throw new Error("WhatsApp media type changed between webhook and download.");
  }

  const extension = image.mimeType === "image/png" ? "png" : "jpg";
  const storagePath = `${input.businessId}/${input.conversationId}/${input.messageId}.${extension}`;

  return storeMediaAsset({ ...input, storagePath, bytes: image.bytes });
}
