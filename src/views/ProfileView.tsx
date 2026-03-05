import { Moon, Sun, Monitor, Plus, Settings, Trash2, LogOut, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import type { MetadataField, MetadataFieldType, ScoringConfig, ScoringMode } from '@/components/HabitCard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Habit } from '@/components/HabitCard';

export function ProfileView() {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  
  // Minimal scaffolding for the form
  const [habitName, setHabitName] = useState('');
  const [habitType, setHabitType] = useState<'positive' | 'negative'>('positive');
  const [baseXp, setBaseXp] = useState(10);
  const [metadataSchema, setMetadataSchema] = useState<MetadataField[]>([]);
  const [frequency, setFrequency] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // Fetch current user's habits
  const habitsQuery = useQuery({
    queryKey: ['habits'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return [];

      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        base_xp: row.base_xp,
        type: row.type,
        metadataSchema: row.metadata_schema as any,
        frequency: row.frequency,
      })) as Habit[];
    }
  });

  const handleAddField = () => {
    setMetadataSchema([...metadataSchema, {
      id: Math.random().toString(36).slice(2),
      label: '', // User must type a name for the parameter
      type: 'number',
    }]);
  };

  const updateField = (id: string, updates: Partial<MetadataField>) => {
    setMetadataSchema(metadataSchema.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const updateScoringConfig = (fieldId: string, updates: Partial<ScoringConfig> | null) => {
    setMetadataSchema(metadataSchema.map(f => {
      if (f.id !== fieldId) return f;
      if (updates === null) {
        const { scoringConfig: _, ...rest } = f;
        return rest;
      }
      return { ...f, scoringConfig: { ...(f.scoringConfig ?? { mode: 'exponential' }), ...updates } as ScoringConfig };
    }));
  };

  const removeField = (id: string) => {
    setMetadataSchema(metadataSchema.filter(f => f.id !== id));
  };

  const createHabitMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("You must be logged in to create a habit.");

      const { error } = await supabase
        .from('habits')
        .insert({
          user_id: userId,
          name: habitName,
          type: habitType,
          base_xp: Number(baseXp),
          metadata_schema: metadataSchema.length > 0 ? (metadataSchema as any) : null,
          frequency: frequency
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      setHabitName('');
      setMetadataSchema([]);
      setFrequency([0, 1, 2, 3, 4, 5, 6]);
    },
    onError: (err) => {
      console.error('Error adding habit:', err);
      alert('Failed to add habit: ' + err.message);
    }
  });

  const deleteHabitMutation = useMutation({
    mutationFn: async (habitId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Must be logged in to delete.");

      const { error } = await supabase
        .from('habits')
        .delete()
        .eq('id', habitId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      // Also potentially invalidate log entries
      queryClient.invalidateQueries({ queryKey: ['journal'] });
    },
    onError: (err) => {
      console.error('Error deleting habit:', err);
      alert('Failed to delete habit.');
    }
  });

  const handleAddHabit = (e: React.FormEvent) => {
    e.preventDefault();
    createHabitMutation.mutate();
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-black tracking-tight mb-2">Profile</h1>

      {/* Add Habit Form */}
      <div className="bg-card border border-border rounded-[32px] p-6 shadow-sm mb-2">
        <div className="flex items-center gap-2 mb-6">
          <div className="bg-primary/10 p-2 rounded-full text-foreground">
            <Plus className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <h3 className="font-bold text-lg text-foreground">Create New Habit</h3>
        </div>
        
        <form onSubmit={handleAddHabit} className="flex flex-col gap-4">
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Habit Name</label>
            <input 
              required
              type="text" 
              value={habitName}
              onChange={(e) => setHabitName(e.target.value)}
              placeholder="e.g. Read 10 Pages" 
              className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-all text-foreground font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Type</label>
              <select 
                value={habitType}
                onChange={(e) => setHabitType(e.target.value as 'positive' | 'negative')}
                className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-all appearance-none text-foreground font-medium"
              >
                <option value="positive">Positive (Do)</option>
                <option value="negative">Negative (Avoid)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Base XP</label>
              <input 
                type="number" 
                min="5"
                step="5"
                value={baseXp}
                onChange={(e) => setBaseXp(Number(e.target.value))}
                className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-all text-foreground font-medium"
              />
            </div>
          </div>

          {/* Days of the Week Selector */}
          <div className="pt-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Frequency (Days of the week)</label>
            <div className="flex gap-1 sm:gap-2 w-full justify-between">
              {[
                { label: 'S', value: 0 },
                { label: 'M', value: 1 },
                { label: 'T', value: 2 },
                { label: 'W', value: 3 },
                { label: 'T', value: 4 },
                { label: 'F', value: 5 },
                { label: 'S', value: 6 },
              ].map((day) => {
                const isSelected = frequency.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setFrequency(prev => prev.filter(d => d !== day.value));
                      } else {
                        setFrequency(prev => [...prev, day.value].sort());
                      }
                    }}
                    className={`h-10 w-10 flex items-center justify-center rounded-full text-sm font-bold transition-all ${
                      isSelected 
                        ? 'bg-primary text-primary-foreground shadow-md scale-105' 
                        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary border border-border/50'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            {frequency.length === 0 && (
              <p className="text-xs text-destructive mt-2 font-medium">Please select at least one day.</p>
            )}
          </div>

          {/* Metadata Fields Section */}
          <div className="pt-4 border-t border-border mt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Custom Parameters</label>
              <button 
                type="button" 
                onClick={handleAddField}
                className="text-xs font-bold bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-full text-foreground transition-colors"
                >
                + Add Parameter
              </button>
            </div>
            
            <div className="flex flex-col gap-3">
              {metadataSchema.map(field => (
                <div key={field.id} className="bg-secondary/50 border border-border p-4 rounded-2xl flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <input 
                      type="text" 
                      value={field.label}
                      onChange={e => updateField(field.id, { label: e.target.value })}
                      placeholder="Parameter Name (e.g. Cups, Minutes)"
                      className="w-full bg-transparent border-b border-border/50 px-1 py-1.5 text-sm focus:outline-none focus:border-ring/50 text-foreground font-medium"
                    />
                    <button type="button" onClick={() => removeField(field.id)} className="p-1.5 text-muted-foreground hover:text-destructive bg-secondary/50 hover:bg-secondary rounded-lg transition-colors mt-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={field.type}
                      onChange={e => updateField(field.id, { type: e.target.value as MetadataFieldType })}
                      className="w-[45%] bg-card border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring appearance-none text-foreground font-medium"
                    >
                      <option value="number">Number Input</option>
                      <option value="duration">Duration Input</option>
                      <option value="time">Time Input</option>
                      <option value="string">Text Input</option>
                      <option value="boolean">Yes/No Toggle</option>
                    </select>

                    {/* Optional config based on type */}
                    {(field.type === 'number' || field.type === 'string') && (
                      <input
                        type="text"
                        value={field.defaultValue || ''}
                        onChange={e => updateField(field.id, { defaultValue: e.target.value })}
                        placeholder="Default"
                        className="w-[30%] bg-card border border-border rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium"
                      />
                    )}
                    {field.type === 'string' && (
                      <input
                        type="text"
                        value={field.unit || ''}
                        onChange={e => updateField(field.id, { unit: e.target.value })}
                        placeholder="Unit (g, ml)"
                        className="w-[25%] bg-card border border-border rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium"
                      />
                    )}
                  </div>

                  {/* ── Scoring Config ──────────────────────────────────────── */}
                  {(field.type === 'number' || field.type === 'duration' || field.type === 'time') && (
                    <div className="border-t border-border/40 pt-3 flex flex-col gap-3">
                      {/* Toggle */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!field.scoringConfig}
                          onChange={e => {
                            if (e.target.checked) {
                              const defaultMode: ScoringMode = field.type === 'time' ? 'asymmetric' : 'logarithmic';
                              updateScoringConfig(field.id, { mode: defaultMode });
                            } else {
                              updateScoringConfig(field.id, null);
                            }
                          }}
                          className="w-3.5 h-3.5 rounded accent-primary"
                        />
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Affects XP scoring</span>
                      </label>

                      {field.scoringConfig && (
                        <div className="flex flex-col gap-3 pl-1">
                          {/* Mode selector */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-10">Mode</span>
                            <select
                              value={field.scoringConfig.mode}
                              onChange={e => updateScoringConfig(field.id, { mode: e.target.value as ScoringMode })}
                              className="flex-1 bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring appearance-none text-foreground font-medium"
                            >
                              {field.type === 'time' ? (
                                <>
                                  <option value="logarithmic">Logarithmic (default)</option>
                                  <option value="linear">Linear</option>
                                  <option value="asymmetric">Asymmetric (earlier = better)</option>
                                </>
                              ) : (
                                <>
                                  <option value="logarithmic">Logarithmic (default)</option>
                                  <option value="exponential">Exponential</option>
                                  <option value="linear">Linear</option>
                                  <option value="tiered">Tiered</option>
                                </>
                              )}
                            </select>
                          </div>

                          {/* Logarithmic / Exponential / Linear inputs */}
                          {(field.scoringConfig.mode === 'logarithmic' || field.scoringConfig.mode === 'exponential' || field.scoringConfig.mode === 'linear') && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Ideal value</span>
                                <input
                                  type={field.type === 'time' ? 'time' : 'number'}
                                  value={field.scoringConfig.ideal ?? ''}
                                  onChange={e => updateScoringConfig(field.id, { ideal: field.type === 'time' ? e.target.value : Number(e.target.value) })}
                                  placeholder={field.type === 'time' ? '22:00' : '10'}
                                  className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium [&::-webkit-calendar-picker-indicator]:opacity-40 [&::-webkit-calendar-picker-indicator]:invert"
                                />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Worst value</span>
                                <input
                                  type={field.type === 'time' ? 'time' : 'number'}
                                  value={field.scoringConfig.worst ?? ''}
                                  onChange={e => updateScoringConfig(field.id, { worst: field.type === 'time' ? e.target.value : Number(e.target.value) })}
                                  placeholder={field.type === 'time' ? '00:00' : '0'}
                                  className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium [&::-webkit-calendar-picker-indicator]:opacity-40 [&::-webkit-calendar-picker-indicator]:invert"
                                />
                              </div>
                            </div>
                          )}

                          {/* Asymmetric inputs */}
                          {field.scoringConfig.mode === 'asymmetric' && (
                            <div className="flex flex-col gap-2">
                              <div>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Ideal time</span>
                                <input
                                  type="time"
                                  value={field.scoringConfig.ideal ?? ''}
                                  onChange={e => updateScoringConfig(field.id, { ideal: e.target.value })}
                                  className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium [&::-webkit-calendar-picker-indicator]:opacity-40 [&::-webkit-calendar-picker-indicator]:invert"
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-2 items-end">
                                <div>
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Pre-allowance (min)</span>
                                  <span className="text-[9px] text-muted-foreground block mb-1">minutes before ideal at 100%</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={field.scoringConfig.earlyGrace ?? 60}
                                    onChange={e => updateScoringConfig(field.id, { earlyGrace: Number(e.target.value) })}
                                    className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Post-allowance (min)</span>
                                  <span className="text-[9px] text-muted-foreground block mb-1">minutes after ideal at 100%</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={field.scoringConfig.lateGrace ?? 0}
                                    onChange={e => updateScoringConfig(field.id, { lateGrace: Number(e.target.value) })}
                                    className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Decay σ (min to 50%)</span>
                                  <span className="text-[9px] text-muted-foreground block mb-1">minutes past plateau edge → 50% XP</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={field.scoringConfig.lateCliff ?? 90}
                                    onChange={e => updateScoringConfig(field.id, { lateCliff: Number(e.target.value) })}
                                    className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Tiered inputs */}
                          {field.scoringConfig.mode === 'tiered' && (
                            <div className="flex flex-col gap-2">
                              {(field.scoringConfig.tiers ?? []).map((tier, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground font-medium w-8 shrink-0">≤</span>
                                  <input
                                    type={field.type === 'time' ? 'time' : 'number'}
                                    value={tier.upTo === Infinity ? '' : String(tier.upTo)}
                                    onChange={e => {
                                      const newTiers = [...(field.scoringConfig!.tiers ?? [])];
                                      newTiers[idx] = { ...tier, upTo: field.type === 'time' ? e.target.value : Number(e.target.value) };
                                      updateScoringConfig(field.id, { tiers: newTiers });
                                    }}
                                    placeholder="threshold"
                                    className="flex-1 bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={Math.round(tier.multiplier * 100)}
                                    onChange={e => {
                                      const newTiers = [...(field.scoringConfig!.tiers ?? [])];
                                      newTiers[idx] = { ...tier, multiplier: Number(e.target.value) / 100 };
                                      updateScoringConfig(field.id, { tiers: newTiers });
                                    }}
                                    placeholder="XP%"
                                    className="w-16 bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium"
                                  />
                                  <span className="text-[10px] text-muted-foreground">%</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newTiers = (field.scoringConfig!.tiers ?? []).filter((_, i) => i !== idx);
                                      updateScoringConfig(field.id, { tiers: newTiers });
                                    }}
                                    className="text-muted-foreground hover:text-destructive text-xs px-1"
                                  >✕</button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const newTiers = [...(field.scoringConfig!.tiers ?? []), { upTo: 0, multiplier: 1.0 }];
                                  updateScoringConfig(field.id, { tiers: newTiers });
                                }}
                                className="text-[10px] font-bold text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary px-3 py-1.5 rounded-lg transition-colors self-start"
                              >
                                + Add tier
                              </button>
                            </div>
                          )}

                          {/* Min XP floor */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex-1">Min XP floor %</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={Math.round((field.scoringConfig.minMultiplier ?? 0) * 100)}
                              onChange={e => updateScoringConfig(field.id, { minMultiplier: Number(e.target.value) / 100 })}
                              className="w-16 bg-card border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-medium"
                            />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {metadataSchema.length === 0 && (
                <div className="text-center p-6 bg-secondary/30 rounded-2xl border border-border border-dashed">
                  <span className="text-xs font-medium text-muted-foreground">No custom parameters added.<br/>Click "+ Add Parameter" to track units or times.</span>
                </div>
              )}
            </div>
          </div>

          <button 
            type="submit" 
            disabled={createHabitMutation.isPending || !habitName || frequency.length === 0}
            className="mt-4 w-full bg-primary text-primary-foreground font-black uppercase tracking-widest text-sm rounded-full py-3.5 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all shadow-md"
          >
            {createHabitMutation.isPending ? 'Creating...' : 'Add Habit'}
          </button>
        </form>
      </div>

      {/* Existing Habits List */}
      <div className="bg-card border border-border rounded-[32px] p-6 shadow-sm mb-2">
        <div className="flex items-center gap-2 mb-6">
          <div className="bg-primary/10 p-2 rounded-full text-foreground">
            <ListChecks className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <h3 className="font-bold text-lg text-foreground">Your Habits</h3>
        </div>
        
        {habitsQuery.isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm font-medium">Loading habits...</div>
        ) : habitsQuery.data && habitsQuery.data.length > 0 ? (
          <div className="flex flex-col gap-3">
            {habitsQuery.data.map(habit => (
              <div key={habit.id} className="flex items-center justify-between p-4 bg-secondary/30 border border-border rounded-2xl">
                <div>
                  <h4 className="font-bold text-foreground text-sm">{habit.name}</h4>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-2 py-0.5 bg-secondary rounded-full">
                      {habit.type}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary px-2 py-0.5 bg-primary/10 rounded-full">
                      {habit.base_xp} XP
                    </span>
                  </div>
                </div>
                <button 
                  disabled={deleteHabitMutation.isPending}
                  onClick={() => deleteHabitMutation.mutate(habit.id)}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-secondary rounded-xl transition-colors disabled:opacity-50"
                  aria-label="Delete habit"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm font-medium border border-dashed border-border rounded-2xl bg-secondary/30">
            No habits found. Create your first one above!
          </div>
        )}
      </div>

      {/* Settings Options */}
      <div className="bg-card border border-border rounded-[32px] p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="bg-secondary p-2 rounded-full text-muted-foreground">
            <Settings className="w-5 h-5 text-foreground" />
          </div>
          <h3 className="font-bold text-lg text-foreground">Settings</h3>
        </div>
        
        <div className="flex flex-col gap-3">
          {/* Account Section */}
          <div className="flex flex-col gap-2 pb-4 mb-2 border-b border-border">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Account</span>
            {user && (
              <div className="flex items-center justify-between p-2 rounded-2xl bg-secondary/30 border border-border">
                <span className="text-sm font-medium text-foreground px-2 truncate">{user.email}</span>
                <button
                  onClick={async () => {
                    await signOut();
                    queryClient.clear();
                  }}
                  className="flex items-center gap-2 text-xs font-bold bg-secondary hover:bg-secondary/80 text-destructive hover:text-destructive/80 px-3 py-2 rounded-xl transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </button>
              </div>
            )}
          </div>

          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mt-2">Appearance</span>
          <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-secondary/50 transition-colors">
            <span className="text-sm font-medium">App Theme</span>
            <div className="flex bg-secondary p-1 rounded-full gap-1 border border-border/50 shadow-inner">
              <button
                onClick={() => setTheme('light')}
                className={`p-2 rounded-full transition-all ${
                  theme === 'light' 
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label="Light Theme"
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-2 rounded-full transition-all ${
                  theme === 'dark' 
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label="Dark Theme"
              >
                <Moon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`p-2 rounded-full transition-all ${
                  theme === 'system' 
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label="System Default"
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
