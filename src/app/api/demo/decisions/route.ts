import { z } from "zod";
import { decideDemoProposal } from "@/services/demo-console";

const DecisionSchema = z.object({ proposalId: z.string().uuid(), workflowId: z.string().uuid().optional(), token: z.string().min(1), action: z.enum(["approve", "change", "cancel"]) });

export async function POST(request: Request) {
  try {
    return Response.json(await decideDemoProposal(DecisionSchema.parse(await request.json())));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not record decision." }, { status: 400 });
  }
}
