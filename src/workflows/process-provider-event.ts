import { sleep } from "workflow";

import { runLucyAgent } from "@/agent/run-lucy-agent";

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
import { completeProviderEvent, failProviderEvent, renewProviderEventLease } from "./steps/finish-provider-event";
import { prepareProviderEvent } from "./steps/prepare-provider-event";
import { recordProposalDecisionStep } from "./steps/record-proposal-decision";
import { sendWhatsAppTextBestEffortStep, sendWhatsAppTextStep } from "./steps/send-whatsapp";
import { storePropertyMedia } from "./steps/store-property-media";

export async function processProviderEventWorkflow(eventId: string, processingToken: string): Promise<{ status: string }> {
  "use workflow";

  let failureContext: (ReturnType<typeof sendContext> & { sourceEventId: string }) | null = null;
  try {
    let event = await prepareProviderEvent(eventId, processingToken);
    for (let attempt = 0; event.kind === "deferred" && attempt < 60; attempt += 1) {
      await sleep(`${Math.min(10, 2 ** attempt)}s`);
      event = await prepareProviderEvent(eventId, processingToken);
    }
    if (event.kind === "deferred") throw new Error("This chat remained busy for ten minutes.");
    if (event.kind === "duplicate") {
      return { status: "duplicate" };
    }
    if ("businessId" in event) {
      failureContext = { ...sendContext(event), sourceEventId: event.sourceEventId };
    }

    if (event.kind === "meta" || event.kind === "status") {
      await completeProviderEvent(eventId, processingToken);
      return { status: "completed" };
    }

    if (event.kind === "media") {
      await storePropertyMedia(event);
      await renewProviderEventLease(eventId, processingToken);
      await sendWhatsAppTextBestEffortStep({
        ...sendContext(event),
        proposalId: null,
        operationKey: `event:${event.sourceEventId}:media-saved`,
        text: "Media saved.",
      });
    }

    if (event.kind === "agent") {
      const result = await runLucyAgent({
        ...sendContext(event),
        sourceEventId: event.sourceEventId,
        currentText: event.currentText,
        processingToken,
      });
      await renewProviderEventLease(eventId, processingToken);
      if (!result.replySent && result.text) {
        await sendWhatsAppTextStep({
          ...sendContext(event),
          proposalId: null,
          operationKey: `event:${event.sourceEventId}:agent-reply`,
          text: result.text,
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
      await renewProviderEventLease(eventId, processingToken);

      if (event.action === "approve") {
        if (!["pending_review", "active", "paused"].includes(decision.status)) {
          const launch = await prepareMetaLaunch(decision.proposalId);
          const campaignId = await createMetaCampaignStep(launch);
          await renewProviderEventLease(eventId, processingToken);
          const adSetId = await createMetaAdSetStep(launch, campaignId);
          await renewProviderEventLease(eventId, processingToken);
          const imageHash = await uploadMetaImageStep(launch);
          await renewProviderEventLease(eventId, processingToken);
          const creativeId = await createMetaCreativeStep(launch, imageHash);
          await renewProviderEventLease(eventId, processingToken);
          const adId = await createMetaAdStep(launch, adSetId, creativeId);
          await renewProviderEventLease(eventId, processingToken);

          await activateMetaObjectStep(launch, "ad", adId);
          await renewProviderEventLease(eventId, processingToken);
          await activateMetaObjectStep(launch, "ad-set", adSetId);
          await renewProviderEventLease(eventId, processingToken);
          await activateMetaObjectStep(launch, "campaign", campaignId);
          await completeMetaLaunchStep(decision.proposalId, { campaignId, adSetId, creativeId, adId });
        }
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

    await completeProviderEvent(eventId, processingToken);
    return { status: "completed" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown workflow failure";
    await failProviderEvent(eventId, processingToken, reason);
    if (failureContext) {
      await sendWhatsAppTextBestEffortStep({
        ...failureContext,
        proposalId: null,
        operationKey: `event:${failureContext.sourceEventId}:failure`,
        text: "I couldn't complete or verify that request. Nothing unconfirmed will be retried automatically.",
      });
    }
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
