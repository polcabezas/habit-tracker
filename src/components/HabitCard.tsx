import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

// --- Types ---
export type MetadataFieldType = 'number' | 'time' | 'boolean' | 'string' | 'duration';

export type ScoringMode = 'linear' | 'logarithmic' | 'exponential' | 'asymmetric' | 'tiered';

export interface ScoringTier {
  upTo: string | number;  // exclusive upper bound; Infinity / "23:59" for last tier
  multiplier: number;     // 0.0–1.0
}

export interface ScoringConfig {
  mode: ScoringMode;
  // linear / logarithmic / exponential:
  ideal?: string | number;
  worst?: string | number;
  // asymmetric (time fields — earlier is better):
  earlyGrace?: number;    // minutes early still scoring 1.0 (default: 60)
  lateGrace?: number;     // minutes late still scoring 1.0 (default: 0)
  lateCliff?: number;     // minutes late where penalty steepens (default: 60)
  // tiered:
  tiers?: ScoringTier[];
  // common:
  minMultiplier?: number; // XP floor, e.g. 0.1 = never less than 10% (default: 0)
}

export interface MetadataField {
  id: string;
  label: string;
  type: MetadataFieldType;
  defaultValue?: any;
  unit?: string; // e.g. "grams"
  scoringConfig?: ScoringConfig;
}

export interface Habit {
  id: string;
  name: string;
  base_xp: number;
  type: 'positive' | 'negative';
  metadataSchema?: MetadataField[];
  frequency?: number[];
}

interface HabitCardProps {
  habit: Habit;
  isCompleted: boolean;
  metadataValues?: Record<string, any>;
  onToggle: (habitId: string, completed: boolean) => void;
  onMetadataChange?: (habitId: string, fieldId: string, value: any) => void;
  streak?: number;
  xpEarned?: number;
  gradientMultiplier?: number;
}

export function HabitCard({ habit, isCompleted, metadataValues, onToggle, onMetadataChange, streak, xpEarned, gradientMultiplier }: HabitCardProps) {
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
  const hasScoredFields = habit.metadataSchema?.some(f => f.scoringConfig) ?? false;
  // Expand only if the user explicitly clicked Check [V] and there is metadata
  const isExpanded = status === true && hasMetadata;

  return (
    <div className="w-full flex flex-col px-4 py-2.5 bg-card border border-border rounded-[32px] shadow-sm transition-all duration-300 mb-2">
      
      {/* Main Row */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-medium text-[15px] sm:text-base text-foreground pl-1">
            {habit.name}
          </span>
          {isCompleted && (streak !== undefined && streak > 0 || (hasScoredFields && gradientMultiplier !== undefined)) && (
            <div className="flex items-center gap-1 mt-0.5 pl-1 opacity-80 flex-wrap">
              {streak !== undefined && streak > 0 && (
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                  habit.type === 'negative'
                    ? "text-destructive bg-destructive/10"
                    : "text-orange-400 bg-orange-500/10"
                )}>
                  {habit.type === 'negative'
                    ? `-${Math.round(streak * 5)}% XP Penalty`
                    : `+${Math.round(streak * 5)}% Streak Bonus`}
                </span>
              )}
              {hasScoredFields && gradientMultiplier !== undefined && (
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                  gradientMultiplier >= 0.8
                    ? "text-emerald-500 bg-emerald-500/10"
                    : gradientMultiplier >= 0.5
                    ? "text-yellow-500 bg-yellow-500/10"
                    : "text-red-400 bg-red-400/10"
                )}>
                  Quality: {Math.round(gradientMultiplier * 100)}%
                </span>
              )}
              <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                ({habit.type === 'negative' ? '-' : ''}{Math.abs(xpEarned ?? 0)} XP)
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* [X] Button */}
          <button 
            onClick={handleSelectCross}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200",
              status === false 
                ? (habit.type === 'negative'
                  ? "bg-success text-success-foreground"
                  : "bg-destructive/20 text-destructive")
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60"
            )}
          >
            <X className="w-5 h-5" strokeWidth={3} />
          </button>

          {/* [V] Button */}
          <button 
            onClick={handleSelectCheck}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200",
              status === true 
                ? (habit.type === 'negative'
                  ? "bg-destructive/20 text-destructive"
                  : "bg-success text-success-foreground")
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60"
            )}
          >
            <Check className="w-5 h-5" strokeWidth={3} />
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
              <span className="text-sm font-medium text-foreground max-w-[50%] pl-1">
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
              
              {field.type === 'duration' && (() => {
                const totalMinutes = Number(metadataValues?.[field.id] ?? field.defaultValue ?? 0);
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                // Cap hours at 23 to work with type="time"
                const displayHours = Math.min(23, hours);
                const timeString = `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                
                return (
                  <input
                    type="time"
                    value={timeString}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [h, m] = e.target.value.split(':').map(Number);
                      if (!isNaN(h) && !isNaN(m)) {
                        onMetadataChange?.(habit.id, field.id, (h * 60) + m);
                      }
                    }}
                    className="bg-secondary/40 text-foreground font-bold text-sm tracking-wider px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                );
              })()}

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

