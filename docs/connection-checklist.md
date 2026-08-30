# Connect Lucy to real services

Complete this only after the mock flow and migration pass in a development environment. Keep `PROVIDER_MODE=mock` until the final controlled test.

## 1. Supabase

1. Create a development project in the closest region to the pilot business.
2. Apply `supabase/migrations/20260829173338_initial_lucy_mvp.sql`.
3. Confirm every public table has RLS enabled, `anon` and `authenticated` have no grants, and the `property-media` bucket is private.
4. Put the project URL and server-only secret key in Vercel. Never expose the secret key to the browser.
5. Seed the pilot:

```sql
insert into public.businesses (
  slug, name, maximum_daily_budget_minor, maximum_total_budget_minor
) values (
  'pilot', 'Pilot Realty', 500000, 3500000
) returning id;

insert into public.channel_identities (business_id, provider, external_id, label)
values
  ('<business-id>', 'whatsapp', '<whatsapp-phone-number-id>', 'Lucy WhatsApp'),
  ('<business-id>', 'meta', '<ad-account-webhook-entry-id>', 'Pilot ad account');

insert into public.operator_identities (
  business_id, provider, external_id, display_name, role
) values (
  '<business-id>', 'whatsapp', '<operator-e164-number>', '<operator-name>', 'owner'
);
```

Run Supabase security and performance advisors after applying the migration. Official guidance: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), and [Data API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## 2. Meta business assets

Prepare one customer-owned Business Portfolio with:

- A funded ad account.
- A Facebook Page.
- A WhatsApp Business Account and registered production phone number.
- The WhatsApp number linked to the Page for Click-to-WhatsApp ads.
- A Meta developer app with Marketing API and WhatsApp products.
- A system user assigned to the ad account, Page, and WABA.

For the pilot, use a server-side system-user token. Required access is expected to include `ads_management`, `ads_read`, `whatsapp_business_management`, and `whatsapp_business_messaging`; add `business_management` only for portfolio operations that require it. Re-check these in the live Meta UI because asset assignments and access levels determine effective permission.

Lucy declares the Housing special-ad category and uses broad country targeting. Confirm the live account accepts the objective, destination, optimization goal, and housing restrictions before enabling live mode. Official references: [Marketing API](https://www.postman.com/meta/facebook-marketing-api/overview), [Click-to-WhatsApp ads](https://developers.facebook.com/docs/marketing-api/ad-creative/messaging-ads/click-to-whatsapp/), and [Special Ad Category](https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category/).

## 3. WhatsApp Cloud API

1. Verify and register the production number with a two-step-verification PIN.
2. Subscribe the app to the WABA.
3. Configure `https://<lucy-domain>/api/whatsapp/webhook` with the chosen verify token.
4. Subscribe to `messages` and verify text, image, interactive button, and status fixtures.
5. Create an approved utility template for reminders that may fall outside the 24-hour customer-service window; Lucy does not send those reminders yet.
6. Confirm the webhook receives the phone number ID used in `channel_identities`.

Official setup and payload examples are in Meta’s [WhatsApp Cloud API workspace](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api).

## 4. Meta ad status webhook

Configure `https://<lucy-domain>/api/meta/webhook` and subscribe the ad account to the supported ad status fields. Store the exact live payload fixtures in tests before mapping them to proposal states. Use `effective_status`, not only writable `status`, when adding reconciliation. Official reference: [Ad object](https://developers.facebook.com/docs/marketing-api/reference/adgroup/).

## 5. OpenAI

1. Create a restricted project API key with usage limits.
2. Select a current model that supports the Responses API and Structured Outputs; put its exact ID in `OPENAI_MODEL`.
3. Set `OPENAI_API_KEY` only in server-side Vercel environment variables.
4. Keep `store: false`; log request IDs, latency, token usage, model, and outcome—not property messages, photos, prompts, or credentials.

Lucy uses strict structured output; the model never executes the Meta mutation. Official references: [Responses API](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## 6. Vercel

1. Connect the repository to one Vercel project.
2. Add all variables from `.env.example` separately for development, preview, and production.
3. Generate `APPROVAL_HMAC_SECRET` with at least 32 random bytes.
4. Deploy with the lockfile. Workflow needs no separate worker on Vercel.
5. Confirm workflow runs and step failures are visible in the Vercel dashboard.

Official reference: [Vercel Workflow](https://vercel.com/workflows).

## 7. Controlled activation test

1. Keep `PROVIDER_MODE=mock`; send a complete property and verify proposal versioning, missing-field handling, supersession, and approval records.
2. Test invalid signatures, duplicate webhook delivery, repeated button delivery, expired approval, edited proposal, unauthorized sender, and spend-limit rejection.
3. Switch a development deployment to `PROVIDER_MODE=live` using a Meta sandbox ad account. Confirm the four objects are created paused and remote IDs are journaled.
4. Revert to mock if any operation is `uncertain`; reconcile it manually before another attempt.
5. Run one real-account test with an explicitly approved, tiny hard-capped budget. Sandbox accounts cannot prove billing, auction delivery, review behavior, or end-to-end WhatsApp referrals.
6. Verify Meta review status, real Click-to-WhatsApp referral data, WhatsApp delivery receipts, database audit history, and the hard spend ceiling.

Do not add self-serve OAuth until this controlled path is reliable. Managing customer businesses requires Advanced Access/App Review and business verification.
