# Lucy

Lucy turns verified property details and photos from WhatsApp into an immutable Meta ad proposal. An authorized operator must approve that exact version before Lucy creates or activates any Meta object.

## MVP flow

1. An allowlisted operator sends labeled property details and JPEG/PNG photos.
2. The operator replies `DONE`.
3. Lucy extracts supplied facts, drafts factual copy, and sends an approval card.
4. A single-use button records approval for the proposal hash.
5. A durable workflow creates the campaign, ad set, creative, and ad paused; activates the campaign last; and records every provider operation.

`PROVIDER_MODE=mock` keeps OpenAI, WhatsApp sending, and Meta mutations local-safe. Supabase is still required because approvals and idempotency depend on durable database truth.

## Development

1. Copy `.env.example` to `.env.local`.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Apply `supabase/migrations` to a development Supabase project.
4. Seed one business, its WhatsApp/Meta channels, and one authorized operator using [the connection checklist](docs/connection-checklist.md).
5. Run `pnpm dev`.

Run `pnpm check` before review. See [architecture](docs/architecture.md) and [connection checklist](docs/connection-checklist.md).
