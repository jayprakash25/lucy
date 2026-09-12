import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createDatabaseClient } from "@/db/client";
import { throwDatabaseError } from "@/db/database-error";
import { config } from "@/lib/config";

const JsonRecord = z.record(z.string(), z.unknown());
const Operator = "919999999999";

const CommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), propertyProfile: JsonRecord, mediaManifest: z.array(JsonRecord).max(20) }),
  z.object({ action: z.literal("saveCreative"), workflowId: z.string().uuid(), format: z.enum(["image", "reel"]), content: JsonRecord, changeRequest: z.string().max(1000).optional() }),
  z.object({ action: z.literal("approveCreative"), workflowId: z.string().uuid(), version: z.number().int().positive(), contentHash: z.string().length(64) }),
  z.object({ action: z.literal("saveCampaign"), workflowId: z.string().uuid(), configuration: JsonRecord }),
  z.object({ action: z.literal("attachProposal"), workflowId: z.string().uuid(), proposalId: z.string().uuid() }),
]);

export async function executeDemoWorkflowCommand(raw: unknown) {
  if (config.providerMode !== "mock") throw new Error("The demo workflow is available only in mock mode.");
  const command = CommandSchema.parse(raw);
  const db = createDatabaseClient();

  if (command.action === "create") {
    const { data: business, error: businessError } = await db.from("businesses").select("id").eq("slug", "pilot").single();
    throwDatabaseError("Could not load the demo business", businessError);
    if (!business) throw new Error("Pilot business not found.");
    const { data, error } = await db.from("campaign_workflows").insert({ business_id: business.id, property_profile: command.propertyProfile, media_manifest: command.mediaManifest }).select().single();
    throwDatabaseError("Could not save property profile", error); return data;
  }

  if (command.action === "saveCreative") {
    const { data: workflow, error: readError } = await db.from("campaign_workflows").select("current_creative_version").eq("id", command.workflowId).single();
    throwDatabaseError("Could not load workflow", readError); if (!workflow) throw new Error("Workflow not found.");
    const version = workflow.current_creative_version + 1;
    const contentHash = hash(command.content);
    const { error: insertError } = await db.from("creative_versions").insert({ workflow_id: command.workflowId, version, format: command.format, content: command.content, content_hash: contentHash, change_request: command.changeRequest ?? null });
    throwDatabaseError("Could not save creative version", insertError);
    const { data, error } = await db.from("campaign_workflows").update({ current_creative_version: version, status: "creative_review", creative_approved_version: null, creative_approved_hash: null, creative_approved_at: null, updated_at: new Date().toISOString() }).eq("id", command.workflowId).select().single();
    throwDatabaseError("Could not update workflow", error); return { ...data, creative: { version, contentHash } };
  }

  if (command.action === "approveCreative") {
    const { data, error } = await db.rpc("approve_workflow_creative", { p_workflow_id: command.workflowId, p_version: command.version, p_content_hash: command.contentHash, p_approver: Operator });
    throwDatabaseError("Could not approve creative", error); return data?.[0];
  }

  if (command.action === "saveCampaign") {
    const { data: workflow, error: readError } = await db.from("campaign_workflows").select("creative_approved_version").eq("id", command.workflowId).single();
    throwDatabaseError("Could not verify creative approval", readError); if (!workflow?.creative_approved_version) throw new Error("Approve the creative before configuring the campaign.");
    const { data, error } = await db.from("campaign_workflows").update({ campaign_configuration: command.configuration, campaign_configuration_hash: hash(command.configuration), status: "campaign_review", updated_at: new Date().toISOString() }).eq("id", command.workflowId).select().single();
    throwDatabaseError("Could not save campaign configuration", error); return data;
  }

  const { data, error } = await db.from("campaign_workflows").update({ final_proposal_id: command.proposalId, updated_at: new Date().toISOString() }).eq("id", command.workflowId).eq("status", "campaign_review").select().single();
  throwDatabaseError("Could not attach approved proposal", error); return data;
}

export async function getDemoWorkflow(workflowId: string) {
  const db = createDatabaseClient();
  const [workflow, creatives] = await Promise.all([
    db.from("campaign_workflows").select("*").eq("id", workflowId).single(),
    db.from("creative_versions").select("*").eq("workflow_id", workflowId).order("version", { ascending: true }),
  ]);
  throwDatabaseError("Could not load workflow", workflow.error); throwDatabaseError("Could not load creative history", creatives.error);
  return { workflow: workflow.data, creatives: creatives.data ?? [] };
}

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
