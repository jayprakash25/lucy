import assert from "node:assert/strict";
import test from "node:test";

import { InvalidWebhookError } from "@/lib/errors";
import { extractWhatsAppEvents } from "@/services/whatsapp-webhook";

test("extracts stable message and delivery events from one WhatsApp webhook", () => {
  const events = extractWhatsAppEvents(
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15550000000", phone_number_id: "phone-1" },
                messages: [
                  { id: "wamid.inbound", from: "919000000000", timestamp: "1788020000", type: "text", text: { body: "DONE" } },
                ],
                statuses: [
                  { id: "wamid.outbound", status: "delivered", timestamp: "1788020001", recipient_id: "919000000000" },
                ],
              },
            },
          ],
        },
      ],
    }),
  );

  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => [event.channelExternalId, event.externalEventId, event.eventType]),
    [
      ["phone-1", "wamid.inbound", "message.text"],
      ["phone-1", "wamid.outbound:delivered:1788020001", "message.status.delivered"],
    ],
  );
});

test("rejects malformed payloads at the boundary", () => {
  assert.throws(() => extractWhatsAppEvents("not-json"), InvalidWebhookError);
  assert.throws(
    () => extractWhatsAppEvents(JSON.stringify({ object: "wrong", entry: [] })),
    InvalidWebhookError,
  );
});

test("accepts PDFs and safely ignores unsupported document types", () => {
  const payload = (mimeType: string) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        id: "waba-1",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "phone-1" },
            messages: [{
              id: "wamid.document",
              from: "919000000000",
              timestamp: "1788020000",
              type: "document",
              document: { id: "media-1", mime_type: mimeType, filename: "brochure.pdf" },
            }],
          },
        }],
      }],
    });

  assert.equal(extractWhatsAppEvents(payload("application/pdf"))[0]?.eventType, "message.document");
  assert.equal(extractWhatsAppEvents(payload("text/plain")).length, 0);
});
