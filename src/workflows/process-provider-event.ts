import {
  activateMetaObjectStep,
  completeMetaLaunchStep,
  createMetaAdSetStep,
  createMetaAdStep,
  createMetaCampaignStep,
  createMetaCreativeStep,
  prepareMetaLaunch,
  uploadMetaImageStep,
} from "./steps/launch-meta-ad";
import { buildAdProposal } from "./steps/build-ad-proposal";
import { completeProviderEvent, failProviderEvent } from "./steps/finish-provider-event";
import { prepareProviderEvent } from "./steps/prepare-provider-event";
import { recordProposalDecisionStep } from "./steps/record-proposal-decision";
import { sendWhatsAppApprovalStep, sendWhatsAppTextStep } from "./steps/send-whatsapp";
import { storePropertyImage } from "./steps/store-property-image";

export async function processProviderEventWorkflow(eventId: string): Promise<{ status: string }> {
  "use workflow";

  try {
    const event = await prepareProviderEvent(eventId);
    if (event.kind === "duplicate") {
      return { status: "duplicate" };
    }

    if (event.kind === "meta" || event.kind === "status") {
      await completeProviderEvent(eventId);
      return { status: "completed" };
    }

    if (event.kind === "image") {
      await storePropertyImage(event);
      await sendWhatsAppTextStep({
        ...sendContext(event),
        proposalId: null,
        operationKey: `event:${event.sourceEventId}:image-saved`,
        text: "Photo saved. Send more details or photos, then reply DONE.",
      });
    }

    if (event.kind === "acknowledge") {
      await sendWhatsAppTextStep({
        ...sendContext(event),
        proposalId: null,
        operationKey: `event:${event.sourceEventId}:acknowledge`,
        text: "Saved. Send more details or photos, then reply DONE.",
      });
    }

    if (event.kind === "draft") {
      const result = await buildAdProposal(event);
      if (result.kind === "missing") {
        await sendWhatsAppTextStep({
          ...sendContext(event),
          proposalId: null,
          operationKey: `event:${event.sourceEventId}:missing-fields`,
          text: result.message,
        });
      } else {
        await sendWhatsAppApprovalStep({
          ...sendContext(event),
          proposalId: result.proposalId,
          operationKey: `proposal:${result.proposalId}:approval-preview`,
          text: result.preview,
          token: result.token,
        });
      }
    }

    if (event.kind === "proposal-decision") {
      const decision = await recordProposalDecisionStep({
        action: event.action,
        approvalToken: event.approvalToken,
        businessId: event.businessId,
        approverExternalId: event.recipient,
        sourceMessageId: event.sourceMessageId,
      });

      if (event.action === "approve") {
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
        await sendWhatsAppTextStep({
          ...sendContext(event),
          proposalId: decision.proposalId,
          operationKey: `proposal:${decision.proposalId}:submitted`,
          text: "Submitted to Meta. The campaign is pending review; check Ads Manager for verified delivery status.",
        });
      } else {
        await sendWhatsAppTextStep({
          ...sendContext(event),
          proposalId: decision.proposalId,
          operationKey: `proposal:${decision.proposalId}:${event.action}-confirmed`,
          text:
            event.action === "change"
              ? "Changes requested. Send the corrected facts or photos, then reply DONE for a new version."
              : "Cancelled. Nothing was published.",
        });
      }
    }

    await completeProviderEvent(eventId);
    return { status: "completed" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown workflow failure";
    await failProviderEvent(eventId, reason);
    throw error;
  }
}

function sendContext(event: { businessId: string; conversationId: string; recipient: string }) {
  return {
    businessId: event.businessId,
    conversationId: event.conversationId,
    recipient: event.recipient,
  };
}
