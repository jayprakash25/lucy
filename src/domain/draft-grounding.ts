import type { AdDraftInput } from "./ad-proposal";

export function assertGroundedDraft(
  draft: AdDraftInput,
  messages: Array<{ id: string; direction: string; text: string | null }>,
): void {
  const messageText = new Map(
    messages.flatMap((message) =>
      message.direction === "inbound" && message.text ? [[message.id, normalize(message.text)] as const] : [],
    ),
  );
  const expectedValues: Record<string, string[]> = {
    projectName: [draft.property.projectName],
    locality: [draft.property.locality],
    city: [draft.property.city],
    price: [draft.property.price],
    configuration: [draft.property.configuration],
    area: draft.property.area ? [draft.property.area] : [],
    possession: draft.property.possession ? [draft.property.possession] : [],
    registrationId: draft.property.registrationId ? [draft.property.registrationId] : [],
    amenities: draft.property.amenities,
  };
  const seen = new Set<string>();

  for (const evidence of draft.evidence) {
    if (seen.has(evidence.field)) throw new Error(`Duplicate evidence for ${evidence.field}.`);
    seen.add(evidence.field);
    const quote = normalize(evidence.quote);
    if (!(expectedValues[evidence.field] ?? []).every((value) => quote.includes(normalize(value)))) {
      throw new Error(`Evidence does not support ${evidence.field}.`);
    }
    if (!messageText.get(evidence.sourceId)?.includes(quote)) {
      throw new Error(`Message evidence for ${evidence.field} is not present in the conversation.`);
    }
  }

  for (const [field, values] of Object.entries(expectedValues)) {
    if (values.length > 0 && !seen.has(field)) throw new Error(`Missing evidence for ${field}.`);
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
