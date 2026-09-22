import { z } from "zod";

export const PropertyBriefSchema = z.object({
  projectName: z.string().min(1).max(120),
  locality: z.string().min(1).max(120),
  city: z.string().min(1).max(120),
  price: z.string().min(1).max(80),
  configuration: z.string().min(1).max(80),
  area: z.string().max(120).nullable(),
  possession: z.string().max(120).nullable(),
  registrationId: z.string().max(120).nullable(),
  amenities: z.array(z.string().min(1).max(100)).max(20),
});

export const AdCopySchema = z.object({
  primaryText: z.string().min(1).max(280),
  headline: z.string().min(1).max(80),
  description: z.string().min(1).max(100),
});

export const FactEvidenceSchema = z.object({
  field: z.enum([
    "projectName",
    "locality",
    "city",
    "price",
    "configuration",
    "area",
    "possession",
    "registrationId",
    "amenities",
  ]),
  quote: z.string().min(1).max(500),
  sourceType: z.literal("message"),
  sourceId: z.string().uuid(),
});

export const AdDraftInputSchema = z.object({
  property: PropertyBriefSchema,
  evidence: z.array(FactEvidenceSchema).min(5),
  mediaAssetIds: z.array(z.string().uuid()).min(1).max(4),
  creativeMediaAssetId: z.string().uuid(),
}).refine((draft) => draft.mediaAssetIds.includes(draft.creativeMediaAssetId), {
  message: "Creative media must be one of the selected media assets.",
  path: ["creativeMediaAssetId"],
});

export const CampaignSettingsSchema = z.object({
  countryCode: z.string().length(2),
  currency: z.string().length(3),
  timeZone: z.string().min(1),
  dailyBudgetMinor: z.number().int().positive(),
  durationDays: z.number().int().positive().max(30),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  destination: z.literal("WHATSAPP"),
  objective: z.literal("OUTCOME_ENGAGEMENT"),
});

export const AdProposalContentSchema = z.object({
  property: PropertyBriefSchema,
  copy: AdCopySchema,
  evidence: z.array(FactEvidenceSchema).min(5),
  campaign: CampaignSettingsSchema,
  mediaAssetIds: z.array(z.string().uuid()).min(1).max(10),
  creativeMediaAssetId: z.string().uuid(),
}).refine((proposal) => proposal.mediaAssetIds.includes(proposal.creativeMediaAssetId), {
  message: "Creative media must be one of the selected media assets.",
  path: ["creativeMediaAssetId"],
});

export type AdProposalContent = z.infer<typeof AdProposalContentSchema>;
export type AdDraftInput = z.infer<typeof AdDraftInputSchema>;
export type FactEvidence = z.infer<typeof FactEvidenceSchema>;

export function createGroundedAdCopy(property: z.infer<typeof PropertyBriefSchema>): z.infer<typeof AdCopySchema> {
  return AdCopySchema.parse({
    headline: `${property.configuration} at ${property.projectName}`.slice(0, 80),
    primaryText: `${property.configuration} homes at ${property.projectName}, ${property.locality}, ${property.city}. Starting at ${property.price}. Message us on WhatsApp for details.`.slice(0, 280),
    description: `Explore ${property.projectName} in ${property.locality}.`.slice(0, 100),
  });
}

export function assertSpendWithinLimits(
  settings: z.infer<typeof CampaignSettingsSchema>,
  maximumDailyBudgetMinor: number,
  maximumTotalBudgetMinor: number,
): void {
  if (settings.dailyBudgetMinor > maximumDailyBudgetMinor) {
    throw new Error("Daily budget exceeds the configured safety limit.");
  }

  if (settings.dailyBudgetMinor * settings.durationDays > maximumTotalBudgetMinor) {
    throw new Error("Total campaign budget exceeds the configured safety limit.");
  }
}

export function formatProposalPreview(content: AdProposalContent, version: number): string {
  const total = content.campaign.dailyBudgetMinor * content.campaign.durationDays;
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: content.campaign.currency,
    maximumFractionDigits: 0,
  });

  const preview = [
    `Ad draft v${version}`,
    "",
    `Headline: ${content.copy.headline}`,
    `Primary text: ${content.copy.primaryText}`,
    `Description: ${content.copy.description}`,
    "",
    `Location: ${content.property.locality}, ${content.property.city}`,
    "Destination: WhatsApp",
    `Budget: ${money.format(content.campaign.dailyBudgetMinor / 100)}/day for ${content.campaign.durationDays} days`,
    `Maximum spend: ${money.format(total / 100)}`,
    `Schedule: ${formatDate(content.campaign.startAt, content.campaign.timeZone)} to ${formatDate(content.campaign.endAt, content.campaign.timeZone)}`,
    `Media: ${content.mediaAssetIds.length}; one selected property photo is the ad creative`,
    "",
    "Approve only if every fact, image, and spend limit is correct.",
  ].join("\n");

  if (preview.length > 1_024) {
    throw new Error("Approval preview exceeds the WhatsApp message limit.");
  }

  return preview;
}

function formatDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}
