import { createDemoProposal } from "@/services/demo-console";

export async function POST(request: Request) {
  try {
    return Response.json(await createDemoProposal(await request.formData()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create proposal." }, { status: 400 });
  }
}
