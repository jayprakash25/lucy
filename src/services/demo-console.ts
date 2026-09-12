import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { recordInboundMessage, storeMediaAsset } from "@/db/conversation-queries";
import { createDatabaseClient } from "@/db/client";
import { throwDatabaseError } from "@/db/database-error";
import { buildAdProposal } from "@/workflows/steps/build-ad-proposal";
import {
  activateMetaObjectStep,
  completeMetaLaunchStep,
  createMetaAdSetStep,
  createMetaAdStep,
  createMetaCampaignStep,
  createMetaCreativeStep,
  prepareMetaLaunch,
  uploadMetaImageStep,
} from "@/workflows/steps/launch-meta-ad";
import { recordProposalDecisionStep } from "@/workflows/steps/record-proposal-decision";
import { config } from "@/lib/config";

const DEMO_OPERATOR = "919999999999";

const DemoPropertySchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  locality: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  price: z.string().trim().min(1).max(80),
  configuration: z.string().trim().min(1).max(80),
  area: z.string().trim().max(120).optional(),
  amenities: z.string().trim().max(500).optional(),
});

export async function createDemoProposal(formData: FormData) {
  assertDemoMode();
  const property = DemoPropertySchema.parse(Object.fromEntries(formData));
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) throw new Error("Choose a property photo.");
  if (!["image/jpeg", "image/png"].includes(photo.type)) throw new Error("Use a JPEG or PNG photo.");
  if (photo.size > 5 * 1024 * 1024) throw new Error("Photo must be 5 MB or smaller.");

  const database = createDatabaseClient();
  const { data: business, error } = await database.from("businesses").select("id").eq("slug", "pilot").single();
  throwDatabaseError("Could not load the demo business", error);
  if (!business) throw new Error("The pilot business has not been seeded.");

  const runId = randomUUID();
  const notes = [
    `Project: ${property.projectName}`,
    `Locality: ${property.locality}`,
    `City: ${property.city}`,
    `Price: ${property.price}`,
    `Configuration: ${property.configuration}`,
    property.area && `Area: ${property.area}`,
    property.amenities && `Amenities: ${property.amenities}`,
  ].filter(Boolean).join("\n");

  const detailMessage = await recordInboundMessage({
    businessId: business.id,
    externalContactId: DEMO_OPERATOR,
    externalMessageId: `demo-details-${runId}`,
    messageType: "text",
    occurredAt: new Date().toISOString(),
    payload: { source: "demo-console" },
    text: notes,
  });
  const imageMessage = await recordInboundMessage({
    businessId: business.id,
    externalContactId: DEMO_OPERATOR,
    externalMessageId: `demo-image-${runId}`,
    messageType: "image",
    occurredAt: new Date().toISOString(),
    payload: { source: "demo-console", filename: photo.name },
    text: null,
  });
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const extension = photo.type === "image/png" ? "png" : "jpg";
  await storeMediaAsset({
    businessId: business.id,
    conversationId: detailMessage.conversationId,
    messageId: imageMessage.id,
    providerMediaId: `demo-media-${runId}`,
    mimeType: photo.type,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    storagePath: `${business.id}/${detailMessage.conversationId}/${runId}.${extension}`,
    bytes,
  });

  const result = await buildAdProposal({ businessId: business.id, conversationId: detailMessage.conversationId });
  if (result.kind === "missing") throw new Error(result.message);
  return { proposalId: result.proposalId, token: result.token, preview: result.preview, version: result.version };
}

export async function decideDemoProposal(input: { proposalId: string; workflowId?: string | undefined; token: string; action: "approve" | "change" | "cancel" }) {
  assertDemoMode();
  const database = createDatabaseClient();
  const { data: proposal, error } = await database.from("ad_proposal_versions").select("business_id").eq("id", input.proposalId).single();
  throwDatabaseError("Could not load demo proposal", error);
  if (!proposal) throw new Error("Proposal not found.");

  const decision = await recordProposalDecisionStep({
    action: input.action,
    approvalToken: input.token,
    businessId: proposal.business_id,
    approverExternalId: DEMO_OPERATOR,
    sourceMessageId: `demo-decision-${randomUUID()}`,
  });
  if (input.action !== "approve") {
    if (input.workflowId) await updateDemoWorkflowStatus(input.workflowId, input.action === "change" ? "campaign_changes_requested" : "cancelled");
    return getDemoProposalState(decision.proposalId);
  }

  const launch = await prepareMetaLaunch(decision.proposalId);
  const campaignId = await createMetaCampaignStep(launch);
  const adSetId = await createMetaAdSetStep(launch, campaignId);
  const imageHash = await uploadMetaImageStep(launch);
  const creativeId = await createMetaCreativeStep(launch, imageHash);
  const adId = await createMetaAdStep(launch, adSetId, creativeId);
  await activateMetaObjectStep(launch, "ad", adId);
  await activateMetaObjectStep(launch, "ad-set", adSetId);
  await activateMetaObjectStep(launch, "campaign", campaignId);
  await completeMetaLaunchStep(decision.proposalId, { campaignId, adSetId, creativeId, adId });
  if (input.workflowId) await updateDemoWorkflowStatus(input.workflowId, "launched");
  return getDemoProposalState(decision.proposalId);
}

async function updateDemoWorkflowStatus(workflowId: string, status: string) {
  const database = createDatabaseClient();
  const { error } = await database.from("campaign_workflows").update({ status, updated_at: new Date().toISOString() }).eq("id", workflowId);
  throwDatabaseError("Could not update campaign workflow", error);
}

export async function getDemoProposalState(proposalId: string) {
  assertDemoMode();
  const database = createDatabaseClient();
  const [proposalResult, operationsResult, auditResult] = await Promise.all([
    database.from("ad_proposal_versions").select("id, version, status, content, meta_campaign_id, meta_ad_set_id, meta_creative_id, meta_ad_id, updated_at").eq("id", proposalId).single(),
    database.from("provider_operations").select("id, provider, operation_type, status, remote_id, last_error, started_at, completed_at").eq("proposal_id", proposalId).order("started_at", { ascending: true }),
    database.from("audit_events").select("id, event_type, actor_type, created_at, metadata").eq("subject_id", proposalId).order("created_at", { ascending: true }).limit(30),
  ]);
  throwDatabaseError("Could not load demo proposal", proposalResult.error);
  throwDatabaseError("Could not load provider operations", operationsResult.error);
  throwDatabaseError("Could not load audit history", auditResult.error);
  return { proposal: proposalResult.data, operations: operationsResult.data ?? [], audit: auditResult.data ?? [] };
}

function assertDemoMode() {
  if (config.providerMode !== "mock") throw new Error("The demo console is available only in mock mode.");
}
