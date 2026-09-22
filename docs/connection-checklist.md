# Connect Lucy to real services

Use development credentials and verify the migrations before connecting a pilot business. The application makes real provider calls when configured.

## 1. Supabase

1. Create a development project in the closest region to the pilot business.
2. Apply both migrations in `supabase/migrations` in timestamp order.
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

Lucy declares the Housing special-ad category and uses broad country targeting. Confirm the connected account accepts the objective, destination, optimization goal, and housing restrictions before an approved launch. Official references: [Marketing API](https://www.postman.com/meta/facebook-marketing-api/overview), [Click-to-WhatsApp ads](https://developers.facebook.com/docs/marketing-api/ad-creative/messaging-ads/click-to-whatsapp/), and [Special Ad Category](https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category/).

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

## 5. AI Gateway

1. Create an AI Gateway key with usage limits.
2. Set `AI_GATEWAY_API_KEY` and a supported `AI_MODEL` in server-side environment variables.
3. Verify a real agent response before testing proposal creation.

Lucy uses Zod-validated durable tools. The model has no publishing, resume, edit, or spend-change tool; Meta mutations remain database-guarded. Official references: [Workflow durable agents](https://useworkflow.dev/docs/ai) and [AI SDK agents](https://ai-sdk.dev/docs/agents/overview).

## 6. Vercel

1. Connect the repository to one Vercel project.
2. Add all variables from `.env.example` separately for development, preview, and production.
3. Generate `APPROVAL_HMAC_SECRET` with at least 32 random bytes.
4. Deploy with the lockfile. Workflow needs no separate worker on Vercel.
5. Confirm workflow runs and step failures are visible in the Vercel dashboard.

Official reference: [Vercel Workflow](https://vercel.com/workflows).

## 7. Controlled activation test

1. Run the local tests, then connect a development Supabase project and a WhatsApp test number to a public HTTPS callback.
2. Send property details and a photo from an authorized number; verify the real agent reply, proposal versioning, and approval message without approving it.
3. Test invalid signatures, duplicate webhook delivery, repeated button delivery, expired approval, edited proposal, unauthorized sender, and spend-limit rejection.
4. For an approved launch test, use a Meta sandbox ad account where supported. Confirm the objects are created paused before activation and remote IDs are journaled.
5. If an operation is `uncertain`, reconcile it manually against Meta before another attempt.
6. Run one real-account test only with an explicitly approved, tiny hard-capped budget. Verify review status, delivery receipts, audit history, and the spend ceiling. Sandbox accounts cannot prove billing or auction delivery.

Do not add self-serve OAuth until this controlled path is reliable. Managing customer businesses requires Advanced Access/App Review and business verification.
