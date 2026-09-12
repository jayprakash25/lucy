create table public.campaign_workflows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'property_draft' check (status in (
    'property_draft','creative_review','creative_changes_requested','creative_approved',
    'campaign_draft','campaign_review','campaign_changes_requested','campaign_approved','cancelled','launched'
  )),
  property_profile jsonb not null default '{}'::jsonb,
  media_manifest jsonb not null default '[]'::jsonb,
  current_creative_version integer not null default 0 check (current_creative_version >= 0),
  creative_approved_version integer,
  creative_approved_hash text,
  creative_approved_at timestamptz,
  creative_approved_by text,
  campaign_configuration jsonb,
  campaign_configuration_hash text,
  final_proposal_id uuid references public.ad_proposal_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creative_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.campaign_workflows(id) on delete cascade,
  version integer not null check (version > 0),
  format text not null check (format in ('image','reel')),
  content jsonb not null,
  content_hash text not null,
  change_request text,
  created_at timestamptz not null default now(),
  unique (workflow_id, version)
);

create index campaign_workflows_business_updated_idx on public.campaign_workflows (business_id, updated_at desc);
create index creative_versions_workflow_idx on public.creative_versions (workflow_id, version desc);

alter table public.campaign_workflows enable row level security;
alter table public.creative_versions enable row level security;
revoke all on table public.campaign_workflows, public.creative_versions from anon, authenticated;
grant select, insert, update, delete on table public.campaign_workflows, public.creative_versions to service_role;

create or replace function public.approve_workflow_creative(
  p_workflow_id uuid, p_version integer, p_content_hash text, p_approver text
) returns setof public.campaign_workflows
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.creative_versions
    where workflow_id = p_workflow_id and version = p_version and content_hash = p_content_hash
  ) then raise exception 'Creative version or hash does not match' using errcode = '22023'; end if;

  return query update public.campaign_workflows
    set status = 'creative_approved', creative_approved_version = p_version,
        creative_approved_hash = p_content_hash, creative_approved_at = now(),
        creative_approved_by = p_approver, updated_at = now()
    where id = p_workflow_id and current_creative_version = p_version
    returning *;
end; $$;

revoke all on function public.approve_workflow_creative(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.approve_workflow_creative(uuid, integer, text, text) to service_role;
