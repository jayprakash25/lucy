import "server-only";

import { z } from "zod";

import { getMeta, postMeta } from "./meta-client";

const CampaignStatusSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  status: z.string().min(1),
  effective_status: z.string().min(1),
});

const InsightSchema = z.object({
  spend: z.string().optional(),
  reach: z.string().optional(),
  impressions: z.string().optional(),
  clicks: z.string().optional(),
  actions: z.array(z.object({ action_type: z.string(), value: z.string() })).optional(),
  date_start: z.string().optional(),
  date_stop: z.string().optional(),
});

const InsightsResponseSchema = z.object({ data: z.array(InsightSchema).max(1) });
const MutationResponseSchema = z.object({ success: z.boolean() });

export type CampaignResultsWindow = "last_7d" | "last_30d" | "lifetime";

export async function getMetaCampaignStatus(campaignId: string) {
  const result = await getMeta(
    campaignId,
    { fields: "id,name,status,effective_status" },
    CampaignStatusSchema,
  );
  return {
    id: result.id,
    name: result.name ?? null,
    status: result.status,
    effectiveStatus: result.effective_status,
  };
}

export async function getMetaCampaignResults(campaignId: string, window: CampaignResultsWindow) {
  const result = await getMeta(
    `${campaignId}/insights`,
    {
      fields: "spend,reach,impressions,clicks,actions,date_start,date_stop",
      date_preset: window === "lifetime" ? "maximum" : window,
    },
    InsightsResponseSchema,
  );
  const insight = result.data[0];
  const whatsappConversations = (insight?.actions ?? [])
    .filter((action) => action.action_type.includes("messaging_conversation_started"))
    .reduce((total, action) => total + Number(action.value), 0);
  return {
    spend: insight?.spend ?? "0",
    reach: insight?.reach ?? "0",
    impressions: insight?.impressions ?? "0",
    clicks: insight?.clicks ?? "0",
    whatsappConversations: String(whatsappConversations),
    dateStart: insight?.date_start ?? null,
    dateStop: insight?.date_stop ?? null,
  };
}

export async function pauseMetaCampaign(campaignId: string): Promise<string> {
  const result = await postMeta(campaignId, { status: "PAUSED" }, MutationResponseSchema);
  if (!result.success) {
    throw new Error("Meta did not confirm the campaign pause.");
  }
  return campaignId;
}
