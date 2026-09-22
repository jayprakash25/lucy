# Lucy

Lucy is a WhatsApp-first Meta Ads operator. It understands text, photos, and PDFs; prepares immutable proposals; reports campaign state; and pauses campaigns. Publishing still requires approval of the exact proposal.

## MVP flow

1. An allowlisted operator sends property details, JPEG/PNG photos, and optional PDFs.
2. Lucy loads bounded recent context and calls only the required tools.
3. Lucy drafts factual copy and sends an approval card when the required facts and a photo are ready.
4. A single-use button records approval for the proposal hash.
5. A durable workflow creates the campaign, ad set, creative, and ad paused; activates the campaign last; and records every provider operation.

Lucy uses the configured AI Gateway, WhatsApp Cloud API, Meta Marketing API, and Supabase project. Set `PUBLIC_APP_URL` to a public HTTPS URL when testing inbound webhooks or agent media locally. Publishing still requires an approved proposal.

## Development

1. Copy `.env.example` to `.env.local` and fill in the development provider credentials.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Apply `supabase/migrations` to a development Supabase project.
4. Seed one business, its WhatsApp/Meta channels, and one authorized operator using [the connection checklist](docs/connection-checklist.md).
5. Run `pnpm dev`.

Run `pnpm check` before review. See [architecture](docs/architecture.md) and [connection checklist](docs/connection-checklist.md).
