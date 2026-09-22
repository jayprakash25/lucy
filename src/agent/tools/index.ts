import { explainLastFailureTool } from "./explain-last-failure";
import { generateAdProposalTool } from "./generate-ad-proposal";
import { getCampaignResultsTool } from "./get-campaign-results";
import { getCampaignStatusTool } from "./get-campaign-status";
import { listCampaignsTool } from "./list-campaigns";
import { pauseCampaignTool } from "./pause-campaign";

export const AGENT_TOOL_NAMES = [
  "generate_ad_proposal",
  "list_campaigns",
  "get_campaign_status",
  "get_campaign_results",
  "pause_campaign",
  "explain_last_failure",
] as const;

export const LUCY_TOOLS = {
  generate_ad_proposal: generateAdProposalTool,
  list_campaigns: listCampaignsTool,
  get_campaign_status: getCampaignStatusTool,
  get_campaign_results: getCampaignResultsTool,
  pause_campaign: pauseCampaignTool,
  explain_last_failure: explainLastFailureTool,
};
