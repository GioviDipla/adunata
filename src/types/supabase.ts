export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      cards: {
        Row: {
          id: number
          scryfall_id: string
          name: string
          name_it: string | null
          flavor_name: string | null
          mana_cost: string | null
          cmc: number
          type_line: string
          oracle_text: string | null
          colors: string[] | null
          color_identity: string[]
          rarity: string
          set_code: string
          set_name: string
          collector_number: string
          image_small: string | null
          image_normal: string | null
          image_art_crop: string | null
          prices_usd: number | null
          prices_usd_foil: number | null
          prices_eur: number | null
          prices_eur_foil: number | null
          released_at: string | null
          legalities: Json | null
          power: string | null
          toughness: string | null
          keywords: string[] | null
          produced_mana: string[] | null
          layout: string | null
          card_faces: Json | null
          search_vector: unknown | null
          last_price_update: string | null
          created_at: string
          updated_at: string
          has_upkeep_trigger: boolean
          has_etb_trigger: boolean
          has_attacks_trigger: boolean
          has_dies_trigger: boolean
          has_end_step_trigger: boolean
          has_cast_trigger: boolean
        }
        Insert: {
          id?: number
          scryfall_id: string
          name: string
          name_it?: string | null
          flavor_name?: string | null
          mana_cost?: string | null
          cmc: number
          type_line: string
          oracle_text?: string | null
          colors?: string[] | null
          color_identity: string[]
          rarity: string
          set_code: string
          set_name: string
          collector_number: string
          image_small?: string | null
          image_normal?: string | null
          image_art_crop?: string | null
          prices_usd?: number | null
          prices_usd_foil?: number | null
          prices_eur?: number | null
          prices_eur_foil?: number | null
          released_at?: string | null
          legalities?: Json | null
          power?: string | null
          toughness?: string | null
          keywords?: string[] | null
          produced_mana?: string[] | null
          layout?: string | null
          card_faces?: Json | null
          search_vector?: unknown | null
          last_price_update?: string | null
          created_at?: string
          updated_at?: string
          has_upkeep_trigger?: boolean
          has_etb_trigger?: boolean
          has_attacks_trigger?: boolean
          has_dies_trigger?: boolean
          has_end_step_trigger?: boolean
          has_cast_trigger?: boolean
        }
        Update: {
          id?: number
          scryfall_id?: string
          name?: string
          name_it?: string | null
          flavor_name?: string | null
          mana_cost?: string | null
          cmc?: number
          type_line?: string
          oracle_text?: string | null
          colors?: string[] | null
          color_identity?: string[]
          rarity?: string
          set_code?: string
          set_name?: string
          collector_number?: string
          image_small?: string | null
          image_normal?: string | null
          image_art_crop?: string | null
          prices_usd?: number | null
          prices_usd_foil?: number | null
          prices_eur?: number | null
          prices_eur_foil?: number | null
          released_at?: string | null
          legalities?: Json | null
          power?: string | null
          toughness?: string | null
          keywords?: string[] | null
          produced_mana?: string[] | null
          layout?: string | null
          card_faces?: Json | null
          search_vector?: unknown | null
          last_price_update?: string | null
          created_at?: string
          updated_at?: string
          has_upkeep_trigger?: boolean
          has_etb_trigger?: boolean
          has_attacks_trigger?: boolean
          has_dies_trigger?: boolean
          has_end_step_trigger?: boolean
          has_cast_trigger?: boolean
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          id: string
          started_at: string
          completed_at: string | null
          cards_added: number
          cards_updated: number
          status: string
          error_message: string | null
        }
        Insert: {
          id?: number
          started_at?: string
          completed_at?: string | null
          cards_added?: number
          cards_updated?: number
          status?: string
          error_message?: string | null
        }
        Update: {
          id?: number
          started_at?: string
          completed_at?: string | null
          cards_added?: number
          cards_updated?: number
          status?: string
          error_message?: string | null
        }
        Relationships: []
      }
      decks: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          format: string
          visibility: string
          cover_card_id: number | null
          card_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          format: string
          visibility?: string
          cover_card_id?: number | null
          card_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          format?: string
          visibility?: string
          cover_card_id?: number | null
          card_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decks_cover_card_id_fkey"
            columns: ["cover_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      card_likes: {
        Row: {
          user_id: string
          card_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          card_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          card_id?: string
          created_at?: string
        }
        Relationships: []
      }
      deck_cards: {
        Row: {
          id: string
          deck_id: string
          card_id: number
          quantity: number
          board: string
          is_foil: boolean
          section_id: string | null
          tags: string[]
          position_in_section: number | null
          created_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          card_id: number
          quantity?: number
          board?: string
          is_foil?: boolean
          section_id?: string | null
          tags?: string[]
          position_in_section?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          card_id?: number
          quantity?: number
          board?: string
          is_foil?: boolean
          section_id?: string | null
          tags?: string[]
          position_in_section?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "deck_sections"
            referencedColumns: ["id"]
          }
        ]
      }
      deck_sections: {
        Row: {
          id: string
          deck_id: string
          name: string
          position: number
          color: string | null
          is_collapsed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          name: string
          position?: number
          color?: string | null
          is_collapsed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          name?: string
          position?: number
          color?: string | null
          is_collapsed?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_sections_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          }
        ]
      }
      game_lobbies: {
        Row: {
          id: string
          host_user_id: string
          lobby_code: string
          format: string
          status: string
          max_players: number
          winner_id: string | null
          started_at: string | null
          created_at: string
          updated_at: string
          name: string | null
        }
        Insert: {
          id?: string
          host_user_id: string
          lobby_code: string
          format: string
          status?: string
          max_players?: number
          winner_id?: string | null
          started_at?: string | null
          created_at?: string
          updated_at?: string
          name?: string | null
        }
        Update: {
          id?: string
          host_user_id?: string
          lobby_code?: string
          format?: string
          status?: string
          max_players?: number
          winner_id?: string | null
          started_at?: string | null
          created_at?: string
          updated_at?: string
          name?: string | null
        }
        Relationships: []
      }
      lobby_invitations: {
        Row: {
          id: string
          lobby_id: string
          from_user_id: string
          to_user_id: string
          status: 'pending' | 'accepted' | 'declined' | 'cancelled'
          created_at: string
          responded_at: string | null
        }
        Insert: {
          id?: string
          lobby_id: string
          from_user_id: string
          to_user_id: string
          status?: 'pending' | 'accepted' | 'declined' | 'cancelled'
          created_at?: string
          responded_at?: string | null
        }
        Update: {
          id?: string
          lobby_id?: string
          from_user_id?: string
          to_user_id?: string
          status?: 'pending' | 'accepted' | 'declined' | 'cancelled'
          created_at?: string
          responded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lobby_invitations_lobby_id_fkey"
            columns: ["lobby_id"]
            referencedRelation: "game_lobbies"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          id: string
          lobby_id: string
          user_id: string
          deck_id: string
          seat_position: number
          life_total: number
          ready: boolean
          is_first: boolean | null
          joined_at: string
        }
        Insert: {
          id?: string
          lobby_id: string
          user_id: string
          deck_id: string
          seat_position: number
          life_total?: number
          ready?: boolean
          is_first?: boolean | null
          joined_at?: string
        }
        Update: {
          id?: string
          lobby_id?: string
          user_id?: string
          deck_id?: string
          seat_position?: number
          life_total?: number
          ready?: boolean
          is_first?: boolean | null
          joined_at?: string
        }
        Relationships: []
      }
      game_states: {
        Row: {
          id: string
          lobby_id: string
          state_data: Json
          turn_number: number
          active_player_id: string
          phase: string
          updated_at: string
        }
        Insert: {
          id?: string
          lobby_id: string
          state_data: Json
          turn_number?: number
          active_player_id: string
          phase?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lobby_id?: string
          state_data?: Json
          turn_number?: number
          active_player_id?: string
          phase?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string
          bio: string | null
          username_changed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name: string
          bio?: string | null
          username_changed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          display_name?: string
          bio?: string | null
          username_changed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_log: {
        Row: {
          id: string
          lobby_id: string
          seq: number
          player_id: string | null
          action: string
          data: Json | null
          text: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          lobby_id: string
          seq: number
          player_id?: string | null
          action: string
          data?: Json | null
          text: string
          type?: string
          created_at?: string
        }
        Update: {
          id?: string
          lobby_id?: string
          seq?: number
          player_id?: string | null
          action?: string
          data?: Json | null
          text?: string
          type?: string
          created_at?: string
        }
        Relationships: []
      }
      deck_likes: {
        Row: {
          deck_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          deck_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          deck_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_likes_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      deck_comments: {
        Row: {
          id: string
          deck_id: string
          user_id: string
          body: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          user_id: string
          body: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          user_id?: string
          body?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_comments_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      sync_metadata: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_distinct_sets: {
        Args: Record<string, never>
        Returns: { set_code: string; set_name: string; latest_release: string }[]
      }
      lookup_cards_by_names: {
        Args: { card_names: string[] }
        Returns: Database['public']['Tables']['cards']['Row'][]
      }
      lookup_cards_by_name_and_set: {
        Args: {
          pairs: {
            name: string
            set_code: string
            collector_number?: string
          }[]
        }
        Returns: Database['public']['Tables']['cards']['Row'][]
      }
      get_deck_covers: {
        Args: { p_user_id: string }
        Returns: {
          deck_id: string
          card_id: string | null
          card_name: string | null
          image_small: string | null
          image_normal: string | null
          image_art_crop: string | null
        }[]
      }
      get_my_decks_summary: {
        Args: { p_user_id: string }
        Returns: {
          deck_id: string
          name: string
          format: string
          visibility: string
          updated_at: string
          card_count: number
          cover_card_id: string | null
          cover_name: string | null
          cover_image_small: string | null
          cover_image_normal: string | null
          cover_image_art_crop: string | null
        }[]
      }
      get_profile_stats: {
        Args: { p_username: string }
        Returns: {
          public_deck_count: number
          total_deck_count: number
          favorite_format: string | null
          color_frequencies: Record<string, number>
          latest_commander: { id: string; name: string; image_small: string | null; image_normal: string | null } | null
          most_used_card: { id: string; name: string; image_small: string | null } | null
          unique_cards_count: number
        }[]
      }
      search_users: {
        Args: { p_query: string; p_limit?: number }
        Returns: {
          id: string
          username: string
          display_name: string
          bio: string | null
          public_deck_count: number
        }[]
      }
      get_latest_users: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          username: string
          display_name: string
          public_deck_count: number
        }[]
      }
      process_game_action: {
        Args: {
          p_lobby_id: string
          p_player_id: string
          p_action: string
          p_action_data: Json | null
          p_action_text: string
          p_action_seq: number
          p_new_state: Json
          p_turn_number: number
          p_active_player_id: string
          p_phase: string
          p_log_type?: string
          p_expected_seq?: number
        }
        Returns: Json
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
