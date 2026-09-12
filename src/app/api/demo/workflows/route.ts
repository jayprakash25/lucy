import { z } from "zod";
import { executeDemoWorkflowCommand, getDemoWorkflow } from "@/services/demo-workflow";

export async function POST(request: Request) {
  try { return Response.json(await executeDemoWorkflowCommand(await request.json())); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Workflow command failed." }, { status: 400 }); }
}

export async function GET(request: Request) {
  try { const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id")); return Response.json(await getDemoWorkflow(id)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Workflow could not be loaded." }, { status: 400 }); }
}
