import "server-only";

import { z } from "zod";

import { config } from "@/lib/config";
import { AmbiguousMutationError, ExternalServiceError } from "@/lib/errors";

const MetaErrorSchema = z.object({
  error: z.object({ message: z.string().optional(), code: z.number().optional() }).optional(),
});

export async function getMeta<T>(
  path: string,
  query: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = metaUrl(path);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return requestMeta(url, { method: "GET" }, schema, false);
}

export async function postMeta<T>(
  path: string,
  fields: Record<string, unknown> | FormData,
  schema: z.ZodType<T>,
): Promise<T> {
  const body = fields instanceof FormData ? fields : toFormData(fields);
  return requestMeta(metaUrl(path), { method: "POST", body }, schema, true);
}

async function requestMeta<T>(
  url: URL,
  init: RequestInit,
  schema: z.ZodType<T>,
  isMutation: boolean,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${config.metaAccessToken}`, ...init.headers },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network failure";
    if (isMutation) {
      throw new AmbiguousMutationError(`Meta mutation outcome is uncertain: ${message}`, "meta");
    }
    throw new ExternalServiceError(`Could not read Meta data: ${message}`, "meta");
  }

  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const parsedError = MetaErrorSchema.safeParse(body);
    const message = parsedError.success ? parsedError.data.error?.message : undefined;
    const detail = message ?? `Meta returned HTTP ${response.status}`;
    if (isMutation && (response.status === 429 || response.status >= 500)) {
      throw new AmbiguousMutationError(`Meta mutation outcome is uncertain: ${detail}`, "meta", response.status);
    }
    throw new ExternalServiceError(`Meta rejected the request: ${detail}`, "meta", response.status);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = isMutation
      ? "Meta accepted the mutation but returned an invalid response."
      : "Meta returned an invalid response.";
    if (isMutation) {
      throw new AmbiguousMutationError(message, "meta");
    }
    throw new ExternalServiceError(message, "meta");
  }
  return parsed.data;
}

function metaUrl(path: string): URL {
  return new URL(`https://graph.facebook.com/${config.metaGraphVersion}/${path}`);
}

function toFormData(fields: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return form;
}
