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
      agent_runs: {
        Row: {
          actor: string
          actor_role: string
          approval_required: boolean
          approval_status: string
          citations: Json
          completed_at: string | null
          confidence: number | null
          created_at: string
          documents_retrieved: number
          entities: Json
          error: string | null
          estimated_cost: number
          eval_run_id: string | null
          evidence: Json
          final_response: string | null
          id: string
          input_tokens: number
          intent: string | null
          latency_ms: number | null
          model: string | null
          output_tokens: number
          plan: Json
          prompt_version: string | null
          reasoning_summary: string | null
          request: string
          risk_level: string | null
          run_number: number
          status: string
          tool_call_count: number
          verification_notes: string | null
          verification_status: string | null
        }
        Insert: {
          actor?: string
          actor_role?: string
          approval_required?: boolean
          approval_status?: string
          citations?: Json
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          documents_retrieved?: number
          entities?: Json
          error?: string | null
          estimated_cost?: number
          eval_run_id?: string | null
          evidence?: Json
          final_response?: string | null
          id?: string
          input_tokens?: number
          intent?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number
          plan?: Json
          prompt_version?: string | null
          reasoning_summary?: string | null
          request: string
          risk_level?: string | null
          run_number?: number
          status?: string
          tool_call_count?: number
          verification_notes?: string | null
          verification_status?: string | null
        }
        Update: {
          actor?: string
          actor_role?: string
          approval_required?: boolean
          approval_status?: string
          citations?: Json
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          documents_retrieved?: number
          entities?: Json
          error?: string | null
          estimated_cost?: number
          eval_run_id?: string | null
          evidence?: Json
          final_response?: string | null
          id?: string
          input_tokens?: number
          intent?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number
          plan?: Json
          prompt_version?: string | null
          reasoning_summary?: string | null
          request?: string
          risk_level?: string | null
          run_number?: number
          status?: string
          tool_call_count?: number
          verification_notes?: string | null
          verification_status?: string | null
        }
        Relationships: []
      }
      agent_steps: {
        Row: {
          created_at: string
          detail: Json
          duration_ms: number
          error: string | null
          id: string
          label: string
          node: string
          run_id: string
          started_offset_ms: number
          status: string
          step_index: number
        }
        Insert: {
          created_at?: string
          detail?: Json
          duration_ms?: number
          error?: string | null
          id?: string
          label: string
          node: string
          run_id: string
          started_offset_ms?: number
          status?: string
          step_index: number
        }
        Update: {
          created_at?: string
          detail?: Json
          duration_ms?: number
          error?: string | null
          id?: string
          label?: string
          node?: string
          run_id?: string
          started_offset_ms?: number
          status?: string
          step_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          action_payload: Json
          action_type: string
          amount: number | null
          currency: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          evidence: Json
          id: string
          justification: string | null
          requested_at: string
          risk_level: string
          run_id: string
          status: string
          summary: string
        }
        Insert: {
          action_payload?: Json
          action_type: string
          amount?: number | null
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          evidence?: Json
          id?: string
          justification?: string | null
          requested_at?: string
          risk_level?: string
          run_id: string
          status?: string
          summary: string
        }
        Update: {
          action_payload?: Json
          action_type?: string
          amount?: number | null
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          evidence?: Json
          id?: string
          justification?: string | null
          requested_at?: string
          risk_level?: string
          run_id?: string
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string | null
          actor: string
          actor_role: string
          agent: string | null
          created_at: string
          event_type: string
          id: string
          latency_ms: number | null
          metadata: Json
          model: string | null
          prompt_version: string | null
          risk_level: string | null
          run_id: string | null
          status: string
          tool: string | null
        }
        Insert: {
          action?: string | null
          actor?: string
          actor_role?: string
          agent?: string | null
          created_at?: string
          event_type: string
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          prompt_version?: string | null
          risk_level?: string | null
          run_id?: string | null
          status?: string
          tool?: string | null
        }
        Update: {
          action?: string | null
          actor?: string
          actor_role?: string
          agent?: string | null
          created_at?: string
          event_type?: string
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          prompt_version?: string | null
          risk_level?: string | null
          run_id?: string | null
          status?: string
          tool?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          country: string
          created_at: string
          id: string
          industry: string
          name: string
          tier: string
        }
        Insert: {
          country: string
          created_at?: string
          id?: string
          industry: string
          name: string
          tier?: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          industry?: string
          name?: string
          tier?: string
        }
        Relationships: []
      }
      company_workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: string
          terminology: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: string
          terminology?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: string
          terminology?: Json
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          company_id: string | null
          country: string
          created_at: string
          customer_code: string
          email: string
          full_name: string
          id: string
          lifetime_value: number
          phone: string | null
          segment: string
        }
        Insert: {
          company_id?: string | null
          country?: string
          created_at?: string
          customer_code: string
          email: string
          full_name: string
          id?: string
          lifetime_value?: number
          phone?: string | null
          segment?: string
        }
        Update: {
          company_id?: string | null
          country?: string
          created_at?: string
          customer_code?: string
          email?: string
          full_name?: string
          id?: string
          lifetime_value?: number
          phone?: string | null
          segment?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          activated_at: string | null
          connection_config: Json
          created_at: string
          created_by: string | null
          credential_iv: string | null
          encrypted_credentials: string | null
          id: string
          last_discovered_at: string | null
          last_error: string | null
          name: string
          source_type: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          activated_at?: string | null
          connection_config?: Json
          created_at?: string
          created_by?: string | null
          credential_iv?: string | null
          encrypted_credentials?: string | null
          id?: string
          last_discovered_at?: string | null
          last_error?: string | null
          name: string
          source_type: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          activated_at?: string | null
          connection_config?: Json
          created_at?: string
          created_by?: string | null
          credential_iv?: string | null
          encrypted_credentials?: string | null
          id?: string
          last_discovered_at?: string | null
          last_error?: string | null
          name?: string
          source_type?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          search_vector: unknown
          section: string
          token_estimate: number
        }
        Insert: {
          chunk_index: number
          content: string
          document_id: string
          id?: string
          search_vector?: unknown
          section: string
          token_estimate?: number
        }
        Update: {
          chunk_index?: number
          content?: string
          document_id?: string
          id?: string
          search_vector?: unknown
          section?: string
          token_estimate?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          author: string
          chunk_count: number
          created_at: string
          department: string
          document_type: string
          effective_date: string
          expiration_date: string | null
          id: string
          source_format: string
          status: string
          tags: string[]
          title: string
          version: string
        }
        Insert: {
          author: string
          chunk_count?: number
          created_at?: string
          department: string
          document_type: string
          effective_date?: string
          expiration_date?: string | null
          id?: string
          source_format?: string
          status?: string
          tags?: string[]
          title: string
          version?: string
        }
        Update: {
          author?: string
          chunk_count?: number
          created_at?: string
          department?: string
          document_type?: string
          effective_date?: string
          expiration_date?: string | null
          id?: string
          source_format?: string
          status?: string
          tags?: string[]
          title?: string
          version?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          department: string
          email: string
          full_name: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          department?: string
          email: string
          full_name: string
          id?: string
          role?: string
        }
        Update: {
          created_at?: string
          department?: string
          email?: string
          full_name?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      evaluation_cases: {
        Row: {
          active: boolean
          case_code: string
          category: string
          created_at: string
          expected_intent: string
          expected_result: string
          expected_tools: string[]
          id: string
          input: string
          required_evidence: string[]
          risk_level: string
        }
        Insert: {
          active?: boolean
          case_code: string
          category: string
          created_at?: string
          expected_intent: string
          expected_result: string
          expected_tools?: string[]
          id?: string
          input: string
          required_evidence?: string[]
          risk_level?: string
        }
        Update: {
          active?: boolean
          case_code?: string
          category?: string
          created_at?: string
          expected_intent?: string
          expected_result?: string
          expected_tools?: string[]
          id?: string
          input?: string
          required_evidence?: string[]
          risk_level?: string
        }
        Relationships: []
      }
      evaluation_results: {
        Row: {
          case_id: string
          citation_score: number
          created_at: string
          eval_run_id: string
          groundedness_score: number
          id: string
          intent_match: boolean
          latency_ms: number | null
          notes: string | null
          passed: boolean
          run_id: string | null
          tool_match_score: number
        }
        Insert: {
          case_id: string
          citation_score?: number
          created_at?: string
          eval_run_id: string
          groundedness_score?: number
          id?: string
          intent_match?: boolean
          latency_ms?: number | null
          notes?: string | null
          passed?: boolean
          run_id?: string | null
          tool_match_score?: number
        }
        Update: {
          case_id?: string
          citation_score?: number
          created_at?: string
          eval_run_id?: string
          groundedness_score?: number
          id?: string
          intent_match?: boolean
          latency_ms?: number | null
          notes?: string | null
          passed?: boolean
          run_id?: string | null
          tool_match_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_results_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_results_eval_run_id_fkey"
            columns: ["eval_run_id"]
            isOneToOne: false
            referencedRelation: "evaluation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_runs: {
        Row: {
          avg_latency_ms: number | null
          case_count: number
          citation_accuracy: number | null
          completed_at: string | null
          created_at: string
          estimated_cost: number
          failed: number
          failure_recovery_rate: number | null
          groundedness: number | null
          id: string
          label: string
          model: string
          mrr: number | null
          p95_latency_ms: number | null
          passed: number
          precision_at_5: number | null
          prompt_version: string
          recall_at_5: number | null
          status: string
          task_success_rate: number | null
          tool_accuracy: number | null
          total_tokens: number
          unnecessary_tool_rate: number | null
        }
        Insert: {
          avg_latency_ms?: number | null
          case_count?: number
          citation_accuracy?: number | null
          completed_at?: string | null
          created_at?: string
          estimated_cost?: number
          failed?: number
          failure_recovery_rate?: number | null
          groundedness?: number | null
          id?: string
          label: string
          model: string
          mrr?: number | null
          p95_latency_ms?: number | null
          passed?: number
          precision_at_5?: number | null
          prompt_version: string
          recall_at_5?: number | null
          status?: string
          task_success_rate?: number | null
          tool_accuracy?: number | null
          total_tokens?: number
          unnecessary_tool_rate?: number | null
        }
        Update: {
          avg_latency_ms?: number | null
          case_count?: number
          citation_accuracy?: number | null
          completed_at?: string | null
          created_at?: string
          estimated_cost?: number
          failed?: number
          failure_recovery_rate?: number | null
          groundedness?: number | null
          id?: string
          label?: string
          model?: string
          mrr?: number | null
          p95_latency_ms?: number | null
          passed?: number
          precision_at_5?: number | null
          prompt_version?: string
          recall_at_5?: number | null
          status?: string
          task_success_rate?: number | null
          tool_accuracy?: number | null
          total_tokens?: number
          unnecessary_tool_rate?: number | null
        }
        Relationships: []
      }
      imported_rows: {
        Row: {
          created_at: string
          id: number
          row_data: Json
          row_index: number
          source_id: string
          topic_name: string
        }
        Insert: {
          created_at?: string
          id?: never
          row_data: Json
          row_index: number
          source_id: string
          topic_name: string
        }
        Update: {
          created_at?: string
          id?: never
          row_data?: Json
          row_index?: number
          source_id?: string
          topic_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_rows_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          customer_id: string
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string
          order_id: string | null
          paid_at: string | null
          status: string
          tax_amount: number
        }
        Insert: {
          amount: number
          customer_id: string
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          order_id?: string | null
          paid_at?: string | null
          status?: string
          tax_amount?: number
        }
        Update: {
          amount?: number
          customer_id?: string
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          order_id?: string | null
          paid_at?: string | null
          status?: string
          tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      model_configs: {
        Row: {
          available: boolean
          created_at: string
          display_name: string
          id: string
          input_cost_per_1k: number
          is_active: boolean
          max_output_tokens: number
          model_id: string
          notes: string | null
          output_cost_per_1k: number
          provider: string
          role: string
          temperature: number
        }
        Insert: {
          available?: boolean
          created_at?: string
          display_name: string
          id?: string
          input_cost_per_1k?: number
          is_active?: boolean
          max_output_tokens?: number
          model_id: string
          notes?: string | null
          output_cost_per_1k?: number
          provider: string
          role?: string
          temperature?: number
        }
        Update: {
          available?: boolean
          created_at?: string
          display_name?: string
          id?: string
          input_cost_per_1k?: number
          is_active?: boolean
          max_output_tokens?: number
          model_id?: string
          notes?: string | null
          output_cost_per_1k?: number
          provider?: string
          role?: string
          temperature?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          line_total: number
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          line_total: number
          order_id: string
          product_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          channel: string
          created_at: string
          currency: string
          customer_id: string
          delivered_at: string | null
          id: string
          order_number: string
          placed_at: string
          promised_delivery_at: string | null
          status: string
          total_amount: number
        }
        Insert: {
          channel?: string
          created_at?: string
          currency?: string
          customer_id: string
          delivered_at?: string | null
          id?: string
          order_number: string
          placed_at?: string
          promised_delivery_at?: string | null
          status?: string
          total_amount?: number
        }
        Update: {
          channel?: string
          created_at?: string
          currency?: string
          customer_id?: string
          delivered_at?: string | null
          id?: string
          order_number?: string
          placed_at?: string
          promised_delivery_at?: string | null
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          customer_id: string
          id: string
          invoice_id: string | null
          method: string
          paid_at: string
          status: string
        }
        Insert: {
          amount: number
          customer_id: string
          id?: string
          invoice_id?: string | null
          method?: string
          paid_at?: string
          status?: string
        }
        Update: {
          amount?: number
          customer_id?: string
          id?: string
          invoice_id?: string | null
          method?: string
          paid_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          sku: string
          stock_qty: number
          unit_price: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          sku: string
          stock_qty?: number
          unit_price: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          sku?: string
          stock_qty?: number
          unit_price?: number
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          author: string
          content: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          success_score: number | null
          version: string
        }
        Insert: {
          author?: string
          content: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          success_score?: number | null
          version: string
        }
        Update: {
          author?: string
          content?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          success_score?: number | null
          version?: string
        }
        Relationships: []
      }
      schema_snapshots: {
        Row: {
          created_at: string
          diff_summary: Json
          id: string
          schema_data: Json
          source_id: string
          version: number
        }
        Insert: {
          created_at?: string
          diff_summary?: Json
          id?: string
          schema_data?: Json
          source_id: string
          version: number
        }
        Update: {
          created_at?: string
          diff_summary?: Json
          id?: string
          schema_data?: Json
          source_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "schema_snapshots_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string
          delay_days: number
          delay_reason: string | null
          delivered_at: string | null
          estimated_delivery_at: string | null
          id: string
          last_scan_location: string | null
          order_id: string
          shipped_at: string | null
          status: string
          tracking_number: string
        }
        Insert: {
          carrier: string
          delay_days?: number
          delay_reason?: string | null
          delivered_at?: string | null
          estimated_delivery_at?: string | null
          id?: string
          last_scan_location?: string | null
          order_id: string
          shipped_at?: string | null
          status?: string
          tracking_number: string
        }
        Update: {
          carrier?: string
          delay_days?: number
          delay_reason?: string | null
          delivered_at?: string | null
          estimated_delivery_at?: string | null
          id?: string
          last_scan_location?: string | null
          order_id?: string
          shipped_at?: string | null
          status?: string
          tracking_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      source_activations: {
        Row: {
          activated_at: string
          activated_by: string
          id: string
          mapping_manifest: Json
          snapshot_id: string
          source_id: string
        }
        Insert: {
          activated_at?: string
          activated_by: string
          id?: string
          mapping_manifest: Json
          snapshot_id: string
          source_id: string
        }
        Update: {
          activated_at?: string
          activated_by?: string
          id?: string
          mapping_manifest?: Json
          snapshot_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_activations_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "schema_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_activations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_fields: {
        Row: {
          access_level: string
          created_at: string
          data_type: string
          description: string
          display_name: string
          id: string
          semantic_type: string
          source_column: string
          topic_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          data_type: string
          description?: string
          display_name: string
          id?: string
          semantic_type?: string
          source_column: string
          topic_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          data_type?: string
          description?: string
          display_name?: string
          id?: string
          semantic_type?: string
          source_column?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_fields_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "source_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      source_topics: {
        Row: {
          created_at: string
          description: string
          display_name: string
          enabled: boolean
          id: string
          snapshot_id: string
          source_id: string
          source_schema: string
          source_table: string
        }
        Insert: {
          created_at?: string
          description?: string
          display_name: string
          enabled?: boolean
          id?: string
          snapshot_id: string
          source_id: string
          source_schema?: string
          source_table: string
        }
        Update: {
          created_at?: string
          description?: string
          display_name?: string
          enabled?: boolean
          id?: string
          snapshot_id?: string
          source_id?: string
          source_schema?: string
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_topics_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "schema_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_topics_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          body: string
          category: string
          created_at: string
          customer_id: string
          id: string
          order_id: string | null
          priority: string
          resolved_at: string | null
          sentiment: string
          status: string
          subject: string
          ticket_number: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          customer_id: string
          id?: string
          order_id?: string | null
          priority?: string
          resolved_at?: string | null
          sentiment?: string
          status?: string
          subject: string
          ticket_number: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string | null
          priority?: string
          resolved_at?: string | null
          sentiment?: string
          status?: string
          subject?: string
          ticket_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_calls: {
        Row: {
          created_at: string
          duration_ms: number
          error: string | null
          id: string
          input: Json
          output: Json
          permission_level: string
          risk_level: string
          run_id: string
          status: string
          tool_name: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          input?: Json
          output?: Json
          permission_level?: string
          risk_level?: string
          run_id: string
          status?: string
          tool_name: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          input?: Json
          output?: Json
          permission_level?: string
          risk_level?: string
          run_id?: string
          status?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_registry: {
        Row: {
          category: string
          created_at: string
          description: string
          enabled: boolean
          id: string
          input_schema: Json
          mcp_exposed: boolean
          name: string
          output_schema: Json
          permission_level: string
          risk_level: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          enabled?: boolean
          id?: string
          input_schema?: Json
          mcp_exposed?: boolean
          name: string
          output_schema?: Json
          permission_level?: string
          risk_level?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          input_schema?: Json
          mcp_exposed?: boolean
          name?: string
          output_schema?: Json
          permission_level?: string
          risk_level?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_first_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "operator" | "viewer"
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
    Enums: {
      app_role: ["admin", "manager", "operator", "viewer"],
    },
  },
} as const
