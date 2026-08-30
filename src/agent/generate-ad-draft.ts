import "server-only";

import type { GeneratedAdDraft } from "@/domain/ad-proposal";
import { config } from "@/lib/config";
import { ExternalServiceError } from "@/lib/errors";
import { parseAdDraft } from "@/services/openai";

import { AGENT_INSTRUCTIONS } from "./prompt";

const REQUIRED_FIELDS = ["project name", "locality", "city", "price", "configuration"];

export async function generateAdDraft(input: {
  messages: Array<{ text: string | null }>;
  mediaCount: number;
}): Promise<GeneratedAdDraft> {
  const propertyNotes = input.messages
    .map((message) => message.text?.trim())
    .filter((text): text is string => Boolean(text))
    .join("\n");

  if (config.providerMode === "mock") {
    return generateMockDraft(propertyNotes, input.mediaCount);
  }

  try {
    const draft = await parseAdDraft({
      instructions: [
        AGENT_INSTRUCTIONS,
        "Extract only facts explicitly supplied by the operator.",
        "Never infer prices, approvals, amenities, dates, availability, returns, or location details.",
        `Required fields: ${REQUIRED_FIELDS.join(", ")}, plus at least one supplied property photo.`,
        "If anything required is absent, return it in missingFields and set property and copy to null.",
        "Preserve supplied values exactly. For every extracted property field, return a verbatim source quote in evidence.",
        "When a field was corrected, use the latest explicit value.",
        "Write concise, factual ad copy without unverifiable superlatives or urgency.",
      ].join("\n"),
      propertyNotes,
      mediaCount: input.mediaCount,
    });

    if (input.mediaCount === 0) {
      return { property: null, copy: null, missingFields: ["property photo"], evidence: [] };
    }

    const unsupported = findUnsupportedFields(draft, propertyNotes);
    if (unsupported.length > 0) {
      return {
        property: null,
        copy: null,
        missingFields: unsupported.map((field) => `an explicit verified ${field}`),
        evidence: [],
      };
    }

    return draft;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI error";
    throw new ExternalServiceError(`Could not generate ad draft: ${message}`, "openai");
  }
}

function generateMockDraft(notes: string, mediaCount: number): GeneratedAdDraft {
  const fields = Object.fromEntries(
    notes
      .split("\n")
      .map((line) => line.match(/^\s*([^:]+):\s*(.+)\s*$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1]!.trim().toLowerCase(), match[2]!.trim()]),
  );
  const projectName = fields["project"] ?? fields["project name"];
  const locality = fields["locality"];
  const city = fields["city"];
  const price = fields["price"];
  const configuration = fields["configuration"] ?? fields["config"];
  const missingFields = [
    !projectName && "project name",
    !locality && "locality",
    !city && "city",
    !price && "price",
    !configuration && "configuration",
    mediaCount === 0 && "property photo",
  ].filter((field): field is string => Boolean(field));

  if (missingFields.length > 0) {
    return { property: null, copy: null, missingFields, evidence: [] };
  }

  const evidence: GeneratedAdDraft["evidence"] = [
    { field: "projectName" as const, quote: projectName! },
    { field: "locality" as const, quote: locality! },
    { field: "city" as const, quote: city! },
    { field: "price" as const, quote: price! },
    { field: "configuration" as const, quote: configuration! },
  ];
  for (const [field, value] of [
    ["area", fields["area"]],
    ["possession", fields["possession"]],
    ["registrationId", fields["registration"] ?? fields["rera"]],
    ["amenities", fields["amenities"]],
  ] as const) {
    if (value) {
      evidence.push({ field, quote: value });
    }
  }

  return {
    property: {
      projectName: projectName!,
      locality: locality!,
      city: city!,
      price: price!,
      configuration: configuration!,
      area: fields["area"] ?? null,
      possession: fields["possession"] ?? null,
      registrationId: fields["registration"] ?? fields["rera"] ?? null,
      amenities: (fields["amenities"] ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    },
    copy: {
      headline: `${configuration} at ${projectName}`,
      primaryText: `${configuration} homes at ${projectName}, ${locality}, ${city}. Starting at ${price}. Message us on WhatsApp for verified availability and a site visit.`,
      description: `Explore ${projectName} in ${locality}.`,
    },
    missingFields: [],
    evidence,
  };
}

function findUnsupportedFields(draft: GeneratedAdDraft, notes: string): string[] {
  if (!draft.property || !draft.copy) {
    return [];
  }

  const values: Record<(typeof draft.evidence)[number]["field"], string[]> = {
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
  const normalizedNotes = normalize(notes);

  return Object.entries(values).flatMap(([field, fieldValues]) => {
    if (fieldValues.length === 0) {
      return [];
    }

    const evidence = draft.evidence.find((item) => item.field === field);
    const isSupported =
      evidence &&
      normalizedNotes.includes(normalize(evidence.quote)) &&
      fieldValues.every((value) => normalize(evidence.quote).includes(normalize(value)));
    return isSupported ? [] : [field];
  });
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
