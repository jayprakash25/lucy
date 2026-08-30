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
});

export const GeneratedAdDraftSchema = z.object({
  property: PropertyBriefSchema.nullable(),
  copy: AdCopySchema.nullable(),
  missingFields: z.array(z.string()),
  evidence: z.array(FactEvidenceSchema),
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
});

export type AdProposalContent = z.infer<typeof AdProposalContentSchema>;
export type GeneratedAdDraft = z.infer<typeof GeneratedAdDraftSchema>;

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
    `Photos: ${content.mediaAssetIds.length}`,
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
