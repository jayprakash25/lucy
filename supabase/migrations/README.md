# Migrations

Create migrations with the Supabase CLI, review them, and apply them in order. Never edit a migration after it has reached a shared environment.

The initial migration creates the tenant boundary, authorized WhatsApp identities, private media storage, webhook inbox, immutable proposals, approvals, operation journal, and audit trail. Every public table has RLS enabled and only `service_role` receives table access in the MVP.
