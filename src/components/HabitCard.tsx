import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

// --- Types ---
export type MetadataFieldType = 'number' | 'time' | 'boolean' | 'string';

export interface MetadataField {
  id: string;
  label: string;
  type: MetadataFieldType;
  defaultValue?: any;
  unit?: string; // e.g. "grams"
}

export interface Habit {
  id: string;
  name: string;
  base_xp: number;
  type: 'positive' | 'negative';
  metadataSchema?: MetadataField[];
}

interface HabitCardProps {
  habit: Habit;
  isCompleted: boolean;
  metadataValues?: Record<string, any>;
  onToggle: (habitId: string, completed: boolean) => void;
  onMetadataChange?: (habitId: string, fieldId: string, value: any) => void;
}

export function HabitCard({ habit, isCompleted, metadataValues, onToggle, onMetadataChange }: HabitCardProps) {
  // We use `status` to represent the explicit three states:
  // null = unselected, true = checked (V), false = cross (X)
  const [status, setStatus] = useState<boolean | null>(isCompleted ? true : null);
  
  // Sync if prop changes externally
  useEffect(() => {
    setStatus(prev => {
      if (isCompleted) return true;
      if (prev === false) return false;
      return null;
    });
  }, [isCompleted]);

  const handleSelectCheck = () => {
    setStatus(true);
    onToggle(habit.id, true);
  };

  const handleSelectCross = () => {
    setStatus(false);
    // Explicitly un-completing it from the system's perspective 
    // (since our parent JournalView tracks boolean 'completed' currently)
    onToggle(habit.id, false); 
  };

  const hasMetadata = habit.metadataSchema && habit.metadataSchema.length > 0;
  // Expand only if the user explicitly clicked Check [V] and there is metadata
  const isExpanded = status === true && hasMetadata;

  return (
    <div className="w-full flex flex-col px-4 py-2.5 bg-card border border-border rounded-[32px] shadow-sm transition-all duration-300 mb-2">
      
      {/* Main Row */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-[15px] sm:text-base text-foreground pl-1">
          {habit.name}
        </span>

        <div className="flex items-center gap-2">
          {/* [X] Button */}
          <button 
            onClick={handleSelectCross}
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-200",
              status === false 
                ? (habit.type === 'negative'
                  ? "bg-success text-success-foreground"
                  : "bg-destructive/20 text-destructive")
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60"
            )}
          >
            <X className="w-4 h-4" strokeWidth={3} />
          </button>

          {/* [V] Button */}
          <button 
            onClick={handleSelectCheck}
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-200",
              status === true 
                ? (habit.type === 'negative'
                  ? "bg-destructive/20 text-destructive"
                  : "bg-success text-success-foreground")
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60"
            )}
          >
            <Check className="w-4 h-4" strokeWidth={3} />
          </button>
        </div>
      </div>

      {/* Expanded Metadata Section */}
      <div 
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isExpanded ? "max-h-[500px] opacity-100 mt-4" : "max-h-0 opacity-0 mt-0"
        )}
      >
        <div className="flex flex-col gap-6 pt-2 pb-4">
          {habit.metadataSchema?.map((field) => (
            <div key={field.id} className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground max-w-[60%] pl-1">
                {field.label}
              </span>
              
              {/* Render input based on field type */}
              {field.type === 'number' && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-secondary/40 rounded-xl p-1">
                    <button 
                      onClick={() => onMetadataChange?.(habit.id, field.id, (Number(metadataValues?.[field.id] ?? field.defaultValue ?? 0) - 1))}
                      className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                      -
                    </button>
                    <input 
                      type="number"
                      value={metadataValues?.[field.id] ?? field.defaultValue ?? 0}
                      onChange={(e) => onMetadataChange?.(habit.id, field.id, Number(e.target.value))}
                      className="w-16 text-center font-bold bg-transparent text-foreground py-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button 
                      onClick={() => onMetadataChange?.(habit.id, field.id, (Number(metadataValues?.[field.id] ?? field.defaultValue ?? 0) + 1))}
                      className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
              
              {field.type === 'time' && (
                <input 
                  type="time"
                  value={metadataValues?.[field.id] ?? field.defaultValue ?? "09:00"}
                  onChange={(e) => onMetadataChange?.(habit.id, field.id, e.target.value)}
                  className="bg-secondary/40 text-foreground font-bold text-sm tracking-wider px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}

              {field.type === 'string' && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={metadataValues?.[field.id] ?? field.defaultValue ?? ""}
                    onChange={(e) => onMetadataChange?.(habit.id, field.id, e.target.value)}
                    className="bg-secondary/40 text-foreground text-sm font-bold px-4 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-ring max-w-[120px] sm:max-w-[200px]"
                    placeholder="Enter value..."
                  />
                  {field.unit && <span className="text-sm font-medium text-muted-foreground">{field.unit}</span>}
                </div>
              )}

              {field.type === 'boolean' && (
                <button
                  onClick={() => onMetadataChange?.(habit.id, field.id, !(metadataValues?.[field.id] ?? field.defaultValue ?? false))}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    (metadataValues?.[field.id] ?? field.defaultValue ?? false) ? "bg-success" : "bg-secondary"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                    (metadataValues?.[field.id] ?? field.defaultValue ?? false) ? "left-7" : "left-1"
                  )} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
