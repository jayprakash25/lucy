import "server-only";

import type { ModelMessage } from "ai";

import {
  getConversationDraftBoundary,
  listConversationMedia,
  listConversationMediaByIds,
  listConversationMessages,
} from "@/db/conversation-queries";
import { getRevisionBase } from "@/db/proposal-queries";
import { config } from "@/lib/config";
import { createMediaAccessToken } from "@/lib/media-access-token";

import { shouldIncludeMedia } from "./media-context-policy";

const MAX_MODEL_MEDIA = 4;
const MAX_MODEL_MEDIA_BYTES = 20 * 1_024 * 1_024;

export async function loadLucyConversationContext(input: {
  businessId: string;
  conversationId: string;
  sourceEventId: string;
  processingToken: string;
}): Promise<ModelMessage[]> {
  "use step";

  const [boundary, revisionBase] = await Promise.all([
    getConversationDraftBoundary(input.conversationId, input.sourceEventId),
    getRevisionBase(input.conversationId),
  ]);
  const messages = await listConversationMessages(input.conversationId, boundary);
  const modelMessages: ModelMessage[] = messages.flatMap((message): ModelMessage[] => {
    if (!message.text) return [];
    const content = message.direction === "inbound" ? `[message:${message.id}] ${message.text}` : message.text;
    return [{ role: message.direction === "inbound" ? "user" : "assistant", content }];
  });

  if (revisionBase) {
    modelMessages.unshift({
      role: "user",
      content: `[revision-base] Preserve every unchanged field, evidence item, and media selection from this immutable proposal: ${JSON.stringify(revisionBase.content)}`,
    });
  }

  if (!shouldIncludeMedia(messages)) return modelMessages;

  const [currentMedia, priorMedia] = await Promise.all([
    listConversationMedia(input.conversationId, boundary),
    listConversationMediaByIds(input.conversationId, revisionBase?.content.mediaAssetIds ?? []),
  ]);
  const recentMedia = [...new Map([...priorMedia, ...currentMedia].map((asset) => [asset.id, asset])).values()]
    .slice(-MAX_MODEL_MEDIA)
    .reverse();
  const content: Array<{ type: "text"; text: string } | { type: "file"; data: URL; mediaType: string }> = [];
  let totalBytes = 0;
  for (const asset of recentMedia) {
    if (totalBytes + asset.byteSize > MAX_MODEL_MEDIA_BYTES) continue;
    totalBytes += asset.byteSize;
    content.push(
      { type: "text", text: `[media:${asset.id}] Operator-supplied property media:` },
      {
        type: "file",
        data: await createStableMediaUrl(input.businessId, asset.id, input.sourceEventId, input.processingToken),
        mediaType: asset.mimeType,
      },
    );
  }
  if (content.length > 0) {
    modelMessages.push({
      role: "user",
      content,
    });
  }

  return modelMessages;
}

async function createStableMediaUrl(
  businessId: string,
  mediaAssetId: string,
  sourceEventId: string,
  processingToken: string,
): Promise<URL> {
  const url = new URL(`/api/agent-media/${mediaAssetId}`, config.publicAppUrl);
  url.searchParams.set("business", businessId);
  url.searchParams.set("event", sourceEventId);
  url.searchParams.set("lease", processingToken);
  url.searchParams.set(
    "token",
    await createMediaAccessToken(businessId, mediaAssetId, sourceEventId, processingToken, config.approvalHmacSecret),
  );
  return url;
}
