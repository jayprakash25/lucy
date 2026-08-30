import "server-only";

import { createDatabaseClient } from "./client";
import { throwDatabaseError } from "./database-error";

export type ClaimedProviderOperation = {
  id: string;
  remoteId: string | null;
  shouldExecute: boolean;
  status: "failed" | "started" | "succeeded" | "uncertain";
};

export async function claimProviderOperation(input: {
  businessId: string;
  proposalId: string | null;
  provider: "meta" | "whatsapp";
  operationKey: string;
  operationType: string;
  requestSummary: Record<string, unknown>;
}): Promise<ClaimedProviderOperation> {
  const database = createDatabaseClient();
  const { data, error } = await database.rpc("claim_provider_operation", {
    p_business_id: input.businessId,
    p_proposal_id: input.proposalId,
    p_provider: input.provider,
    p_operation_key: input.operationKey,
    p_operation_type: input.operationType,
    p_request_summary: input.requestSummary,
  });
  throwDatabaseError("Could not claim provider operation", error);

  const row = ((data ?? []) as Array<{
    operation_id: string;
    operation_status: ClaimedProviderOperation["status"];
    remote_id: string | null;
    should_execute: boolean;
  }>)[0];
  if (!row) {
    throw new Error("Could not claim provider operation: no row returned.");
  }

  return {
    id: row.operation_id,
    status: row.operation_status,
    remoteId: row.remote_id,
    shouldExecute: row.should_execute,
  };
}

export async function completeProviderOperation(
  operationId: string,
  remoteId: string,
  responseSummary: Record<string, unknown>,
): Promise<void> {
  await updateProviderOperation(operationId, {
    status: "succeeded",
    remote_id: remoteId,
    response_summary: responseSummary,
    completed_at: new Date().toISOString(),
  });
}

export async function failProviderOperation(
  operationId: string,
  status: "failed" | "uncertain",
  reason: string,
): Promise<void> {
  await updateProviderOperation(operationId, { status, last_error: reason, completed_at: new Date().toISOString() });
}

async function updateProviderOperation(operationId: string, values: Record<string, unknown>): Promise<void> {
  const database = createDatabaseClient();
  const { error } = await database
    .from("provider_operations")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", operationId);
  throwDatabaseError("Could not update provider operation", error);
}
