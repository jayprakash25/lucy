# Lucy MVP architecture

Lucy remains one Next.js application. Route handlers accept webhooks; Vercel Workflow runs durable background work; Supabase holds authoritative state and private property media; OpenAI extracts supplied facts and writes copy; deterministic services alone send WhatsApp messages and mutate Meta.

## Request paths

### WhatsApp or Meta webhook

1. Read the raw body once.
2. Verify `X-Hub-Signature-256` before parsing.
3. Validate the provider payload with Zod.
4. Call one Supabase RPC to map the signed channel to a business, deduplicate every provider event, and atomically claim dispatch.
5. Start one durable workflow per new event and return immediately.

Duplicate deliveries cannot repeat processing because only a `dispatching` event can be claimed. A stale dispatch lease can be reclaimed after five minutes.

### Property intake

Lucy stores inbound messages idempotently by WhatsApp message ID. Images are downloaded immediately because provider media URLs expire, validated as JPEG/PNG up to 5 MB, and copied into a private Supabase bucket. Conversation reads are ordered and bounded to 100 messages and 10 images.

The model runs only after the operator replies `DONE`. It produces strict structured output and cannot call publishing tools. Budget, dates, destination, and spend ceilings are deterministic application settings.

### Approval and launch

Each proposal contains its facts, copy, media IDs, targeting country, budget, hard total, and exact schedule. Lucy hashes the immutable content and sends three WhatsApp buttons backed by one random token. The database accepts a decision only while that version is current and unexpired.

Every Meta mutation is guarded again inside the database by a matching approval row and content hash. Lucy then:

1. Creates the campaign paused.
2. Creates the ad set paused.
3. Uploads the first approved property image.
4. Creates the creative.
5. Creates the ad paused.
6. Activates the ad, then ad set, then campaign.
7. Marks the proposal `pending_review` only after all remote IDs are recorded.

Meta does not provide a general idempotency key for these creates. Each operation is journaled before the request. A lost or ambiguous response becomes `uncertain` and stops automatic retries, preventing duplicate campaigns or spend. An operator must reconcile it against Meta before retrying.

## Scale boundary

The database is tenant-scoped by `business_id`; signed channel identities resolve the tenant at ingress; hot paths have status/time and tenant/time indexes; workflows isolate retries; lists are bounded; and normal pages make no provider calls. This topology is suitable for the first 1,000+ operators without a second service.

Split a worker service only after measured concurrency, cost, or platform limits justify it. Multi-business OAuth and encrypted per-business provider tokens are deliberately outside this one-business pilot; the domain tables already preserve the tenant boundary.

## Current deliberate limits

- One manually connected pilot business.
- Authorized operator WhatsApp numbers only.
- Text plus JPEG/PNG property photos; no PDF, voice, video, or generative imagery.
- One image ad from the first approved photo.
- Broad country targeting and Click-to-WhatsApp.
- Meta status webhooks are durably retained; live account fixtures must be verified before mapping every provider-specific status.
- No lead follow-up, optimization, budget increase, pause/resume automation, or self-serve OAuth yet.

## Sources

- [Next.js backend-for-frontend and public route handlers](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Vercel Workflow](https://vercel.com/workflows)
- [OpenAI Responses API](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Meta Marketing API workspace](https://www.postman.com/meta/facebook-marketing-api/overview)
- [WhatsApp Cloud API workspace](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api)
