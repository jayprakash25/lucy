export type Json = unknown;

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>, Relationships extends [] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};

type ConversationRow = {
  id: string;
  business_id: string;
  provider: string;
  external_contact_id: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  business_id: string;
  conversation_id: string;
  provider: string;
  external_message_id: string;
  direction: string;
  message_type: string;
  text_content: string | null;
  delivery_status: string | null;
  occurred_at: string;
  raw_payload: Json;
  created_at: string;
};

type MediaAssetRow = {
  id: string;
  business_id: string;
  conversation_id: string;
  message_id: string;
  provider_media_id: string;
  mime_type: string;
  sha256: string | null;
  byte_size: number;
  storage_path: string;
  created_at: string;
};

type WebhookEventRow = {
  id: string;
  business_id: string;
  provider: string;
  channel_external_id: string;
  external_event_id: string;
  event_type: string;
  occurred_at: string;
  payload: Json;
  status: string;
  workflow_run_id: string | null;
  receive_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type ProposalRow = {
  id: string;
  business_id: string;
  conversation_id: string;
  version: number;
  status: string;
  content: Json;
  content_hash: string;
  approval_token_hash: string;
  approval_expires_at: string;
  meta_campaign_id: string | null;
  meta_ad_set_id: string | null;
  meta_creative_id: string | null;
  meta_ad_id: string | null;
  created_at: string;
  updated_at: string;
};

type ApprovalRow = {
  id: string;
  business_id: string;
  proposal_id: string;
  proposal_content_hash: string;
  approver_external_id: string;
  source_external_message_id: string;
  approved_at: string;
};

type ProviderOperationRow = {
  id: string;
  business_id: string;
  proposal_id: string | null;
  provider: string;
  operation_key: string;
  operation_type: string;
  status: string;
  remote_id: string | null;
  request_summary: Json;
  response_summary: Json;
  last_error: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
};

type CampaignWorkflowRow = {
  id: string; business_id: string; conversation_id: string | null; status: string;
  property_profile: Json; media_manifest: Json; current_creative_version: number;
  creative_approved_version: number | null; creative_approved_hash: string | null;
  creative_approved_at: string | null; creative_approved_by: string | null;
  campaign_configuration: Json | null; campaign_configuration_hash: string | null;
  final_proposal_id: string | null; created_at: string; updated_at: string;
};

type CreativeVersionRow = { id: string; workflow_id: string; version: number; format: string; content: Json; content_hash: string; change_request: string | null; created_at: string };

export type Database = {
  public: {
    Tables: {
      businesses: Table<{
        id: string;
        slug: string;
        name: string;
        timezone: string;
        currency: string;
        maximum_daily_budget_minor: number;
        maximum_total_budget_minor: number;
        created_at: string;
        updated_at: string;
      }>;
      operator_identities: Table<{
        id: string;
        business_id: string;
        provider: string;
        external_id: string;
        display_name: string;
        role: string;
        active: boolean;
        created_at: string;
      }>;
      conversations: Table<ConversationRow>;
      messages: Table<MessageRow>;
      media_assets: Table<MediaAssetRow>;
      webhook_events: Table<WebhookEventRow>;
      ad_proposal_versions: Table<ProposalRow>;
      approvals: Table<ApprovalRow>;
      provider_operations: Table<ProviderOperationRow>;
      campaign_workflows: Table<CampaignWorkflowRow>;
      creative_versions: Table<CreativeVersionRow>;
      audit_events: Table<{
        id: number;
        business_id: string;
        actor_type: string;
        actor_external_id: string | null;
        event_type: string;
        subject_type: string;
        subject_id: string;
        metadata: Json;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      ingest_webhook_events: {
        Args: { p_events: Json };
        Returns: Array<{ event_id: string; should_start: boolean }>;
      };
      claim_webhook_event: {
        Args: { p_event_id: string };
        Returns: WebhookEventRow[];
      };
      record_inbound_whatsapp_message: {
        Args: {
          p_business_id: string;
          p_external_contact_id: string;
          p_external_message_id: string;
          p_message_type: string;
          p_text_content: string | null;
          p_occurred_at: string;
          p_raw_payload: Json;
        };
        Returns: Array<{ message_id: string; conversation_id: string }>;
      };
      create_ad_proposal_version: {
        Args: {
          p_business_id: string;
          p_conversation_id: string;
          p_content: Json;
          p_content_hash: string;
          p_approval_token_hash: string;
          p_approval_expires_at: string;
        };
        Returns: ProposalRow[];
      };
      record_proposal_decision: {
        Args: {
          p_business_id: string;
          p_token_hash: string;
          p_action: string;
          p_approver_external_id: string;
          p_source_external_message_id: string;
        };
        Returns: ProposalRow[];
      };
      claim_provider_operation: {
        Args: {
          p_business_id: string;
          p_proposal_id: string | null;
          p_provider: string;
          p_operation_key: string;
          p_operation_type: string;
          p_request_summary: Json;
        };
        Returns: Array<{
          operation_id: string;
          operation_status: string;
          remote_id: string | null;
          should_execute: boolean;
        }>;
      };
      approve_workflow_creative: {
        Args: { p_workflow_id: string; p_version: number; p_content_hash: string; p_approver: string };
        Returns: CampaignWorkflowRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
