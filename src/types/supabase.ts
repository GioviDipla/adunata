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
          legalities: Json | null
          power: string | null
          toughness: string | null
          keywords: string[] | null
          produced_mana: string[] | null
          layout: string | null
          card_faces: Json | null
          search_vector: unknown | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          scryfall_id: string
          name: string
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
          legalities?: Json | null
          power?: string | null
          toughness?: string | null
          keywords?: string[] | null
          produced_mana?: string[] | null
          layout?: string | null
          card_faces?: Json | null
          search_vector?: unknown | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          scryfall_id?: string
          name?: string
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
          legalities?: Json | null
          power?: string | null
          toughness?: string | null
          keywords?: string[] | null
          produced_mana?: string[] | null
          layout?: string | null
          card_faces?: Json | null
          search_vector?: unknown | null
          created_at?: string
          updated_at?: string
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
          cover_card_id: number | null
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          format: string
          cover_card_id?: number | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          format?: string
          cover_card_id?: number | null
          is_public?: boolean
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
      deck_cards: {
        Row: {
          id: string
          deck_id: string
          card_id: number
          quantity: number
          board: string
          created_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          card_id: number
          quantity?: number
          board?: string
          created_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          card_id?: number
          quantity?: number
          board?: string
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
        }
        Relationships: []
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
      game_log: {
        Row: {
          id: string
          lobby_id: string
          seq: number
          player_id: string | null
          action: string
          data: Json | null
          text: string
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
          created_at?: string
        }
        Relationships: []
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
