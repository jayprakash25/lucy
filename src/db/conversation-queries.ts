import "server-only";

import { createDatabaseClient } from "./client";
import { requireDatabaseData, throwDatabaseError } from "./database-error";

export type ConversationMessage = {
  id: string;
  messageType: string;
  text: string | null;
  occurredAt: string;
};

export type ConversationHistoryMessage = ConversationMessage & {
  direction: "inbound" | "outbound";
};

export type StoredMessage = {
  id: string;
  conversationId: string;
};

export type MediaAsset = {
  id: string;
  mimeType: string;
  storagePath: string;
};

export async function recordInboundMessage(input: {
  businessId: string;
  externalContactId: string;
  externalMessageId: string;
  messageType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  text: string | null;
}): Promise<StoredMessage> {
  const database = createDatabaseClient();
  const { data, error } = await database.rpc("record_inbound_whatsapp_message", {
    p_business_id: input.businessId,
    p_external_contact_id: input.externalContactId,
    p_external_message_id: input.externalMessageId,
    p_message_type: input.messageType,
    p_text_content: input.text,
    p_occurred_at: input.occurredAt,
    p_raw_payload: input.payload,
  });
  throwDatabaseError("Could not record inbound WhatsApp message", error);

  const message = (data ?? [])[0];
  if (!message) {
    throw new Error("Could not record inbound WhatsApp message: no row returned.");
  }

  return { id: message.message_id, conversationId: message.conversation_id };
}

export async function listConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("messages")
    .select("id, message_type, text_content, occurred_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("occurred_at", { ascending: true })
    .limit(100);
  throwDatabaseError("Could not load conversation messages", error);

  return (data ?? []).map((row) => ({
    id: row.id,
    messageType: row.message_type,
    text: row.text_content,
    occurredAt: row.occurred_at,
  }));
}

export async function listConversationHistory(conversationId: string): Promise<ConversationHistoryMessage[]> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("messages")
    .select("id, direction, message_type, text_content, occurred_at")
    .eq("conversation_id", conversationId)
    .order("occurred_at", { ascending: true })
    .limit(100);
  throwDatabaseError("Could not load conversation history", error);

  return (data ?? []).map((row) => ({
    id: row.id,
    direction: row.direction as "inbound" | "outbound",
    messageType: row.message_type,
    text: row.text_content,
    occurredAt: row.occurred_at,
  }));
}

export async function storeMediaAsset(input: {
  businessId: string;
  conversationId: string;
  messageId: string;
  providerMediaId: string;
  mimeType: string;
  sha256: string | null;
  storagePath: string;
  bytes: Uint8Array;
}): Promise<string> {
  const database = createDatabaseClient();
  const { error: uploadError } = await database.storage
    .from("property-media")
    .upload(input.storagePath, input.bytes, { contentType: input.mimeType, upsert: false });

  if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) {
    throw new Error(`Could not store property media: ${uploadError.message}`);
  }

  const { data, error } = await database
    .from("media_assets")
    .upsert(
      {
        business_id: input.businessId,
        conversation_id: input.conversationId,
        message_id: input.messageId,
        provider_media_id: input.providerMediaId,
        mime_type: input.mimeType,
        sha256: input.sha256,
        byte_size: input.bytes.byteLength,
        storage_path: input.storagePath,
      },
      { onConflict: "business_id,provider_media_id" },
    )
    .select("id")
    .single();
  throwDatabaseError("Could not record property media", error);
  const storedAsset = requireDatabaseData("Could not record property media", data);

  return storedAsset.id;
}

export async function listConversationMedia(conversationId: string): Promise<MediaAsset[]> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("media_assets")
    .select("id, mime_type, storage_path")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(10);
  throwDatabaseError("Could not load property media", error);

  return (data ?? []).map((row) => ({ id: row.id, mimeType: row.mime_type, storagePath: row.storage_path }));
}

export async function getMediaBytes(mediaAssetId: string, businessId: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  const database = createDatabaseClient();
  const { data: asset, error: assetError } = await database
    .from("media_assets")
    .select("mime_type, storage_path")
    .eq("id", mediaAssetId)
    .eq("business_id", businessId)
    .single();
  throwDatabaseError("Could not load property media metadata", assetError);
  const storedAsset = requireDatabaseData("Could not load property media metadata", asset);

  const { data: file, error: downloadError } = await database.storage
    .from("property-media")
    .download(storedAsset.storage_path);
  if (downloadError) {
    throw new Error(`Could not download property media: ${downloadError.message}`);
  }

  return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: storedAsset.mime_type };
}

export async function updateOutboundMessageStatus(externalMessageId: string, status: string): Promise<void> {
  const database = createDatabaseClient();
  const { error } = await database
    .from("messages")
    .update({ delivery_status: status })
    .eq("provider", "whatsapp")
    .eq("external_message_id", externalMessageId)
    .eq("direction", "outbound");
  throwDatabaseError("Could not update WhatsApp message status", error);
}

export async function recordOutboundMessage(input: {
  businessId: string;
  conversationId: string;
  externalContactId: string;
  externalMessageId: string;
  messageType: string;
  text: string;
}): Promise<void> {
  void input.externalContactId;
  const database = createDatabaseClient();
  const { error } = await database.from("messages").upsert(
    {
      business_id: input.businessId,
      conversation_id: input.conversationId,
      provider: "whatsapp",
      external_message_id: input.externalMessageId,
      direction: "outbound",
      message_type: input.messageType,
      text_content: input.text,
      delivery_status: "accepted",
      occurred_at: new Date().toISOString(),
      raw_payload: {},
    },
    { onConflict: "provider,external_message_id", ignoreDuplicates: true },
  );
  throwDatabaseError("Could not record outbound message", error);
}
