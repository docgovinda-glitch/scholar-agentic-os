export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          granted_at: string
          granted_by: string | null
          note: string | null
          scopes: string[]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          scopes?: string[]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          scopes?: string[]
          user_id?: string
        }
        Relationships: []
      }
      ai_models: {
        Row: {
          capabilities: Json
          context_window: number | null
          cost_class: string | null
          created_at: string
          display_name: string
          enabled: boolean
          free_eligible: boolean
          id: string
          last_verified_at: string | null
          modalities: string[]
          model_id: string
          premium_eligible: boolean
          provider_id: string
          speed_class: string | null
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          context_window?: number | null
          cost_class?: string | null
          created_at?: string
          display_name: string
          enabled?: boolean
          free_eligible?: boolean
          id: string
          last_verified_at?: string | null
          modalities?: string[]
          model_id: string
          premium_eligible?: boolean
          provider_id: string
          speed_class?: string | null
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          context_window?: number | null
          cost_class?: string | null
          created_at?: string
          display_name?: string
          enabled?: boolean
          free_eligible?: boolean
          id?: string
          last_verified_at?: string | null
          modalities?: string[]
          model_id?: string
          premium_eligible?: boolean
          provider_id?: string
          speed_class?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_opportunities: {
        Row: {
          application_required: boolean | null
          confidence: string | null
          created_at: string
          credits_transferable: boolean | null
          discovered_at: string
          eligibility: string | null
          expiration: string | null
          geo_restrictions: string | null
          id: string
          last_verified_at: string | null
          multi_user_allowed: string | null
          official_url: string
          opportunity_name: string
          provider_name: string
          risk: string | null
          source_notes: string | null
          status: string
          usage_restrictions: string | null
          value_estimate: string | null
        }
        Insert: {
          application_required?: boolean | null
          confidence?: string | null
          created_at?: string
          credits_transferable?: boolean | null
          discovered_at?: string
          eligibility?: string | null
          expiration?: string | null
          geo_restrictions?: string | null
          id?: string
          last_verified_at?: string | null
          multi_user_allowed?: string | null
          official_url: string
          opportunity_name: string
          provider_name: string
          risk?: string | null
          source_notes?: string | null
          status?: string
          usage_restrictions?: string | null
          value_estimate?: string | null
        }
        Update: {
          application_required?: boolean | null
          confidence?: string | null
          created_at?: string
          credits_transferable?: boolean | null
          discovered_at?: string
          eligibility?: string | null
          expiration?: string | null
          geo_restrictions?: string | null
          id?: string
          last_verified_at?: string | null
          multi_user_allowed?: string | null
          official_url?: string
          opportunity_name?: string
          provider_name?: string
          risk?: string | null
          source_notes?: string | null
          status?: string
          usage_restrictions?: string | null
          value_estimate?: string | null
        }
        Relationships: []
      }
      ai_providers: {
        Row: {
          api_style: string
          base_url: string | null
          category: string
          created_at: string
          docs_url: string | null
          enabled: boolean
          free_tier_kind: string | null
          free_tier_note: string | null
          id: string
          metadata: Json
          name: string
          premium_enabled: boolean
          premium_models: string[]
          updated_at: string
        }
        Insert: {
          api_style: string
          base_url?: string | null
          category: string
          created_at?: string
          docs_url?: string | null
          enabled?: boolean
          free_tier_kind?: string | null
          free_tier_note?: string | null
          id: string
          metadata?: Json
          name: string
          premium_enabled?: boolean
          premium_models?: string[]
          updated_at?: string
        }
        Update: {
          api_style?: string
          base_url?: string | null
          category?: string
          created_at?: string
          docs_url?: string | null
          enabled?: boolean
          free_tier_kind?: string | null
          free_tier_note?: string | null
          id?: string
          metadata?: Json
          name?: string
          premium_enabled?: boolean
          premium_models?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      ai_resources: {
        Row: {
          access_type: string
          capabilities: string[]
          cost_per_1k_usd: number | null
          created_at: string
          credential_label: string
          daily_request_limit: number | null
          description: string | null
          enabled: boolean
          id: string
          label: string
          model_id: string | null
          provider_id: string
          updated_at: string
        }
        Insert: {
          access_type: string
          capabilities?: string[]
          cost_per_1k_usd?: number | null
          created_at?: string
          credential_label?: string
          daily_request_limit?: number | null
          description?: string | null
          enabled?: boolean
          id?: string
          label: string
          model_id?: string | null
          provider_id: string
          updated_at?: string
        }
        Update: {
          access_type?: string
          capabilities?: string[]
          cost_per_1k_usd?: number | null
          created_at?: string
          credential_label?: string
          daily_request_limit?: number | null
          description?: string | null
          enabled?: boolean
          id?: string
          label?: string
          model_id?: string | null
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_resources_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_ledger: {
        Row: {
          created_at: string
          id: string
          input_tokens: number | null
          model_id: string | null
          output_tokens: number | null
          provider_cost_usd: number | null
          provider_id: string | null
          request_id: string
          scholar_credits_charged: number | null
          status: string
          task_type: string | null
          tier: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          model_id?: string | null
          output_tokens?: number | null
          provider_cost_usd?: number | null
          provider_id?: string | null
          request_id: string
          scholar_credits_charged?: number | null
          status: string
          task_type?: string | null
          tier: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          model_id?: string | null
          output_tokens?: number | null
          provider_cost_usd?: number | null
          provider_id?: string | null
          request_id?: string
          scholar_credits_charged?: number | null
          status?: string
          task_type?: string | null
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_ledger_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      api_credentials: {
        Row: {
          api_key_hash: string
          encrypted_api_key: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_hash: string
          encrypted_api_key: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_hash?: string
          encrypted_api_key?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_balances: {
        Row: {
          balance: number
          daily_reset_at: string
          daily_used: number
          monthly_reset_at: string
          monthly_used: number
          updated_at: string
          user_id: string
          weekly_reset_at: string
          weekly_used: number
        }
        Insert: {
          balance?: number
          daily_reset_at?: string
          daily_used?: number
          monthly_reset_at?: string
          monthly_used?: number
          updated_at?: string
          user_id: string
          weekly_reset_at?: string
          weekly_used?: number
        }
        Update: {
          balance?: number
          daily_reset_at?: string
          daily_used?: number
          monthly_reset_at?: string
          monthly_used?: number
          updated_at?: string
          user_id?: string
          weekly_reset_at?: string
          weekly_used?: number
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          note: string | null
          reason: string
          request_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          note?: string | null
          reason: string
          request_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          note?: string | null
          reason?: string
          request_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hardware_profiles: {
        Row: {
          architecture: string | null
          cpu_cores: number | null
          detected_at: string
          detected_models: Json
          detected_runtimes: Json
          detection_method: string
          gpu_info: string | null
          os: string | null
          ram_gb: number | null
          storage_free_gb: number | null
          user_id: string
          vram_gb: number | null
        }
        Insert: {
          architecture?: string | null
          cpu_cores?: number | null
          detected_at?: string
          detected_models?: Json
          detected_runtimes?: Json
          detection_method?: string
          gpu_info?: string | null
          os?: string | null
          ram_gb?: number | null
          storage_free_gb?: number | null
          user_id: string
          vram_gb?: number | null
        }
        Update: {
          architecture?: string | null
          cpu_cores?: number | null
          detected_at?: string
          detected_models?: Json
          detected_runtimes?: Json
          detection_method?: string
          gpu_info?: string | null
          os?: string | null
          ram_gb?: number | null
          storage_free_gb?: number | null
          user_id?: string
          vram_gb?: number | null
        }
        Relationships: []
      }
      manuscript_sections: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          section_name: string
          status: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          project_id: string
          section_name: string
          status?: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          section_name?: string
          status?: string
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "manuscript_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      manuscript_versions: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          section_name: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          project_id: string
          section_name: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          section_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuscript_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      opportunity_reviews: {
        Row: {
          admin_id: string
          decision: string
          id: string
          notes: string | null
          opportunity_id: string
          reviewed_at: string
        }
        Insert: {
          admin_id: string
          decision: string
          id?: string
          notes?: string | null
          opportunity_id: string
          reviewed_at?: string
        }
        Update: {
          admin_id?: string
          decision?: string
          id?: string
          notes?: string | null
          opportunity_id?: string
          reviewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_reviews_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "ai_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_review_critiques: {
        Row: {
          created_at: string
          feedback: string
          id: string
          lens: string
          project_id: string
          severity: string
          waived: boolean
        }
        Insert: {
          created_at?: string
          feedback: string
          id?: string
          lens: string
          project_id: string
          severity: string
          waived?: boolean
        }
        Update: {
          created_at?: string
          feedback?: string
          id?: string
          lens?: string
          project_id?: string
          severity?: string
          waived?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "peer_review_critiques_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      pending_password_resets: {
        Row: {
          new_password: string
          requested_at: string
          reset_token: string
          user_id: string
        }
        Insert: {
          new_password: string
          requested_at?: string
          reset_token: string
          user_id: string
        }
        Update: {
          new_password?: string
          requested_at?: string
          reset_token?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_resources: {
        Row: {
          created_at: string
          plan_id: string
          resource_id: string
        }
        Insert: {
          created_at?: string
          plan_id: string
          resource_id: string
        }
        Update: {
          created_at?: string
          plan_id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_resources_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "premium_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "ai_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_budgets: {
        Row: {
          current_month_spend_usd: number
          id: number
          month_start: string
          monthly_budget_usd: number
          prefer_cheap_threshold_pct: number
          restrict_threshold_pct: number
          stop_threshold_pct: number
          updated_at: string
          warn_threshold_pct: number
        }
        Insert: {
          current_month_spend_usd?: number
          id?: number
          month_start?: string
          monthly_budget_usd?: number
          prefer_cheap_threshold_pct?: number
          restrict_threshold_pct?: number
          stop_threshold_pct?: number
          updated_at?: string
          warn_threshold_pct?: number
        }
        Update: {
          current_month_spend_usd?: number
          id?: number
          month_start?: string
          monthly_budget_usd?: number
          prefer_cheap_threshold_pct?: number
          restrict_threshold_pct?: number
          stop_threshold_pct?: number
          updated_at?: string
          warn_threshold_pct?: number
        }
        Relationships: []
      }
      platform_provider_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          encrypted_cek: Json
          encrypted_credential: Json
          id: string
          label: string
          last_verified_at: string | null
          masked_preview: string
          provider_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          encrypted_cek: Json
          encrypted_credential: Json
          id?: string
          label?: string
          last_verified_at?: string | null
          masked_preview: string
          provider_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          encrypted_cek?: Json
          encrypted_credential?: Json
          id?: string
          label?: string
          last_verified_at?: string | null
          masked_preview?: string
          provider_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_provider_credentials_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      pocket_approvals: {
        Row: {
          created_at: string | null
          decided_at: string | null
          id: string
          project_id: string
          source_id: string
          updated_at: string | null
          user_decision: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          decided_at?: string | null
          id?: string
          project_id: string
          source_id: string
          updated_at?: string | null
          user_decision: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          decided_at?: string | null
          id?: string
          project_id?: string
          source_id?: string
          updated_at?: string | null
          user_decision?: string
          user_id?: string
        }
        Relationships: []
      }
      pocket_chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          project_id: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      pocket_comments: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          resolved: boolean | null
          section_id: string | null
          text: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          resolved?: boolean | null
          section_id?: string | null
          text: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          resolved?: boolean | null
          section_id?: string | null
          text?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pocket_push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh_key: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh_key: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh_key?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      premium_plans: {
        Row: {
          concurrency_limit: number
          created_at: string
          daily_credits: number | null
          description: string | null
          enabled: boolean
          id: string
          model_restrictions: Json
          monthly_credits: number
          name: string
          per_task_max_credits: number | null
          provider_restrictions: Json
          sort_order: number
          updated_at: string
          user_requestable: boolean
          weekly_credits: number | null
        }
        Insert: {
          concurrency_limit?: number
          created_at?: string
          daily_credits?: number | null
          description?: string | null
          enabled?: boolean
          id: string
          model_restrictions?: Json
          monthly_credits: number
          name: string
          per_task_max_credits?: number | null
          provider_restrictions?: Json
          sort_order?: number
          updated_at?: string
          user_requestable?: boolean
          weekly_credits?: number | null
        }
        Update: {
          concurrency_limit?: number
          created_at?: string
          daily_credits?: number | null
          description?: string | null
          enabled?: boolean
          id?: string
          model_restrictions?: Json
          monthly_credits?: number
          name?: string
          per_task_max_credits?: number | null
          provider_restrictions?: Json
          sort_order?: number
          updated_at?: string
          user_requestable?: boolean
          weekly_credits?: number | null
        }
        Relationships: []
      }
      premium_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          note: string | null
          requested_plan_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          note?: string | null
          requested_plan_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          note?: string | null
          requested_plan_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "premium_requests_requested_plan_id_fkey"
            columns: ["requested_plan_id"]
            isOneToOne: false
            referencedRelation: "premium_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          affiliation: string | null
          created_at: string
          education_level: string | null
          full_name: string
          id: string
          is_approved: boolean
          model_preferences: Json | null
          phone: string | null
          phone_country_code: string
          phone_e164: string | null
          updated_at: string
          user_type: string | null
          username: string
        }
        Insert: {
          account_status?: string
          affiliation?: string | null
          created_at?: string
          education_level?: string | null
          full_name: string
          id: string
          is_approved?: boolean
          model_preferences?: Json | null
          phone?: string | null
          phone_country_code?: string
          phone_e164?: string | null
          updated_at?: string
          user_type?: string | null
          username: string
        }
        Update: {
          account_status?: string
          affiliation?: string | null
          created_at?: string
          education_level?: string | null
          full_name?: string
          id?: string
          is_approved?: boolean
          model_preferences?: Json | null
          phone?: string | null
          phone_country_code?: string
          phone_e164?: string | null
          updated_at?: string
          user_type?: string | null
          username?: string
        }
        Relationships: []
      }
      project_activity: {
        Row: {
          created_at: string
          description: string
          event_type: string
          id: string
          metadata: Json | null
          project_id: string
        }
        Insert: {
          created_at?: string
          description: string
          event_type: string
          id?: string
          metadata?: Json | null
          project_id: string
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_claim_binding_evidence: {
        Row: {
          binding_id: string
          created_at: string
          id: string
          locator: Json | null
          project_id: string
          quote: string
          source_id: string
        }
        Insert: {
          binding_id: string
          created_at?: string
          id?: string
          locator?: Json | null
          project_id: string
          quote: string
          source_id: string
        }
        Update: {
          binding_id?: string
          created_at?: string
          id?: string
          locator?: Json | null
          project_id?: string
          quote?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_claim_binding_evidence_project_id_binding_id_fkey"
            columns: ["project_id", "binding_id"]
            isOneToOne: false
            referencedRelation: "project_claim_bindings"
            referencedColumns: ["project_id", "binding_id"]
          },
          {
            foreignKeyName: "project_claim_binding_evidence_project_id_source_id_fkey"
            columns: ["project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "project_sources"
            referencedColumns: ["project_id", "source_id"]
          },
        ]
      }
      project_claim_bindings: {
        Row: {
          binding_id: string
          claim_id: string
          created_at: string
          id: string
          project_id: string
          rationale: string
          strength: string
          updated_at: string
        }
        Insert: {
          binding_id: string
          claim_id: string
          created_at?: string
          id?: string
          project_id: string
          rationale: string
          strength: string
          updated_at?: string
        }
        Update: {
          binding_id?: string
          claim_id?: string
          created_at?: string
          id?: string
          project_id?: string
          rationale?: string
          strength?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_claim_bindings_project_id_claim_id_fkey"
            columns: ["project_id", "claim_id"]
            isOneToOne: false
            referencedRelation: "project_claims"
            referencedColumns: ["project_id", "claim_id"]
          },
          {
            foreignKeyName: "project_claim_bindings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_claims: {
        Row: {
          claim_id: string
          created_at: string
          draft_span_id: string | null
          id: string
          project_id: string
          status: string | null
          text: string
          unsupported_actor: string | null
          unsupported_reason: string | null
          updated_at: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          draft_span_id?: string | null
          id?: string
          project_id: string
          status?: string | null
          text: string
          unsupported_actor?: string | null
          unsupported_reason?: string | null
          updated_at?: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          draft_span_id?: string | null
          id?: string
          project_id?: string
          status?: string | null
          text?: string
          unsupported_actor?: string | null
          unsupported_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_claims_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_evidence: {
        Row: {
          claim_type: string | null
          created_at: string
          embedding: string | null
          id: string
          project_id: string
          quote: string
          source_id: string | null
          strength: string | null
          tags: Json | null
        }
        Insert: {
          claim_type?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          project_id: string
          quote: string
          source_id?: string | null
          strength?: string | null
          tags?: Json | null
        }
        Update: {
          claim_type?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          project_id?: string
          quote?: string
          source_id?: string | null
          strength?: string | null
          tags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_evidence_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_evidence_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "project_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      project_evidence_items: {
        Row: {
          created_at: string
          evidence_id: string
          history: Json
          id: string
          locator: Json | null
          project_id: string
          proposed_claim_id: string | null
          quote: string | null
          source_id: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          history?: Json
          id?: string
          locator?: Json | null
          project_id: string
          proposed_claim_id?: string | null
          quote?: string | null
          source_id: string
          state: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          history?: Json
          id?: string
          locator?: Json | null
          project_id?: string
          proposed_claim_id?: string | null
          quote?: string | null
          source_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_evidence_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_evidence_items_project_id_source_id_fkey"
            columns: ["project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "project_sources"
            referencedColumns: ["project_id", "source_id"]
          },
        ]
      }
      project_files: {
        Row: {
          filename: string
          id: string
          mime_type: string
          project_id: string
          size_bytes: number
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          filename: string
          id?: string
          mime_type: string
          project_id: string
          size_bytes: number
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          filename?: string
          id?: string
          mime_type?: string
          project_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_journal_candidates: {
        Row: {
          created_at: string
          id: string
          impact_factor: number | null
          journal_name: string
          match_score: number | null
          project_id: string
          publisher: string | null
          rationale: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          impact_factor?: number | null
          journal_name: string
          match_score?: number | null
          project_id: string
          publisher?: string | null
          rationale?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          impact_factor?: number | null
          journal_name?: string
          match_score?: number | null
          project_id?: string
          publisher?: string | null
          rationale?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_journal_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_research_gaps: {
        Row: {
          created_at: string
          description: string
          gap_type: string
          id: string
          importance_score: number | null
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          gap_type: string
          id?: string
          importance_score?: number | null
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          gap_type?: string
          id?: string
          importance_score?: number | null
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_research_gaps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_sources: {
        Row: {
          abstract: string | null
          authority_tier: string
          authors: string[]
          canonical_reference: Json | null
          citation_status: string
          created_at: string
          discovered_at: string
          discovered_via: string
          doi: string | null
          id: string
          project_id: string
          relevance_score: number | null
          source_id: string
          source_type: string
          themes: Json | null
          title: string
          updated_at: string
          url: string | null
          vault_item_id: string | null
          venue: string | null
          year: number | null
        }
        Insert: {
          abstract?: string | null
          authority_tier: string
          authors?: string[]
          canonical_reference?: Json | null
          citation_status?: string
          created_at?: string
          discovered_at: string
          discovered_via: string
          doi?: string | null
          id?: string
          project_id: string
          relevance_score?: number | null
          source_id: string
          source_type: string
          themes?: Json | null
          title: string
          updated_at?: string
          url?: string | null
          vault_item_id?: string | null
          venue?: string | null
          year?: number | null
        }
        Update: {
          abstract?: string | null
          authority_tier?: string
          authors?: string[]
          canonical_reference?: Json | null
          citation_status?: string
          created_at?: string
          discovered_at?: string
          discovered_via?: string
          doi?: string | null
          id?: string
          project_id?: string
          relevance_score?: number | null
          source_id?: string
          source_type?: string
          themes?: Json | null
          title?: string
          updated_at?: string
          url?: string | null
          vault_item_id?: string | null
          venue?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_titles: {
        Row: {
          created_at: string
          id: string
          project_id: string
          rationale: string | null
          status: string
          subtitle_text: string | null
          title_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          rationale?: string | null
          status?: string
          subtitle_text?: string | null
          title_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          rationale?: string | null
          status?: string
          subtitle_text?: string | null
          title_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_titles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      projects: {
        Row: {
          anonymization_report: Json | null
          anonymized_document: Json | null
          answers: Json
          authors: Json
          claim_graph: Json
          cover_letter: Json | null
          created_at: string
          document: Json | null
          evidence_ledger: Json
          gates: Json
          generation_job: Json | null
          journal_requirements: Json | null
          output_type_id: string
          owner_id: string
          peer_review_history: Json
          project_id: string
          rubric_report: Json | null
          source_count_override: Json | null
          submissions: Json
          updated_at: string
          waivers: Json
        }
        Insert: {
          anonymization_report?: Json | null
          anonymized_document?: Json | null
          answers?: Json
          authors?: Json
          claim_graph?: Json
          cover_letter?: Json | null
          created_at?: string
          document?: Json | null
          evidence_ledger?: Json
          gates?: Json
          generation_job?: Json | null
          journal_requirements?: Json | null
          output_type_id: string
          owner_id: string
          peer_review_history?: Json
          project_id: string
          rubric_report?: Json | null
          source_count_override?: Json | null
          submissions?: Json
          updated_at?: string
          waivers?: Json
        }
        Update: {
          anonymization_report?: Json | null
          anonymized_document?: Json | null
          answers?: Json
          authors?: Json
          claim_graph?: Json
          cover_letter?: Json | null
          created_at?: string
          document?: Json | null
          evidence_ledger?: Json
          gates?: Json
          generation_job?: Json | null
          journal_requirements?: Json | null
          output_type_id?: string
          owner_id?: string
          peer_review_history?: Json
          project_id?: string
          rubric_report?: Json | null
          source_count_override?: Json | null
          submissions?: Json
          updated_at?: string
          waivers?: Json
        }
        Relationships: []
      }
      provider_health: {
        Row: {
          last_checked_at: string | null
          last_error: string | null
          latency_ms: number | null
          provider_id: string
          status: string
        }
        Insert: {
          last_checked_at?: string | null
          last_error?: string | null
          latency_ms?: number | null
          provider_id: string
          status?: string
        }
        Update: {
          last_checked_at?: string | null
          last_error?: string | null
          latency_ms?: number | null
          provider_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_health_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_connections: {
        Row: {
          created_at: string
          last_verified_at: string | null
          models_detected: number | null
          provider_id: string
          status: string
          storage_mode: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_verified_at?: string | null
          models_detected?: number | null
          provider_id: string
          status?: string
          storage_mode?: string
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_verified_at?: string | null
          models_detected?: number | null
          provider_id?: string
          status?: string
          storage_mode?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ai_connections_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_settings: {
        Row: {
          preferences: Json
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          preferences?: Json
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          preferences?: Json
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_cloud_integrations: {
        Row: {
          access_token: string | null
          account_email: string | null
          account_name: string | null
          connected_at: string
          created_at: string
          id: string
          metadata: Json | null
          provider: string
          refresh_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_email?: string | null
          account_name?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          provider: string
          refresh_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_email?: string | null
          account_name?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          provider?: string
          refresh_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          expiry: string | null
          granted_by: string | null
          plan_id: string | null
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          expiry?: string | null
          granted_by?: string | null
          plan_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          expiry?: string | null
          granted_by?: string | null
          plan_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "premium_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_quota_overrides: {
        Row: {
          concurrency_limit: number | null
          daily_credits: number | null
          monthly_credits: number | null
          per_task_max_credits: number | null
          reason: string | null
          set_at: string
          set_by: string | null
          user_id: string
          weekly_credits: number | null
        }
        Insert: {
          concurrency_limit?: number | null
          daily_credits?: number | null
          monthly_credits?: number | null
          per_task_max_credits?: number | null
          reason?: string | null
          set_at?: string
          set_by?: string | null
          user_id: string
          weekly_credits?: number | null
        }
        Update: {
          concurrency_limit?: number | null
          daily_credits?: number | null
          monthly_credits?: number | null
          per_task_max_credits?: number | null
          reason?: string | null
          set_at?: string
          set_by?: string | null
          user_id?: string
          weekly_credits?: number | null
        }
        Relationships: []
      }
      user_vault_items: {
        Row: {
          authors: string[] | null
          canonical_reference: Json | null
          citation: string | null
          citation_status: string | null
          content_text: string | null
          created_at: string
          external_reference: string | null
          filename: string | null
          id: string
          journal: string | null
          metadata: Json | null
          mime_type: string | null
          source_type: string
          storage_reference: string | null
          title: string
          updated_at: string
          user_id: string
          year: string | null
        }
        Insert: {
          authors?: string[] | null
          canonical_reference?: Json | null
          citation?: string | null
          citation_status?: string | null
          content_text?: string | null
          created_at?: string
          external_reference?: string | null
          filename?: string | null
          id?: string
          journal?: string | null
          metadata?: Json | null
          mime_type?: string | null
          source_type?: string
          storage_reference?: string | null
          title: string
          updated_at?: string
          user_id: string
          year?: string | null
        }
        Update: {
          authors?: string[] | null
          canonical_reference?: Json | null
          citation?: string | null
          citation_status?: string | null
          content_text?: string | null
          created_at?: string
          external_reference?: string | null
          filename?: string | null
          id?: string
          journal?: string | null
          metadata?: Json | null
          mime_type?: string | null
          source_type?: string
          storage_reference?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          year?: string | null
        }
        Relationships: []
      }
      user_vaults: {
        Row: {
          created_at: string
          label: string
          storage_mode: string
          user_id: string
        }
        Insert: {
          created_at?: string
          label?: string
          storage_mode?: string
          user_id: string
        }
        Update: {
          created_at?: string
          label?: string
          storage_mode?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_email_available: {
        Args: { lookup_email: string }
        Returns: boolean
      }
      check_phone_available: {
        Args: { lookup_phone_e164: string }
        Returns: boolean
      }
      check_username_available: {
        Args: { lookup_username: string }
        Returns: boolean
      }
      deduct_credits: {
        Args: {
          p_amount: number
          p_daily_limit: number
          p_monthly_limit: number
          p_note?: string
          p_reason: string
          p_request_id: string
          p_user_id: string
          p_weekly_limit?: number
        }
        Returns: string
      }
      email_for_identifier: {
        Args: { lookup_identifier: string }
        Returns: {
          email: string
          found_by: string
        }[]
      }
      email_for_phone_e164: {
        Args: { lookup_phone_e164: string }
        Returns: string
      }
      email_for_username: { Args: { lookup_username: string }; Returns: string }
      grant_credits: {
        Args: {
          p_amount: number
          p_note?: string
          p_reason: string
          p_user_id: string
        }
        Returns: undefined
      }
      is_username_approved: {
        Args: { lookup_username: string }
        Returns: boolean
      }
      match_project_evidence: {
        Args: {
          match_count: number
          match_threshold: number
          p_id: string
          query_embedding: string
        }
        Returns: {
          claim_type: string
          id: string
          project_id: string
          quote: string
          similarity: number
          strength: string
          tags: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
