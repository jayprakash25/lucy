import "server-only";

import {
  claimProviderOperation,
  completeProviderOperation,
  failProviderOperation,
} from "@/db/provider-operation-queries";
import { AmbiguousMutationError, ExternalServiceError } from "@/lib/errors";

export async function executeProviderMutation(input: {
  businessId: string;
  proposalId: string | null;
  provider: "meta" | "whatsapp";
  operationKey: string;
  operationType: string;
  requestSummary: Record<string, unknown>;
  mutate: () => Promise<{ remoteId: string; responseSummary?: Record<string, unknown> }>;
}): Promise<string> {
  const operation = await claimProviderOperation(input);

  if (!operation.shouldExecute) {
    if (operation.status === "succeeded" && operation.remoteId) {
      return operation.remoteId;
    }

    throw new AmbiguousMutationError(
      `The ${input.operationType} operation was already started and requires reconciliation.`,
      input.provider,
    );
  }

  try {
    const result = await input.mutate();
    await completeProviderOperation(operation.id, result.remoteId, result.responseSummary ?? {});
    return result.remoteId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error";
    const status = error instanceof AmbiguousMutationError ? "uncertain" : "failed";
    await failProviderOperation(operation.id, status, message);

    if (error instanceof ExternalServiceError) {
      throw error;
    }

    throw new ExternalServiceError(message, input.provider);
  }
}
