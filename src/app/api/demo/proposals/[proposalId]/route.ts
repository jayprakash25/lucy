import { getDemoProposalState } from "@/services/demo-console";

export async function GET(_request: Request, context: RouteContext<"/api/demo/proposals/[proposalId]">) {
  try {
    const { proposalId } = await context.params;
    return Response.json(await getDemoProposalState(proposalId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load proposal." }, { status: 400 });
  }
}
