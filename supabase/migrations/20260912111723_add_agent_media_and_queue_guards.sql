update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
where id = 'property-media';

alter table public.audit_events add column dedupe_key text unique;

alter table public.webhook_events add column processing_token text;

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

    if item->>'provider' = 'whatsapp'
       and item #>> '{payload,message,from}' is not null
       and not exists (
         select 1
           from public.operator_identities as operator
          where operator.business_id = matched_business_id
            and operator.provider = 'whatsapp'
            and operator.external_id = item #>> '{payload,message,from}'
            and operator.active
       ) then
      continue;
    end if;

    insert into public.webhook_events (
      business_id, provider, channel_external_id, external_event_id, event_type, occurred_at, payload, status
    ) values (
      matched_business_id, item->>'provider', item->>'channel_external_id', item->>'external_event_id',
      item->>'event_type', (item->>'occurred_at')::timestamptz, item->'payload', 'dispatching'
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

    select * into existing
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
      or (existing.status = 'processing' and existing.updated_at < now() - interval '5 minutes')
      or (existing.status = 'dispatching' and existing.updated_at < now() - interval '5 minutes');

    if should_start then
      update public.webhook_events
         set status = 'dispatching',
             processing_token = null,
             last_error = null,
             updated_at = now()
       where id = existing.id;
    end if;

    return next;
    existing := null;
  end loop;
end;
$$;

alter table public.ad_proposal_versions
  drop constraint if exists ad_proposal_versions_status_check;

alter table public.ad_proposal_versions
  add constraint ad_proposal_versions_status_check
  check (status in (
    'awaiting_approval', 'approved', 'changes_requested', 'cancelled', 'superseded',
    'publishing', 'pending_review', 'active', 'paused', 'rejected', 'failed'
  ));

alter table public.ad_proposal_versions
  add column source_event_id uuid references public.webhook_events(id) on delete restrict;

alter table public.ad_proposal_versions
  add column decision_action text check (decision_action in ('approve', 'change', 'cancel')),
  add column decision_source_external_message_id text unique,
  add column decided_by_external_id text;

create unique index ad_proposal_versions_source_event_idx
  on public.ad_proposal_versions (source_event_id)
  where source_event_id is not null;

create index ad_proposal_versions_submitted_idx
  on public.ad_proposal_versions (business_id, created_at desc)
  where meta_campaign_id is not null;

create index webhook_events_whatsapp_chat_queue_idx
  on public.webhook_events (
    business_id,
    channel_external_id,
    ((payload #>> '{message,from}')),
    occurred_at,
    created_at,
    id
  )
  where provider = 'whatsapp' and status in ('dispatching', 'processing');

drop function public.create_ad_proposal_version(uuid, uuid, jsonb, text, text, timestamptz);

create function public.create_ad_proposal_version(
  p_business_id uuid,
  p_conversation_id uuid,
  p_source_event_id uuid,
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
  existing public.ad_proposal_versions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));

  select * into existing
    from public.ad_proposal_versions
   where source_event_id = p_source_event_id
     and business_id = p_business_id
     and conversation_id = p_conversation_id;

  if existing.id is not null then
    return next existing;
    return;
  end if;

  update public.ad_proposal_versions
     set status = 'superseded', updated_at = now()
   where business_id = p_business_id
     and conversation_id = p_conversation_id
     and status in ('awaiting_approval', 'changes_requested');

  select coalesce(max(version), 0) + 1
    into next_version
    from public.ad_proposal_versions
   where business_id = p_business_id
     and conversation_id = p_conversation_id;

  return query
  insert into public.ad_proposal_versions (
    business_id, conversation_id, source_event_id, version, status, content, content_hash,
    approval_token_hash, approval_expires_at
  ) values (
    p_business_id, p_conversation_id, p_source_event_id, next_version, 'awaiting_approval', p_content,
    p_content_hash, p_approval_token_hash, p_approval_expires_at
  )
  returning *;
end;
$$;

drop function public.claim_webhook_event(uuid);

create function public.claim_webhook_event(p_event_id uuid, p_processing_token text)
returns setof public.webhook_events
language sql
security invoker
set search_path = ''
as $$
  update public.webhook_events as target
     set status = 'processing',
         processing_token = p_processing_token,
         updated_at = now()
   where target.id = p_event_id
     and (
       (target.status = 'processing' and target.processing_token = p_processing_token)
       or (target.status = 'processing' and target.updated_at < now() - interval '5 minutes')
       or (
         target.status = 'dispatching'
     and (
       target.provider <> 'whatsapp'
       or target.payload #>> '{message,from}' is null
       or not exists (
         select 1
           from public.webhook_events as earlier
          where earlier.provider = 'whatsapp'
            and earlier.business_id = target.business_id
            and earlier.channel_external_id = target.channel_external_id
            and earlier.payload #>> '{message,from}' = target.payload #>> '{message,from}'
            and earlier.id <> target.id
            and (
              (earlier.status = 'processing' and earlier.updated_at >= now() - interval '5 minutes')
              or (
                earlier.status = 'dispatching'
                and (earlier.occurred_at, earlier.created_at, earlier.id)
                  < (target.occurred_at, target.created_at, target.id)
              )
            )
       )
     )
       )
     )
  returning target.*;
$$;

create function public.renew_webhook_event_lease(p_event_id uuid, p_processing_token text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  update public.webhook_events
     set updated_at = now()
   where id = p_event_id
     and status = 'processing'
     and processing_token = p_processing_token
  returning true;
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

  if proposal.decision_source_external_message_id = p_source_external_message_id
     and proposal.decision_action = p_action then
    return next proposal;
    return;
  end if;

  if proposal.status <> 'awaiting_approval' or proposal.approval_expires_at <= now() then
    raise exception 'Proposal is not available for approval' using errcode = '55000';
  end if;

  if p_action = 'approve' then
    insert into public.approvals (
      business_id, proposal_id, proposal_content_hash, approver_external_id, source_external_message_id
    ) values (
      p_business_id, proposal.id, proposal.content_hash, p_approver_external_id, p_source_external_message_id
    );
  end if;

  update public.ad_proposal_versions
     set status = case p_action
       when 'approve' then 'approved'
       when 'change' then 'changes_requested'
       else 'cancelled'
     end,
     decision_action = p_action,
     decision_source_external_message_id = p_source_external_message_id,
     decided_by_external_id = p_approver_external_id,
     updated_at = now()
   where id = proposal.id;

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
  if p_provider = 'meta' and (
    p_proposal_id is null
    or not exists (
      select 1
        from public.ad_proposal_versions as proposal
        join public.approvals as approval on approval.proposal_id = proposal.id
       where proposal.id = p_proposal_id
         and proposal.business_id = p_business_id
         and approval.proposal_content_hash = proposal.content_hash
         and (
           (p_operation_type = 'pause-campaign' and proposal.status in ('pending_review', 'active', 'paused'))
           or (
             p_operation_type in (
               'campaign', 'ad-set', 'image', 'creative', 'ad',
               'activate-ad', 'activate-ad-set', 'activate-campaign'
             )
             and proposal.status in ('approved', 'publishing')
           )
         )
    )
  ) then
    raise exception 'A matching recorded approval is required for every Meta mutation'
      using errcode = '42501';
  end if;

  insert into public.provider_operations (
    business_id, proposal_id, provider, operation_key, operation_type, status, request_summary
  ) values (
    p_business_id, p_proposal_id, p_provider, p_operation_key, p_operation_type, 'started', p_request_summary
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

revoke all on function public.claim_webhook_event(uuid, text) from public, anon, authenticated;
revoke all on function public.renew_webhook_event_lease(uuid, text) from public, anon, authenticated;
revoke all on function public.create_ad_proposal_version(uuid, uuid, uuid, jsonb, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_provider_operation(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(uuid, text) to service_role;
grant execute on function public.renew_webhook_event_lease(uuid, text) to service_role;
grant execute on function public.create_ad_proposal_version(uuid, uuid, uuid, jsonb, text, text, timestamptz) to service_role;
grant execute on function public.claim_provider_operation(uuid, uuid, text, text, text, jsonb) to service_role;
