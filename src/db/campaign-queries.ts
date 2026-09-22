import "server-only";

import { AdProposalContentSchema, type AdProposalContent } from "@/domain/ad-proposal";

import { createDatabaseClient } from "./client";
import { requireDatabaseData, throwDatabaseError } from "./database-error";

export type CampaignSummary = {
  proposalId: string;
  projectName: string;
  status: string;
  metaCampaignId: string | null;
  createdAt: string;
};

export type StoredCampaign = CampaignSummary & {
  businessId: string;
  content: AdProposalContent;
};

export async function listRecentCampaigns(businessId: string): Promise<CampaignSummary[]> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("ad_proposal_versions")
    .select("id, status, content, meta_campaign_id, created_at")
    .eq("business_id", businessId)
    .not("meta_campaign_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  throwDatabaseError("Could not list campaigns", error);

  return (data ?? []).map((row) => {
    const content = AdProposalContentSchema.parse(row.content);
    return {
      proposalId: row.id,
      projectName: content.property.projectName,
      status: row.status,
      metaCampaignId: row.meta_campaign_id,
      createdAt: row.created_at,
    };
  });
}

export async function getStoredCampaign(businessId: string, proposalId: string): Promise<StoredCampaign> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("ad_proposal_versions")
    .select("id, business_id, status, content, meta_campaign_id, created_at")
    .eq("id", proposalId)
    .eq("business_id", businessId)
    .single();
  throwDatabaseError("Could not load campaign", error);
  const row = requireDatabaseData("Could not load campaign", data);
  const content = AdProposalContentSchema.parse(row.content);

  return {
    proposalId: row.id,
    businessId: row.business_id,
    projectName: content.property.projectName,
    status: row.status,
    metaCampaignId: row.meta_campaign_id,
    createdAt: row.created_at,
    content,
  };
}

export async function getLatestProviderFailure(businessId: string, conversationId: string): Promise<{
  provider: string;
  operationType: string;
  status: string;
  error: string | null;
  updatedAt: string;
} | null> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("provider_operations")
    .select("provider, operation_type, status, last_error, updated_at, ad_proposal_versions!inner(conversation_id)")
    .eq("business_id", businessId)
    .eq("ad_proposal_versions.conversation_id", conversationId)
    .in("status", ["failed", "uncertain"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwDatabaseError("Could not load the latest provider failure", error);

  return data
    ? {
        provider: data.provider,
        operationType: data.operation_type,
        status: data.status,
        error: data.last_error,
        updatedAt: data.updated_at,
      }
    : null;
}
