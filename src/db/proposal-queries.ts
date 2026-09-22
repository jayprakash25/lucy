import "server-only";

import { AdProposalContentSchema, type AdProposalContent } from "@/domain/ad-proposal";

import { createDatabaseClient } from "./client";
import { requireDatabaseData, throwDatabaseError } from "./database-error";
import type { Database } from "./database-types";

export type StoredProposal = {
  id: string;
  businessId: string;
  conversationId: string;
  sourceEventId: string | null;
  version: number;
  status: string;
  content: AdProposalContent;
  contentHash: string;
};

export type RevisionBase = {
  content: AdProposalContent;
  createdAt: string;
};

type ProposalRow = {
  id: string;
  business_id: string;
  conversation_id: string;
  source_event_id: string | null;
  version: number;
  status: string;
  content: AdProposalContent;
  content_hash: string;
};

function mapProposal(row: Omit<ProposalRow, "content"> & { content: unknown }): StoredProposal {
  return {
    id: row.id,
    businessId: row.business_id,
    conversationId: row.conversation_id,
    sourceEventId: row.source_event_id,
    version: row.version,
    status: row.status,
    content: AdProposalContentSchema.parse(row.content),
    contentHash: row.content_hash,
  };
}

export async function getRevisionBase(conversationId: string): Promise<RevisionBase | null> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("ad_proposal_versions")
    .select("content, created_at")
    .eq("conversation_id", conversationId)
    .eq("status", "changes_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwDatabaseError("Could not load the proposal revision base", error);
  if (!data) return null;
  return { content: AdProposalContentSchema.parse(data.content), createdAt: data.created_at };
}

export async function getProposalBySourceEvent(
  businessId: string,
  conversationId: string,
  sourceEventId: string,
): Promise<StoredProposal | null> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("ad_proposal_versions")
    .select("id, business_id, conversation_id, source_event_id, version, status, content, content_hash")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("source_event_id", sourceEventId)
    .maybeSingle();
  throwDatabaseError("Could not load the event proposal", error);
  return data ? mapProposal(data as unknown as ProposalRow) : null;
}

export async function createAdProposalVersion(input: {
  businessId: string;
  conversationId: string;
  sourceEventId: string;
  content: AdProposalContent;
  contentHash: string;
  approvalTokenHash: string;
  approvalExpiresAt: string;
}): Promise<StoredProposal> {
  const database = createDatabaseClient();
  const { data, error } = await database.rpc("create_ad_proposal_version", {
    p_business_id: input.businessId,
    p_conversation_id: input.conversationId,
    p_source_event_id: input.sourceEventId,
    p_content: input.content,
    p_content_hash: input.contentHash,
    p_approval_token_hash: input.approvalTokenHash,
    p_approval_expires_at: input.approvalExpiresAt,
  });
  throwDatabaseError("Could not create ad proposal", error);

  const row = ((data ?? []) as ProposalRow[])[0];
  if (!row) {
    throw new Error("Could not create ad proposal: no row returned.");
  }

  return mapProposal(row);
}

export async function recordProposalDecision(input: {
  businessId: string;
  tokenHash: string;
  action: "approve" | "cancel" | "change";
  approverExternalId: string;
  sourceExternalMessageId: string;
}): Promise<StoredProposal> {
  const database = createDatabaseClient();
  const { data, error } = await database.rpc("record_proposal_decision", {
    p_business_id: input.businessId,
    p_token_hash: input.tokenHash,
    p_action: input.action,
    p_approver_external_id: input.approverExternalId,
    p_source_external_message_id: input.sourceExternalMessageId,
  });
  throwDatabaseError("Could not record proposal decision", error);

  const row = ((data ?? []) as ProposalRow[])[0];
  if (!row) {
    throw new Error("Could not record proposal decision: no row returned.");
  }

  return mapProposal(row);
}

export async function getApprovedProposalForMutation(proposalId: string): Promise<StoredProposal> {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("ad_proposal_versions")
    .select("id, business_id, conversation_id, source_event_id, version, status, content, content_hash, approvals!inner(proposal_content_hash)")
    .eq("id", proposalId)
    .in("status", ["approved", "publishing"])
    .single();
  throwDatabaseError("Could not verify approved proposal", error);
  const approvedProposal = requireDatabaseData("Could not verify approved proposal", data);

  const approval = Array.isArray(approvedProposal.approvals)
    ? approvedProposal.approvals[0]
    : approvedProposal.approvals;
  if (!approval || approval.proposal_content_hash !== approvedProposal.content_hash) {
    throw new Error("Approval does not match the immutable proposal content.");
  }

  return mapProposal(approvedProposal as unknown as ProposalRow);
}

export async function markProposalPublishing(proposalId: string): Promise<void> {
  await updateProposal(proposalId, { status: "publishing", updated_at: new Date().toISOString() });
}

export async function markProposalPendingReview(
  proposalId: string,
  ids: { campaignId: string; adSetId: string; creativeId: string; adId: string },
): Promise<void> {
  await updateProposal(proposalId, {
    status: "pending_review",
    meta_campaign_id: ids.campaignId,
    meta_ad_set_id: ids.adSetId,
    meta_creative_id: ids.creativeId,
    meta_ad_id: ids.adId,
    updated_at: new Date().toISOString(),
  });
}

export async function markProposalPaused(proposalId: string): Promise<void> {
  await updateProposal(proposalId, { status: "paused", updated_at: new Date().toISOString() });
}

async function updateProposal(
  proposalId: string,
  values: Database["public"]["Tables"]["ad_proposal_versions"]["Update"],
): Promise<void> {
  const database = createDatabaseClient();
  const { error } = await database.from("ad_proposal_versions").update(values).eq("id", proposalId);
  throwDatabaseError("Could not update ad proposal", error);
}
