import "server-only";

import { getMediaBytes } from "@/db/conversation-queries";
import {
  getApprovedProposalForMutation,
  markProposalPendingReview,
  markProposalPublishing,
} from "@/db/proposal-queries";
import { assertSpendWithinLimits, type AdProposalContent } from "@/domain/ad-proposal";
import { config } from "@/lib/config";
import {
  activateMetaObject,
  createAdCreative,
  createPausedAd,
  createPausedAdSet,
  createPausedCampaign,
  uploadAdImage,
} from "@/services/meta";
import { executeProviderMutation } from "@/services/provider-operation";

export type ApprovedLaunch = {
  businessId: string;
  content: AdProposalContent;
  proposalId: string;
};

export async function prepareMetaLaunch(proposalId: string): Promise<ApprovedLaunch> {
  "use step";

  const proposal = await getApprovedProposalForMutation(proposalId);
  assertSpendWithinLimits(
    proposal.content.campaign,
    config.maximumDailyBudgetMinor,
    config.maximumTotalBudgetMinor,
  );
  await markProposalPublishing(proposalId);

  return { proposalId, businessId: proposal.businessId, content: proposal.content };
}

export async function createMetaCampaignStep(launch: ApprovedLaunch): Promise<string> {
  "use step";

  return runMetaCreate(launch, "campaign", { status: "PAUSED" }, () =>
    createPausedCampaign({ name: campaignName(launch.content, "Campaign") }),
  );
}

createMetaCampaignStep.maxRetries = 0;

export async function createMetaAdSetStep(launch: ApprovedLaunch, campaignId: string): Promise<string> {
  "use step";

  return runMetaCreate(launch, "ad-set", { campaignId, status: "PAUSED" }, () =>
    createPausedAdSet({
      campaignId,
      name: campaignName(launch.content, "Ad set"),
      campaign: launch.content.campaign,
    }),
  );
}

createMetaAdSetStep.maxRetries = 0;

export async function uploadMetaImageStep(launch: ApprovedLaunch): Promise<string> {
  "use step";

  const mediaAssetId = launch.content.creativeMediaAssetId;
  const image = await getMediaBytes(mediaAssetId, launch.businessId);
  if (image.mimeType !== "image/jpeg" && image.mimeType !== "image/png") {
    throw new Error("The approved ad creative is not a publishable JPEG or PNG image.");
  }

  return runMetaCreate(launch, "image", { mediaAssetId }, () => uploadAdImage(image));
}

uploadMetaImageStep.maxRetries = 0;

export async function createMetaCreativeStep(launch: ApprovedLaunch, imageHash: string): Promise<string> {
  "use step";

  return runMetaCreate(launch, "creative", { imageHash }, () =>
    createAdCreative({ imageHash, content: launch.content }),
  );
}

createMetaCreativeStep.maxRetries = 0;

export async function createMetaAdStep(
  launch: ApprovedLaunch,
  adSetId: string,
  creativeId: string,
): Promise<string> {
  "use step";

  return runMetaCreate(launch, "ad", { adSetId, creativeId, status: "PAUSED" }, () =>
    createPausedAd({ adSetId, creativeId, name: campaignName(launch.content, "Ad") }),
  );
}

createMetaAdStep.maxRetries = 0;

export async function activateMetaObjectStep(
  launch: ApprovedLaunch,
  objectType: "ad" | "ad-set" | "campaign",
  objectId: string,
): Promise<string> {
  "use step";

  return runMetaCreate(launch, `activate-${objectType}`, { objectId, status: "ACTIVE" }, () =>
    activateMetaObject(objectId),
  );
}

activateMetaObjectStep.maxRetries = 0;

export async function completeMetaLaunchStep(
  proposalId: string,
  ids: { campaignId: string; adSetId: string; creativeId: string; adId: string },
): Promise<void> {
  "use step";

  await markProposalPendingReview(proposalId, ids);
}

async function runMetaCreate(
  launch: ApprovedLaunch,
  operationType: string,
  requestSummary: Record<string, unknown>,
  mutate: () => Promise<string>,
): Promise<string> {
  return executeProviderMutation({
    businessId: launch.businessId,
    proposalId: launch.proposalId,
    provider: "meta",
    operationKey: `proposal:${launch.proposalId}:${operationType}`,
    operationType,
    requestSummary,
    mutate: async () => ({ remoteId: await mutate() }),
  });
}

function campaignName(content: AdProposalContent, suffix: string): string {
  return `Lucy | ${content.property.projectName} | ${suffix}`.slice(0, 255);
}
