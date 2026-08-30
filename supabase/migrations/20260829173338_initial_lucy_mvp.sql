create extension if not exists pgcrypto with schema extensions;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR' check (char_length(currency) = 3),
  maximum_daily_budget_minor bigint not null check (maximum_daily_budget_minor > 0),
  maximum_total_budget_minor bigint not null check (maximum_total_budget_minor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.channel_identities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('meta', 'whatsapp')),
  external_id text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table public.operator_identities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider = 'whatsapp'),
  external_id text not null,
  display_name text not null,
  role text not null check (role in ('owner', 'operator')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, provider, external_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider = 'whatsapp'),
  external_contact_id text not null,
  last_message_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, external_contact_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  provider text not null check (provider = 'whatsapp'),
  external_message_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null,
  text_content text,
  delivery_status text,
  occurred_at timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, external_message_id)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  provider_media_id text not null,
  mime_type text not null,
  sha256 text,
  byte_size bigint not null check (byte_size > 0),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  unique (business_id, provider_media_id)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('meta', 'whatsapp')),
  channel_external_id text not null,
  external_event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'dispatching', 'processing', 'completed', 'failed')),
  workflow_run_id text,
  receive_count integer not null default 1 check (receive_count > 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create table public.ad_proposal_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('awaiting_approval', 'approved', 'changes_requested', 'cancelled', 'superseded', 'publishing', 'pending_review', 'active', 'rejected', 'failed')),
  content jsonb not null,
  content_hash text not null,
  approval_token_hash text not null unique,
  approval_expires_at timestamptz not null,
  meta_campaign_id text,
  meta_ad_set_id text,
  meta_creative_id text,
  meta_ad_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, version)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  proposal_id uuid not null unique references public.ad_proposal_versions(id) on delete cascade,
  proposal_content_hash text not null,
  approver_external_id text not null,
  source_external_message_id text not null unique,
  approved_at timestamptz not null default now()
);

create table public.provider_operations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  proposal_id uuid references public.ad_proposal_versions(id) on delete cascade,
  provider text not null check (provider in ('meta', 'whatsapp')),
  operation_key text not null,
  operation_type text not null,
  status text not null check (status in ('started', 'succeeded', 'failed', 'uncertain')),
  remote_id text,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider, operation_key)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_type text not null check (actor_type in ('system', 'operator', 'provider')),
  actor_external_id text,
  event_type text not null,
  subject_type text not null,
  subject_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index webhook_events_status_updated_idx on public.webhook_events (status, updated_at);
create index messages_conversation_occurred_idx on public.messages (conversation_id, occurred_at desc);
create index media_assets_conversation_idx on public.media_assets (conversation_id, created_at);
create index ad_proposals_business_status_idx on public.ad_proposal_versions (business_id, status, created_at desc);
create index provider_operations_status_idx on public.provider_operations (status, updated_at);
create index audit_events_business_created_idx on public.audit_events (business_id, created_at desc);

alter table public.businesses enable row level security;
alter table public.channel_identities enable row level security;
alter table public.operator_identities enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.media_assets enable row level security;
alter table public.webhook_events enable row level security;
alter table public.ad_proposal_versions enable row level security;
alter table public.approvals enable row level security;
alter table public.provider_operations enable row level security;
alter table public.audit_events enable row level security;

revoke all on table
  public.businesses,
  public.channel_identities,
  public.operator_identities,
  public.conversations,
  public.messages,
  public.media_assets,
  public.webhook_events,
  public.ad_proposal_versions,
  public.approvals,
  public.provider_operations,
  public.audit_events
from anon, authenticated;

grant select, insert, update, delete on table
  public.businesses,
  public.channel_identities,
  public.operator_identities,
  public.conversations,
  public.messages,
  public.media_assets,
  public.webhook_events,
  public.ad_proposal_versions,
  public.approvals,
  public.provider_operations,
  public.audit_events
to service_role;

grant usage, select on sequence public.audit_events_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-media', 'property-media', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.ingest_webhook_events(p_events jsonb)
returns table (event_id uuid, should_start boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  matched_business_id uuid;
  existing public.webhook_events%rowtype;
begin
  for item in select value from jsonb_array_elements(p_events)
  loop
    select identity.business_id
      into matched_business_id
      from public.channel_identities as identity
     where identity.provider = item->>'provider'
       and identity.external_id = item->>'channel_external_id';

    if matched_business_id is null then
      raise exception 'No business is linked to channel %/%', item->>'provider', item->>'channel_external_id'
        using errcode = '23503';
    end if;

    insert into public.webhook_events (
      business_id,
      provider,
      channel_external_id,
      external_event_id,
      event_type,
      occurred_at,
      payload,
      status
    ) values (
      matched_business_id,
      item->>'provider',
      item->>'channel_external_id',
      item->>'external_event_id',
      item->>'event_type',
      (item->>'occurred_at')::timestamptz,
      item->'payload',
      'dispatching'
    )
    on conflict (provider, external_event_id) do nothing
    returning * into existing;

    if existing.id is not null then
      event_id := existing.id;
      should_start := true;
      return next;
      existing := null;
      continue;
    end if;

    select *
      into existing
      from public.webhook_events
     where provider = item->>'provider'
       and external_event_id = item->>'external_event_id'
     for update;

    update public.webhook_events
       set receive_count = receive_count + 1,
           updated_at = now()
     where id = existing.id;

    event_id := existing.id;
    should_start := existing.status in ('received', 'failed')
      or (existing.status = 'dispatching' and existing.updated_at < now() - interval '5 minutes');

    if should_start then
      update public.webhook_events
         set status = 'dispatching',
             last_error = null,
             updated_at = now()
       where id = existing.id;
    end if;

    return next;
    existing := null;
  end loop;
end;
$$;

create or replace function public.claim_webhook_event(p_event_id uuid)
returns setof public.webhook_events
language sql
security invoker
set search_path = ''
as $$
  update public.webhook_events
     set status = 'processing',
         updated_at = now()
   where id = p_event_id
     and status = 'dispatching'
  returning *;
$$;

create or replace function public.record_inbound_whatsapp_message(
  p_business_id uuid,
  p_external_contact_id text,
  p_external_message_id text,
  p_message_type text,
  p_text_content text,
  p_occurred_at timestamptz,
  p_raw_payload jsonb
)
returns table (message_id uuid, conversation_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stored_conversation_id uuid;
begin
  if not exists (
    select 1
      from public.operator_identities as operator
     where operator.business_id = p_business_id
       and operator.provider = 'whatsapp'
       and operator.external_id = p_external_contact_id
       and operator.active
  ) then
    raise exception 'WhatsApp sender is not an authorized operator' using errcode = '42501';
  end if;

  insert into public.conversations (
    business_id,
    provider,
    external_contact_id,
    last_message_at,
    updated_at
  ) values (
    p_business_id,
    'whatsapp',
    p_external_contact_id,
    p_occurred_at,
    now()
  )
  on conflict (business_id, provider, external_contact_id) do update
    set last_message_at = greatest(public.conversations.last_message_at, excluded.last_message_at),
        updated_at = now()
  returning id into stored_conversation_id;

  insert into public.messages (
    business_id,
    conversation_id,
    provider,
    external_message_id,
    direction,
    message_type,
    text_content,
    occurred_at,
    raw_payload
  ) values (
    p_business_id,
    stored_conversation_id,
    'whatsapp',
    p_external_message_id,
    'inbound',
    p_message_type,
    p_text_content,
    p_occurred_at,
    p_raw_payload
  )
  on conflict (provider, external_message_id) do nothing
  returning id into message_id;

  if message_id is null then
    select message.id, message.conversation_id
      into message_id, stored_conversation_id
      from public.messages as message
     where message.provider = 'whatsapp'
       and message.external_message_id = p_external_message_id
       and message.business_id = p_business_id;
  end if;

  conversation_id := stored_conversation_id;
  return next;
end;
$$;

create or replace function public.create_ad_proposal_version(
  p_business_id uuid,
  p_conversation_id uuid,
  p_content jsonb,
  p_content_hash text,
  p_approval_token_hash text,
  p_approval_expires_at timestamptz
)
returns setof public.ad_proposal_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_version integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));

  update public.ad_proposal_versions
     set status = 'superseded', updated_at = now()
   where business_id = p_business_id
     and conversation_id = p_conversation_id
     and status = 'awaiting_approval';

  select coalesce(max(version), 0) + 1
    into next_version
    from public.ad_proposal_versions
   where business_id = p_business_id
     and conversation_id = p_conversation_id;

  return query
  insert into public.ad_proposal_versions (
    business_id,
    conversation_id,
    version,
    status,
    content,
    content_hash,
    approval_token_hash,
    approval_expires_at
  ) values (
    p_business_id,
    p_conversation_id,
    next_version,
    'awaiting_approval',
    p_content,
    p_content_hash,
    p_approval_token_hash,
    p_approval_expires_at
  )
  returning *;
end;
$$;

create or replace function public.record_proposal_decision(
  p_business_id uuid,
  p_token_hash text,
  p_action text,
  p_approver_external_id text,
  p_source_external_message_id text
)
returns setof public.ad_proposal_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  proposal public.ad_proposal_versions%rowtype;
begin
  if p_action not in ('approve', 'cancel', 'change') then
    raise exception 'Unsupported proposal action' using errcode = '22023';
  end if;

  select * into proposal
    from public.ad_proposal_versions
   where business_id = p_business_id
     and approval_token_hash = p_token_hash
   for update;

  if proposal.id is null then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;

  if proposal.status <> 'awaiting_approval' or proposal.approval_expires_at <= now() then
    raise exception 'Proposal is not available for approval' using errcode = '55000';
  end if;

  if p_action = 'approve' then
    insert into public.approvals (
      business_id,
      proposal_id,
      proposal_content_hash,
      approver_external_id,
      source_external_message_id
    ) values (
      p_business_id,
      proposal.id,
      proposal.content_hash,
      p_approver_external_id,
      p_source_external_message_id
    );

    update public.ad_proposal_versions
       set status = 'approved', updated_at = now()
     where id = proposal.id;
  elsif p_action = 'change' then
    update public.ad_proposal_versions
       set status = 'changes_requested', updated_at = now()
     where id = proposal.id;
  else
    update public.ad_proposal_versions
       set status = 'cancelled', updated_at = now()
     where id = proposal.id;
  end if;

  return query select * from public.ad_proposal_versions where id = proposal.id;
end;
$$;

create or replace function public.claim_provider_operation(
  p_business_id uuid,
  p_proposal_id uuid,
  p_provider text,
  p_operation_key text,
  p_operation_type text,
  p_request_summary jsonb
)
returns table (operation_id uuid, operation_status text, remote_id text, should_execute boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_id uuid;
  existing public.provider_operations%rowtype;
begin
  if p_provider = 'meta' and p_proposal_id is not null and not exists (
    select 1
      from public.ad_proposal_versions as proposal
      join public.approvals as approval on approval.proposal_id = proposal.id
     where proposal.id = p_proposal_id
       and proposal.business_id = p_business_id
       and proposal.status in ('approved', 'publishing')
       and approval.proposal_content_hash = proposal.content_hash
  ) then
    raise exception 'A matching recorded approval is required for every Meta mutation'
      using errcode = '42501';
  end if;

  insert into public.provider_operations (
    business_id,
    proposal_id,
    provider,
    operation_key,
    operation_type,
    status,
    request_summary
  ) values (
    p_business_id,
    p_proposal_id,
    p_provider,
    p_operation_key,
    p_operation_type,
    'started',
    p_request_summary
  )
  on conflict (provider, operation_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    operation_id := inserted_id;
    operation_status := 'started';
    remote_id := null;
    should_execute := true;
    return next;
    return;
  end if;

  select * into existing
    from public.provider_operations
   where provider = p_provider
     and operation_key = p_operation_key
   for update;

  operation_id := existing.id;
  operation_status := existing.status;
  remote_id := existing.remote_id;
  should_execute := false;
  return next;
end;
$$;

revoke all on function public.ingest_webhook_events(jsonb) from public, anon, authenticated;
revoke all on function public.claim_webhook_event(uuid) from public, anon, authenticated;
revoke all on function public.record_inbound_whatsapp_message(uuid, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.create_ad_proposal_version(uuid, uuid, jsonb, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_proposal_decision(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_provider_operation(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.ingest_webhook_events(jsonb) to service_role;
grant execute on function public.claim_webhook_event(uuid) to service_role;
grant execute on function public.record_inbound_whatsapp_message(uuid, text, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.create_ad_proposal_version(uuid, uuid, jsonb, text, text, timestamptz) to service_role;
grant execute on function public.record_proposal_decision(uuid, text, text, text, text) to service_role;
grant execute on function public.claim_provider_operation(uuid, uuid, text, text, text, jsonb) to service_role;
