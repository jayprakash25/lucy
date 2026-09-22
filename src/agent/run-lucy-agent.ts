import "server-only";

import { DurableAgent } from "@workflow/ai/agent";
import { createGateway, type GatewayModelId } from "ai";
import { getWritable } from "workflow";

import { config } from "@/lib/config";

import { loadLucyConversationContext } from "./conversation-context";
import { AGENT_INSTRUCTIONS } from "./prompt";
import type { LucyToolContext } from "./tool-context";
import { LUCY_TOOLS } from "./tools";

async function createLucyModel() {
  "use step";
  return createGateway({ apiKey: config.aiGatewayApiKey })(config.aiModel as GatewayModelId);
}

export async function runLucyAgent(
  context: LucyToolContext & { processingToken: string },
): Promise<{ replySent: boolean; text: string }> {
  "use workflow";

  const messages = await loadLucyConversationContext(context);

  const agent = new DurableAgent({
    model: createLucyModel,
    instructions: AGENT_INSTRUCTIONS,
    tools: LUCY_TOOLS,
    maxOutputTokens: 350,
  });
  const result = await agent.stream({
    messages,
    writable: getWritable(),
    maxSteps: 6,
    experimental_context: context,
    timeout: 120_000,
  });
  const replySent = result.steps.some((step) =>
    step.toolResults.some((toolResult) => toolResult.toolName === "generate_ad_proposal"),
  );
  const text = result.steps.at(-1)?.text.trim() ?? "";
  return { replySent, text: text || (replySent ? "" : "I couldn't complete that request. Please try again.") };
}
