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
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type?: 'positive' | 'negative'
          base_xp?: number
          metadata_schema?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: 'positive' | 'negative'
          base_xp?: number
          metadata_schema?: Json | null
          created_at?: string
          updated_at?: string
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
        }
        Insert: {
          id?: string
          habit_id: string
          user_id: string
          completed_at?: string
          date: string
          metadata_values?: Json | null
        }
        Update: {
          id?: string
          habit_id?: string
          user_id?: string
          completed_at?: string
          date?: string
          metadata_values?: Json | null
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
