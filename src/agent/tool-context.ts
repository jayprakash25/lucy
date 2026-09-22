import { z } from "zod";

export const LucyToolContextSchema = z.object({
  businessId: z.string().uuid(),
  conversationId: z.string().uuid(),
  recipient: z.string().min(1),
  sourceEventId: z.string().uuid(),
  currentText: z.string().nullable(),
});

export type LucyToolContext = z.infer<typeof LucyToolContextSchema>;

export function readLucyToolContext(options: { experimental_context?: unknown }): LucyToolContext {
  return LucyToolContextSchema.parse(options.experimental_context);
}
