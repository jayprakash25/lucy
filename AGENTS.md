# Lucy agent instructions

Lucy is a WhatsApp-first Meta Ads operator for real-estate businesses.

## Rules

- Keep one Next.js application until scale proves a separate service is necessary.
- Keep credentials in `src/lib/config.ts`; never read environment variables elsewhere.
- Keep provider calls in `src/services`.
- Keep agent reasoning separate from deterministic tools.
- Never publish, increase spend, or resume an ad without an explicit recorded approval.
- Make webhook and Meta mutation handling idempotent.
- Validate external payloads at their entry boundary.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
