export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type CardImageBatchStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled'

export type CardImageAssetStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled'

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
          cardmarket_uri: string | null
          price_sort: number | null
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
          has_upscaled_2x: boolean
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
          cardmarket_uri?: string | null
          price_sort?: never
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
          has_upscaled_2x?: boolean
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
          cardmarket_uri?: string | null
          price_sort?: never
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
          has_upscaled_2x?: boolean
        }
        Relationships: []
      }
      card_image_batches: {
        Row: {
          id: string
          created_by: string
          label: string | null
          status: CardImageBatchStatus
          target_profile: string
          total_jobs: number
          completed_jobs: number
          failed_jobs: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by: string
          label?: string | null
          status?: CardImageBatchStatus
          target_profile?: string
          total_jobs?: number
          completed_jobs?: number
          failed_jobs?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          label?: string | null
          status?: CardImageBatchStatus
          target_profile?: string
          total_jobs?: number
          completed_jobs?: number
          failed_jobs?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'card_image_batches_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      card_image_assets: {
        Row: {
          id: string
          batch_id: string | null
          card_id: string
          scryfall_id: string
          face_index: number
          source_url: string
          storage_path: string
          status: CardImageAssetStatus
          target_profile: string
          model: string
          scale: number
          target_dpi: number
          width_px: number | null
          height_px: number | null
          bytes: number | null
          mime_type: string | null
          checksum: string | null
          attempts: number
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          batch_id?: string | null
          card_id: string
          scryfall_id: string
          face_index?: number
          source_url: string
          storage_path: string
          status?: CardImageAssetStatus
          target_profile?: string
          model?: string
          scale?: number
          target_dpi?: number
          width_px?: number | null
          height_px?: number | null
          bytes?: number | null
          mime_type?: string | null
          checksum?: string | null
          attempts?: number
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          batch_id?: string | null
          card_id?: string
          scryfall_id?: string
          face_index?: number
          source_url?: string
          storage_path?: string
          status?: CardImageAssetStatus
          target_profile?: string
          model?: string
          scale?: number
          target_dpi?: number
          width_px?: number | null
          height_px?: number | null
          bytes?: number | null
          mime_type?: string | null
          checksum?: string | null
          attempts?: number
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'card_image_assets_batch_id_fkey'
            columns: ['batch_id']
            isOneToOne: false
            referencedRelation: 'card_image_batches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'card_image_assets_card_id_fkey'
            columns: ['card_id']
            isOneToOne: false
            referencedRelation: 'cards'
            referencedColumns: ['id']
          },
        ]
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
      user_cards: {
        Row: {
          id: string
          user_id: string
          card_id: number
          quantity: number
          foil: boolean
          language: string
          condition: 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'D' | null
          acquired_at: string | null
          acquired_price_eur: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          card_id: number
          quantity?: number
          foil?: boolean
          language?: string
          condition?: 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'D' | null
          acquired_at?: string | null
          acquired_price_eur?: number | null
          notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          card_id?: number
          quantity?: number
          foil?: boolean
          language?: string
          condition?: 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'D' | null
          acquired_at?: string | null
          acquired_price_eur?: number | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cards_user_id_fkey"
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
      mtg_rules: {
        Row: {
          id: string
          rule_number: string
          parent_rule_number: string | null
          section_title: string | null
          text: string
          source_version: string
          keywords: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          rule_number: string
          parent_rule_number?: string | null
          section_title?: string | null
          text: string
          source_version: string
          keywords?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          rule_number?: string
          parent_rule_number?: string | null
          section_title?: string | null
          text?: string
          source_version?: string
          keywords?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      card_rulings: {
        Row: {
          id: string
          card_id: string
          scryfall_oracle_id: string | null
          ruling_date: string | null
          text: string
          source: string
          keywords: string[]
          created_at: string
        }
        Insert: {
          id?: string
          card_id: string
          scryfall_oracle_id?: string | null
          ruling_date?: string | null
          text: string
          source?: string
          keywords?: string[]
          created_at?: string
        }
        Update: {
          id?: string
          card_id?: string
          scryfall_oracle_id?: string | null
          ruling_date?: string | null
          text?: string
          source?: string
          keywords?: string[]
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_rulings_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          }
        ]
      }
      goblinai_conversations: {
        Row: {
          id: string
          user_id: string
          title: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      goblinai_messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          mentioned_card_ids: string[]
          interaction_keywords: string[]
          retrieved_rule_numbers: string[]
          retrieved_ruling_ids: string[]
          restatement_status: 'none' | 'pending_confirmation' | 'confirmed'
          model: string | null
          prompt_tokens: number | null
          completion_tokens: number | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          mentioned_card_ids?: string[]
          interaction_keywords?: string[]
          retrieved_rule_numbers?: string[]
          retrieved_ruling_ids?: string[]
          restatement_status?: 'none' | 'pending_confirmation' | 'confirmed'
          model?: string | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          user_id?: string
          role?: 'user' | 'assistant' | 'system'
          content?: string
          mentioned_card_ids?: string[]
          interaction_keywords?: string[]
          retrieved_rule_numbers?: string[]
          retrieved_ruling_ids?: string[]
          restatement_status?: 'none' | 'pending_confirmation' | 'confirmed'
          model?: string | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goblinai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "goblinai_conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      goblinai_feedback: {
        Row: {
          id: string
          message_id: string
          user_id: string
          correction: string
          original_answer: string
          conversation_context: string | null
          resolved: boolean
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          correction: string
          original_answer?: string
          conversation_context?: string | null
          resolved?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          correction?: string
          original_answer?: string
          conversation_context?: string | null
          resolved?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goblinai_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "goblinai_messages"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          deck_id: string | null
          actor_id: string
          comment_id: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          deck_id?: string | null
          actor_id: string
          comment_id?: string | null
          read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          deck_id?: string | null
          actor_id?: string
          comment_id?: string | null
          read?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "deck_comments"
            referencedColumns: ["id"]
          }
        ]
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
      search_public_decks: {
        Args: {
          p_name?: string
          p_creator_id?: string
          p_commander?: string
          p_colors?: string
          p_color_identity?: string
          p_cards?: string
          p_card_mode?: string
          p_format?: string
          p_sort?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          id: string
          name: string
          description: string | null
          format: string | null
          card_count: number
          updated_at: string
          created_at: string
          user_id: string
          creator_username: string | null
          creator_display_name: string | null
          commander_card_id: string | null
          commander_name: string | null
          cover_card_id: string | null
          cover_image_art_crop: string | null
          cover_image_normal: string | null
          like_count: number
          price_eur: number
        }[]
      }
      search_my_decks: {
        Args: {
          p_name?: string
          p_commander?: string
          p_colors?: string
          p_color_identity?: string
          p_cards?: string
          p_card_mode?: string
          p_format?: string
          p_sort?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          id: string
          name: string
          description: string | null
          format: string | null
          card_count: number
          updated_at: string
          created_at: string
          user_id: string
          creator_username: string | null
          creator_display_name: string | null
          commander_card_id: string | null
          commander_name: string | null
          cover_card_id: string | null
          cover_image_art_crop: string | null
          cover_image_normal: string | null
          like_count: number
          price_eur: number
          visibility: string
        }[]
      }
      search_cards_autocomplete: {
        Args: { p_query: string; p_limit?: number }
        Returns: {
          id: string
          name: string
          name_it: string | null
          image_small: string | null
          image_normal: string | null
          type_line: string | null
          mana_cost: string | null
          has_upscaled_2x: boolean
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
      batch_update_deck_card_sections: {
        Args: { p_updates: Json }
        Returns: void
      }
      batch_update_user_cards_quantity: {
        Args: { p_updates: Json }
        Returns: void
      }
      batch_update_deck_card_quantities: {
        Args: { p_updates: Json }
        Returns: void
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
