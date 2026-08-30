export class ExternalServiceError extends Error {
  override readonly name: string = "ExternalServiceError";

  constructor(
    message: string,
    readonly provider: "meta" | "openai" | "whatsapp",
    readonly statusCode?: number,
  ) {
    super(message);
  }
}

export class AmbiguousMutationError extends ExternalServiceError {
  override readonly name: string = "AmbiguousMutationError";
}

export class InvalidWebhookError extends Error {
  override readonly name = "InvalidWebhookError";

  constructor(
    message: string,
    readonly statusCode: 400 | 401 | 422,
  ) {
    super(message);
  }
}
