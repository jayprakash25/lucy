import "server-only";

import { createHash } from "node:crypto";

import type { AdProposalContent } from "@/domain/ad-proposal";
import { config } from "@/lib/config";
import { AmbiguousMutationError, ExternalServiceError } from "@/lib/errors";

export type CreateCampaignInput = {
  name: string;
};

export async function createPausedCampaign(input: CreateCampaignInput): Promise<string> {
  return createMetaObject(`act_${config.metaAdAccountId}/campaigns`, {
    name: input.name,
    objective: "OUTCOME_ENGAGEMENT",
    buying_type: "AUCTION",
    special_ad_categories: [config.metaSpecialAdCategory],
    status: "PAUSED",
  });
}

export async function createPausedAdSet(input: {
  campaignId: string;
  name: string;
  campaign: AdProposalContent["campaign"];
}): Promise<string> {
  return createMetaObject(`act_${config.metaAdAccountId}/adsets`, {
    name: input.name,
    campaign_id: input.campaignId,
    daily_budget: input.campaign.dailyBudgetMinor,
    billing_event: "IMPRESSIONS",
    optimization_goal: "CONVERSATIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    destination_type: "WHATSAPP",
    promoted_object: { page_id: config.metaPageId },
    targeting: { geo_locations: { countries: [input.campaign.countryCode] } },
    start_time: input.campaign.startAt,
    end_time: input.campaign.endAt,
    status: "PAUSED",
  });
}

export async function uploadAdImage(input: { bytes: Uint8Array; mimeType: string }): Promise<string> {
  if (config.providerMode === "mock") {
    return mockId("image", Buffer.from(input.bytes).toString("base64"));
  }

  const form = new FormData();
  const arrayBuffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  ) as ArrayBuffer;
  form.set("filename", new Blob([arrayBuffer], { type: input.mimeType }), "property-image");

  const body = await callMeta(`act_${config.metaAdAccountId}/adimages`, form);
  const images = body.images as Record<string, { hash?: string }> | undefined;
  const hash = images ? Object.values(images)[0]?.hash : undefined;
  if (!hash) {
    throw new AmbiguousMutationError("Meta accepted the image without returning an image hash.", "meta");
  }

  return hash;
}

export async function createAdCreative(input: {
  imageHash: string;
  content: AdProposalContent;
}): Promise<string> {
  const whatsappLink = `https://wa.me/${config.whatsappBusinessPhoneNumber.replace(/\D/g, "")}`;

  return createMetaObject(`act_${config.metaAdAccountId}/adcreatives`, {
    name: `${input.content.property.projectName} creative`,
    object_story_spec: {
      page_id: config.metaPageId,
      link_data: {
        image_hash: input.imageHash,
        link: whatsappLink,
        message: input.content.copy.primaryText,
        name: input.content.copy.headline,
        description: input.content.copy.description,
        call_to_action: { type: "WHATSAPP_MESSAGE", value: { link: whatsappLink } },
      },
    },
  });
}

export async function createPausedAd(input: {
  adSetId: string;
  creativeId: string;
  name: string;
}): Promise<string> {
  return createMetaObject(`act_${config.metaAdAccountId}/ads`, {
    name: input.name,
    adset_id: input.adSetId,
    creative: { creative_id: input.creativeId },
    status: "PAUSED",
  });
}

export async function activateMetaObject(objectId: string): Promise<string> {
  await createMetaObject(objectId, { status: "ACTIVE" }, objectId);
  return objectId;
}

async function createMetaObject(
  path: string,
  fields: Record<string, unknown>,
  stableId?: string,
): Promise<string> {
  if (config.providerMode === "mock") {
    return stableId ?? mockId(path.split("/").at(-1) ?? "object", JSON.stringify(fields));
  }

  const body = await callMeta(path, fields);
  const id = typeof body.id === "string" ? body.id : stableId;
  if (!id) {
    throw new AmbiguousMutationError("Meta accepted the mutation without returning an object ID.", "meta");
  }
  return id;
}

async function callMeta(path: string, fields: Record<string, unknown> | FormData): Promise<Record<string, unknown>> {
  const url = `https://graph.facebook.com/${config.metaGraphVersion}/${path}`;
  const body = fields instanceof FormData ? fields : toFormData(fields);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.metaAccessToken}` },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network failure";
    throw new AmbiguousMutationError(`Meta mutation outcome is uncertain: ${message}`, "meta");
  }

  const result = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; code?: number };
  };
  if (!response.ok) {
    const message = result.error?.message ?? `Meta returned HTTP ${response.status}`;
    if (response.status === 429 || response.status >= 500) {
      throw new AmbiguousMutationError(`Meta mutation outcome is uncertain: ${message}`, "meta", response.status);
    }
    throw new ExternalServiceError(`Meta rejected the mutation: ${message}`, "meta", response.status);
  }

  return result;
}

function toFormData(fields: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return form;
}

function mockId(type: string, seed: string): string {
  return `mock_${type}_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}
