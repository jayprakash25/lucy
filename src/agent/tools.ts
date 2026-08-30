export const AGENT_TOOL_NAMES = [
  "generate_ad",
  "get_results",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];
