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
      habits: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'positive' | 'negative'
          base_xp: number
          metadata_schema: Json | null
          frequency: number[] | null
          created_at: string
          updated_at: string
          streak_count: number
          streak_last_date: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type?: 'positive' | 'negative'
          base_xp?: number
          metadata_schema?: Json | null
          frequency?: number[] | null
          created_at?: string
          updated_at?: string
          streak_count?: number
          streak_last_date?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: 'positive' | 'negative'
          base_xp?: number
          metadata_schema?: Json | null
          frequency?: number[] | null
          created_at?: string
          updated_at?: string
          streak_count?: number
          streak_last_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "habits_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      habit_logs: {
        Row: {
          id: string
          habit_id: string
          user_id: string
          completed_at: string
          date: string
          metadata_values: Json | null
          xp_earned: number
        }
        Insert: {
          id?: string
          habit_id: string
          user_id: string
          completed_at?: string
          date: string
          metadata_values?: Json | null
          xp_earned?: number
        }
        Update: {
          id?: string
          habit_id?: string
          user_id?: string
          completed_at?: string
          date?: string
          metadata_values?: Json | null
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_logs_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      user_stats: {
        Row: { user_id: string; freeze_count: number; rewarded_weeks: number; updated_at: string; global_streak: number; global_streak_last_date: string | null; total_xp: number }
        Insert: { user_id: string; freeze_count?: number; rewarded_weeks?: number; updated_at?: string; global_streak?: number; global_streak_last_date?: string | null; total_xp?: number }
        Update: { freeze_count?: number; rewarded_weeks?: number; updated_at?: string; global_streak?: number; global_streak_last_date?: string | null; total_xp?: number }
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
      habit_type: 'positive' | 'negative'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
