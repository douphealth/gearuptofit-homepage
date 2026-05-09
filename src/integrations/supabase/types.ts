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
      ai_fixes_cache: {
        Row: {
          fixes: Json
          generated_at: string
          post_id: number
        }
        Insert: {
          fixes: Json
          generated_at?: string
          post_id: number
        }
        Update: {
          fixes?: Json
          generated_at?: string
          post_id?: number
        }
        Relationships: []
      }
      audit_history: {
        Row: {
          id: number
          post_id: number
          scanned_at: string
          score: number
        }
        Insert: {
          id?: number
          post_id: number
          scanned_at?: string
          score: number
        }
        Update: {
          id?: number
          post_id?: number
          scanned_at?: string
          score?: number
        }
        Relationships: []
      }
      audit_scores: {
        Row: {
          issues: Json
          metrics: Json
          post_id: number
          scanned_at: string
          score: number
        }
        Insert: {
          issues?: Json
          metrics?: Json
          post_id: number
          scanned_at?: string
          score: number
        }
        Update: {
          issues?: Json
          metrics?: Json
          post_id?: number
          scanned_at?: string
          score?: number
        }
        Relationships: []
      }
      autolink_markers: {
        Row: {
          anchor: string
          applied_at: string
          content_hash: string | null
          end_offset: number
          id: number
          post_id: number
          start_offset: number
          target_id: number
          target_url: string
        }
        Insert: {
          anchor: string
          applied_at?: string
          content_hash?: string | null
          end_offset: number
          id?: number
          post_id: number
          start_offset: number
          target_id: number
          target_url: string
        }
        Update: {
          anchor?: string
          applied_at?: string
          content_hash?: string | null
          end_offset?: number
          id?: number
          post_id?: number
          start_offset?: number
          target_id?: number
          target_url?: string
        }
        Relationships: []
      }
      push_log: {
        Row: {
          created_at: string
          draft_url: string | null
          id: number
          message: string | null
          post_id: number
          status: string
        }
        Insert: {
          created_at?: string
          draft_url?: string | null
          id?: number
          message?: string | null
          post_id: number
          status: string
        }
        Update: {
          created_at?: string
          draft_url?: string | null
          id?: number
          message?: string | null
          post_id?: number
          status?: string
        }
        Relationships: []
      }
      wp_cleanup_checkpoints: {
        Row: {
          affected: Json
          created_at: string
          key: string
          page: number
          per_page: number
          phase: string
          processed_ids: number[]
          results: Json
          total_pages: number | null
          updated_at: string
        }
        Insert: {
          affected?: Json
          created_at?: string
          key: string
          page?: number
          per_page?: number
          phase?: string
          processed_ids?: number[]
          results?: Json
          total_pages?: number | null
          updated_at?: string
        }
        Update: {
          affected?: Json
          created_at?: string
          key?: string
          page?: number
          per_page?: number
          phase?: string
          processed_ids?: number[]
          results?: Json
          total_pages?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      wp_import_pages: {
        Row: {
          error: string | null
          fetched_at: string | null
          imported_count: number
          page: number
          post_ids: number[]
          post_refs: Json
          retry_count: number
          run_id: string
          status: string
          updated_at: string
        }
        Insert: {
          error?: string | null
          fetched_at?: string | null
          imported_count?: number
          page: number
          post_ids?: number[]
          post_refs?: Json
          retry_count?: number
          run_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          error?: string | null
          fetched_at?: string | null
          imported_count?: number
          page?: number
          post_ids?: number[]
          post_refs?: Json
          retry_count?: number
          run_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_import_pages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wp_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_import_runs: {
        Row: {
          completed_at: string | null
          error: string | null
          expected_pages: number
          expected_total: number
          first_missing_page: number | null
          id: string
          imported_total: number
          per_page: number
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          expected_pages?: number
          expected_total?: number
          first_missing_page?: number | null
          id?: string
          imported_total?: number
          per_page?: number
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          expected_pages?: number
          expected_total?: number
          first_missing_page?: number | null
          id?: string
          imported_total?: number
          per_page?: number
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wp_post_backups: {
        Row: {
          content: string
          created_at: string
          date_gmt: string | null
          id: number
          post_id: number
          run_id: string | null
          status: string | null
        }
        Insert: {
          content: string
          created_at?: string
          date_gmt?: string | null
          id?: number
          post_id: number
          run_id?: string | null
          status?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          date_gmt?: string | null
          id?: number
          post_id?: number
          run_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      wp_posts_cache: {
        Row: {
          data: Json
          fetched_at: string
          link: string | null
          modified_at: string | null
          post_id: number
          slug: string | null
          title: string | null
        }
        Insert: {
          data: Json
          fetched_at?: string
          link?: string | null
          modified_at?: string | null
          post_id: number
          slug?: string | null
          title?: string | null
        }
        Update: {
          data?: Json
          fetched_at?: string
          link?: string | null
          modified_at?: string | null
          post_id?: number
          slug?: string | null
          title?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
