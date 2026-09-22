import "server-only";

import { z } from "zod";

import type { AdProposalContent } from "@/domain/ad-proposal";
import { config } from "@/lib/config";
import { AmbiguousMutationError } from "@/lib/errors";

import { postMeta } from "./meta-client";

const MetaIdResponseSchema = z.object({ id: z.string().min(1) });
const MetaImageResponseSchema = z.object({
  images: z.record(z.string(), z.object({ hash: z.string().min(1).optional() })),
});

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
  const form = new FormData();
  const arrayBuffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  ) as ArrayBuffer;
  form.set("filename", new Blob([arrayBuffer], { type: input.mimeType }), "property-image");

  const body = await postMeta(`act_${config.metaAdAccountId}/adimages`, form, MetaImageResponseSchema);
  const hash = Object.values(body.images)[0]?.hash;
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
  const body = await postMeta(path, fields, MetaIdResponseSchema.or(z.object({ success: z.boolean() })));
  const id = "id" in body ? body.id : stableId;
  if (!id) {
    throw new AmbiguousMutationError("Meta accepted the mutation without returning an object ID.", "meta");
  }
  return id;
}
