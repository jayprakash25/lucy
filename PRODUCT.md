# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Real-estate business owners and authorized operators who assemble property ads from supplied facts and photos.

## Product Purpose

Lucy turns verified property details and photos into an immutable Meta ad proposal, requires explicit approval of that exact version, and only then creates the advertising objects.

## Positioning

Lucy makes approval a database-enforced safety boundary rather than a conversational suggestion: the approved content hash, media, schedule, and spend ceiling must match the version being published.

## Operating Context

The live operator experience is WhatsApp-first. A browser demo console is also available for safe mock-mode testing and operational inspection. Supabase is the authoritative store for conversations, private media, proposals, approvals, provider operations, and audit events.

## Capabilities and Constraints

- One manually connected pilot business and authorized operators.
- Text plus JPEG/PNG property photos, one-image Click-to-WhatsApp housing ads, broad country targeting.
- OpenAI drafts from supplied facts in live mode; deterministic drafting in mock mode.
- No publishing, resuming, or increased spend without recorded approval.
- The demo console is available only in mock provider mode and creates no real ads or spend.
- No self-serve OAuth, lead follow-up, optimization, or multi-creative campaigns yet.

## Brand Commitments

The product is named Lucy. Its voice is calm, factual, safety-conscious, and concise. The existing warm editorial visual identity and property imagery remain the incumbent system.

## Evidence on Hand

- Working signed webhook ingestion and durable workflow.
- Supabase migration and private `property-media` bucket.
- Passing tests for signatures, deduplication inputs, proposal limits, previews, and approval tokens.
- Existing landing page and property hero asset under `public/images`.

## Product Principles

- Exact approval before external action.
- Supplied facts only; missing information is requested, never invented.
- Safe ambiguity: uncertain provider mutations stop instead of retrying blindly.
- Operators can see what happened and why.
- Mock testing must never create real provider effects.

