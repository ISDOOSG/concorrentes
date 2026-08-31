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
      ads_snapshots: {
        Row: {
          active: boolean | null
          ad_archive_id: string
          body_text: string | null
          competitor_id: string
          creatives: Json | null
          cta_text: string | null
          cta_url: string | null
          end_date: string | null
          fetched_at: string
          fetched_date: string | null
          id: string
          impressions_estimate: Json | null
          page_name: string | null
          platforms: string[] | null
          raw: Json | null
          source: string
          spend_estimate: Json | null
          start_date: string | null
          targeting: Json | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          ad_archive_id: string
          body_text?: string | null
          competitor_id: string
          creatives?: Json | null
          cta_text?: string | null
          cta_url?: string | null
          end_date?: string | null
          fetched_at?: string
          fetched_date?: string | null
          id?: string
          impressions_estimate?: Json | null
          page_name?: string | null
          platforms?: string[] | null
          raw?: Json | null
          source: string
          spend_estimate?: Json | null
          start_date?: string | null
          targeting?: Json | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          ad_archive_id?: string
          body_text?: string | null
          competitor_id?: string
          creatives?: Json | null
          cta_text?: string | null
          cta_url?: string | null
          end_date?: string | null
          fetched_at?: string
          fetched_date?: string | null
          id?: string
          impressions_estimate?: Json | null
          page_name?: string | null
          platforms?: string[] | null
          raw?: Json | null
          source?: string
          spend_estimate?: Json | null
          start_date?: string | null
          targeting?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_snapshots_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          change_id: string | null
          channel: string
          created_at: string
          id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          change_id?: string | null
          channel?: string
          created_at?: string
          id?: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          change_id?: string | null
          channel?: string
          created_at?: string
          id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_change_id_fkey"
            columns: ["change_id"]
            isOneToOne: false
            referencedRelation: "changes"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      changes: {
        Row: {
          alerted: boolean
          change_type: string
          competitor_id: string
          detected_at: string
          diff: Json
          from_snapshot_id: string
          id: string
          severity: string
          summary: string
          to_snapshot_id: string
          user_id: string
        }
        Insert: {
          alerted?: boolean
          change_type: string
          competitor_id: string
          detected_at?: string
          diff: Json
          from_snapshot_id: string
          id?: string
          severity: string
          summary: string
          to_snapshot_id: string
          user_id: string
        }
        Update: {
          alerted?: boolean
          change_type?: string
          competitor_id?: string
          detected_at?: string
          diff?: Json
          from_snapshot_id?: string
          id?: string
          severity?: string
          summary?: string
          to_snapshot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "changes_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changes_from_snapshot_id_fkey"
            columns: ["from_snapshot_id"]
            isOneToOne: false
            referencedRelation: "snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changes_to_snapshot_id_fkey"
            columns: ["to_snapshot_id"]
            isOneToOne: false
            referencedRelation: "snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          ads_link_confidence: Json | null
          ads_link_reasoning: string | null
          ads_link_suggested_at: string | null
          crawl_error: string | null
          crawl_started_at: string | null
          crawl_status: string
          created_at: string
          facebook_page_id: string | null
          facebook_page_suggestion: string | null
          google_advertiser_id: string | null
          google_advertiser_suggestion: string | null
          id: string
          instagram_handle: string | null
          instagram_handle_suggestion: string | null
          last_ads_fetched_at: string | null
          last_crawled_at: string | null
          last_instagram_fetched_at: string | null
          name: string
          status: string
          url: string
          user_id: string
        }
        Insert: {
          ads_link_confidence?: Json | null
          ads_link_reasoning?: string | null
          ads_link_suggested_at?: string | null
          crawl_error?: string | null
          crawl_started_at?: string | null
          crawl_status?: string
          created_at?: string
          facebook_page_id?: string | null
          facebook_page_suggestion?: string | null
          google_advertiser_id?: string | null
          google_advertiser_suggestion?: string | null
          id?: string
          instagram_handle?: string | null
          instagram_handle_suggestion?: string | null
          last_ads_fetched_at?: string | null
          last_crawled_at?: string | null
          last_instagram_fetched_at?: string | null
          name: string
          status?: string
          url: string
          user_id: string
        }
        Update: {
          ads_link_confidence?: Json | null
          ads_link_reasoning?: string | null
          ads_link_suggested_at?: string | null
          crawl_error?: string | null
          crawl_started_at?: string | null
          crawl_status?: string
          created_at?: string
          facebook_page_id?: string | null
          facebook_page_suggestion?: string | null
          google_advertiser_id?: string | null
          google_advertiser_suggestion?: string | null
          id?: string
          instagram_handle?: string | null
          instagram_handle_suggestion?: string | null
          last_ads_fetched_at?: string | null
          last_crawled_at?: string | null
          last_instagram_fetched_at?: string | null
          name?: string
          status?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          plan: string
          role: string
          url_quota: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          plan?: string
          role?: string
          url_quota?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          plan?: string
          role?: string
          url_quota?: number
        }
        Relationships: []
      }
      seo_analyses: {
        Row: {
          analyzed_at: string
          competitor_id: string
          created_at: string
          id: string
          meta: Json
          model: string
          opportunities: Json
          recommendations: Json
          score: number | null
          source_snapshot_id: string | null
          strengths: Json
          summary: string | null
          target_keywords: Json
          updated_at: string
          user_id: string
          weaknesses: Json
        }
        Insert: {
          analyzed_at?: string
          competitor_id: string
          created_at?: string
          id?: string
          meta?: Json
          model: string
          opportunities?: Json
          recommendations?: Json
          score?: number | null
          source_snapshot_id?: string | null
          strengths?: Json
          summary?: string | null
          target_keywords?: Json
          updated_at?: string
          user_id: string
          weaknesses?: Json
        }
        Update: {
          analyzed_at?: string
          competitor_id?: string
          created_at?: string
          id?: string
          meta?: Json
          model?: string
          opportunities?: Json
          recommendations?: Json
          score?: number | null
          source_snapshot_id?: string | null
          strengths?: Json
          summary?: string | null
          target_keywords?: Json
          updated_at?: string
          user_id?: string
          weaknesses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "seo_analyses_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_analyses_source_snapshot_id_fkey"
            columns: ["source_snapshot_id"]
            isOneToOne: false
            referencedRelation: "snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshots: {
        Row: {
          competitor_id: string
          content_hash: string
          cost_cents: number | null
          crawled_at: string
          id: string
          raw_text: string | null
          screenshot_path: string | null
          source: string
          structured_data: Json | null
          traffic_data: Json | null
          user_id: string
        }
        Insert: {
          competitor_id: string
          content_hash: string
          cost_cents?: number | null
          crawled_at?: string
          id?: string
          raw_text?: string | null
          screenshot_path?: string | null
          source: string
          structured_data?: Json | null
          traffic_data?: Json | null
          user_id: string
        }
        Update: {
          competitor_id?: string
          content_hash?: string
          cost_cents?: number | null
          crawled_at?: string
          id?: string
          raw_text?: string | null
          screenshot_path?: string | null
          source?: string
          structured_data?: Json | null
          traffic_data?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshots_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      social_analyses: {
        Row: {
          analyzed_at: string
          cadence: Json
          competitor_id: string
          cost_cents: number
          created_at: string
          engagement: Json
          format_mix: Json
          id: string
          insights: Json
          model: string
          platform: string
          source_snapshot_id: string | null
          summary: string | null
          themes: Json
          top_posts: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          analyzed_at?: string
          cadence?: Json
          competitor_id: string
          cost_cents?: number
          created_at?: string
          engagement?: Json
          format_mix?: Json
          id?: string
          insights?: Json
          model: string
          platform?: string
          source_snapshot_id?: string | null
          summary?: string | null
          themes?: Json
          top_posts?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          analyzed_at?: string
          cadence?: Json
          competitor_id?: string
          cost_cents?: number
          created_at?: string
          engagement?: Json
          format_mix?: Json
          id?: string
          insights?: Json
          model?: string
          platform?: string
          source_snapshot_id?: string | null
          summary?: string | null
          themes?: Json
          top_posts?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_snapshots: {
        Row: {
          bio: string | null
          category: string | null
          competitor_id: string
          cost_credits: number
          external_url: string | null
          fetched_at: string
          fetched_date: string
          followers: number | null
          following: number | null
          handle: string
          id: string
          is_business: boolean | null
          is_verified: boolean | null
          platform: string
          posts_count: number | null
          profile_pic_url: string | null
          raw: Json | null
          recent_posts: Json
          user_id: string
        }
        Insert: {
          bio?: string | null
          category?: string | null
          competitor_id: string
          cost_credits?: number
          external_url?: string | null
          fetched_at?: string
          fetched_date?: string
          followers?: number | null
          following?: number | null
          handle: string
          id?: string
          is_business?: boolean | null
          is_verified?: boolean | null
          platform?: string
          posts_count?: number | null
          profile_pic_url?: string | null
          raw?: Json | null
          recent_posts?: Json
          user_id: string
        }
        Update: {
          bio?: string | null
          category?: string | null
          competitor_id?: string
          cost_credits?: number
          external_url?: string | null
          fetched_at?: string
          fetched_date?: string
          followers?: number | null
          following?: number | null
          handle?: string
          id?: string
          is_business?: boolean | null
          is_verified?: boolean | null
          platform?: string
          posts_count?: number | null
          profile_pic_url?: string | null
          raw?: Json | null
          recent_posts?: Json
          user_id?: string
        }
        Relationships: []
      }
      swot_reports: {
        Row: {
          competitor_id: string
          cost_cents: number | null
          generated_at: string
          id: string
          llm_model: string
          opportunities: Json
          strengths: Json
          threats: Json
          user_id: string
          weaknesses: Json
        }
        Insert: {
          competitor_id: string
          cost_cents?: number | null
          generated_at?: string
          id?: string
          llm_model: string
          opportunities: Json
          strengths: Json
          threats: Json
          user_id: string
          weaknesses: Json
        }
        Update: {
          competitor_id?: string
          cost_cents?: number | null
          generated_at?: string
          id?: string
          llm_model?: string
          opportunities?: Json
          strengths?: Json
          threats?: Json
          user_id?: string
          weaknesses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "swot_reports_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_llm_keys: {
        Row: {
          created_at: string
          encrypted_key: string
          key_hint: string | null
          provider: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_key: string
          key_hint?: string | null
          provider: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string
          key_hint?: string | null
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      user_llm_settings: {
        Row: {
          model_classification: string | null
          model_swot: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          model_classification?: string | null
          model_swot?: string | null
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          model_classification?: string | null
          model_swot?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_scraper_keys: {
        Row: {
          created_at: string
          encrypted_key: string
          key_hint: string | null
          provider: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_key: string
          key_hint?: string | null
          provider: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string
          key_hint?: string | null
          provider?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: never; Returns: undefined }
      decrypt_llm_key: { Args: { enc: string }; Returns: string }
      encrypt_llm_key: { Args: { plain: string }; Returns: string }
      get_llm_key: {
        Args: { _provider: string; _user_id: string }
        Returns: string
      }
      get_scraper_key: {
        Args: { _provider: string; _user_id: string }
        Returns: string
      }
      invoke_daily_ads_scheduler: { Args: never; Returns: undefined }
      invoke_daily_crawl_scheduler: { Args: never; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      set_llm_key: {
        Args: { _plain: string; _provider: string }
        Returns: undefined
      }
      set_scraper_key: {
        Args: { _plain: string; _provider: string; _source?: string }
        Returns: undefined
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
