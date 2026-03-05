#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// ── Environment ───────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Scoring (kept in sync with src/lib/scoring.ts) ───────────────────────────

interface ScoringConfig {
  mode: "linear" | "exponential" | "logarithmic" | "asymmetric" | "tiered";
  ideal?: string | number;
  worst?: string | number;
  earlyGrace?: number;
  lateGrace?: number;
  lateCliff?: number;
  tiers?: Array<{ upTo: string | number; multiplier: number }>;
  minMultiplier?: number;
}

interface MetadataField {
  id: string;
  type: "number" | "time" | "boolean" | "string" | "duration";
  scoringConfig?: ScoringConfig;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function calculateFieldMultiplier(field: MetadataField, value: any): number {
  if (value === undefined || value === null) return 1.0;
  const cfg = field.scoringConfig;
  if (!cfg) return 1.0;
  const min = cfg.minMultiplier ?? 0;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  if (cfg.mode === "tiered") {
    if (!cfg.tiers || cfg.tiers.length === 0) return 1.0;
    const actual =
      field.type === "time"
        ? parseTimeToMinutes(String(value))
        : Number(value);
    for (const tier of cfg.tiers) {
      const upTo =
        tier.upTo === Infinity || tier.upTo === "Infinity"
          ? Infinity
          : field.type === "time"
          ? parseTimeToMinutes(String(tier.upTo))
          : Number(tier.upTo);
      if (actual <= upTo) return tier.multiplier;
    }
    return min;
  }

  if (cfg.mode === "asymmetric") {
    if (cfg.ideal === undefined) return 1.0;

    const idealMin  = parseTimeToMinutes(String(cfg.ideal));
    let actualMin   = parseTimeToMinutes(String(value));

    if (actualMin < idealMin - 360) actualMin += 1440; // midnight wraparound

    const preAllowance  = cfg.earlyGrace ?? 60;
    const postAllowance = cfg.lateGrace  ?? 0;
    const sigma         = cfg.lateCliff  ?? 90;
    const deviation     = actualMin - idealMin;
    const allowance     = deviation < 0 ? preAllowance : postAllowance;

    if (Math.abs(deviation) <= allowance) return 1.0;

    const excess    = Math.abs(deviation) - allowance;
    const sigmaTrue = sigma / Math.sqrt(2 * Math.LN2);
    const multiplier = Math.exp(-(excess * excess) / (2 * sigmaTrue * sigmaTrue));
    return clamp(multiplier, min, 1.0);
  }

  if (cfg.ideal === undefined || cfg.worst === undefined) return 1.0;
  const toNum = (v: string | number) =>
    field.type === "time" ? parseTimeToMinutes(String(v)) : Number(v);
  const idealNum = toNum(cfg.ideal);
  const worstNum = toNum(cfg.worst);
  let actualNum =
    field.type === "time" ? parseTimeToMinutes(String(value)) : Number(value);

  // Midnight wraparound fix for time fields where lower (earlier) is better.
  if (field.type === "time" && !(idealNum > worstNum) && actualNum < idealNum - 360) {
    actualNum += 1440;
  }

  if (cfg.mode === "linear") {
    if (idealNum === worstNum) return 1.0;
    return clamp(
      min + (1 - min) * (actualNum - worstNum) / (idealNum - worstNum),
      min,
      1.0
    );
  }

  const higherIsBetter = idealNum > worstNum;
  const ratio = higherIsBetter
    ? idealNum > 0 ? actualNum / idealNum : 0
    : actualNum > 0 ? idealNum / actualNum : 0;
  const r = Math.max(0, ratio);

  if (cfg.mode === "logarithmic") {
    const C = 2.303;
    return clamp(1 - Math.exp(-C * r), min, 1.5);
  }

  // exponential
  const C = 3;
  return clamp((Math.exp(C * r) - 1) / (Math.exp(C) - 1), min, 1.5);
}

function calculateHabitXP(
  habit: {
    base_xp: number;
    type: "positive" | "negative";
    metadata_schema?: MetadataField[] | null;
  },
  metadataValues: Record<string, any>,
  streak: number
): number {
  const schema = (habit.metadata_schema ?? []) as MetadataField[];
  const scoredFields = schema.filter((f) => f.scoringConfig);
  const gradientMultiplier =
    scoredFields.length === 0
      ? 1.0
      : scoredFields.reduce(
          (acc, f) => acc + calculateFieldMultiplier(f, metadataValues[f.id]),
          0
        ) / scoredFields.length;
  const streakBonus = Math.min(1.0 + streak * 0.05, 2.0);
  const rawXP = Math.round(habit.base_xp * gradientMultiplier * streakBonus);
  return habit.type === "negative" ? -rawXP : rawXP;
}

function applyMetadataDefaults(
  schema: MetadataField[],
  values: Record<string, any>
): Record<string, any> {
  const result = { ...values };
  const typeDefaults: Record<string, any> = {
    number: 0, duration: 0, boolean: false, time: "00:00", string: "",
  };
  for (const field of schema) {
    if (result[field.id] !== undefined) continue;
    result[field.id] = (field as any).defaultValue !== undefined
      ? (field as any).defaultValue
      : (typeDefaults[field.type] ?? null);
  }
  return result;
}

function calculateStreakFreezers(
  totalConsecutiveDays: number,
  currentFreezers: number,
  rewardedWeeks: number
): { newFreezers: number; newRewardedWeeks: number } {
  const earnedWeeks = Math.floor(totalConsecutiveDays / 7);
  const newUnrewardedWeeks = Math.max(0, earnedWeeks - rewardedWeeks);
  return {
    newFreezers: Math.min(3, currentFreezers + newUnrewardedWeeks),
    newRewardedWeeks: rewardedWeeks + newUnrewardedWeeks,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBefore(dateStr: string, n: number): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

// ── Zod schemas for metadata_schema validation ────────────────────────────────

const ScoringTierSchema = z.object({
  upTo: z.union([z.number(), z.string()]),
  multiplier: z.number().min(0).max(2),
});

const ScoringConfigSchema = z.object({
  mode: z.enum(["linear", "logarithmic", "exponential", "asymmetric", "tiered"]),
  ideal: z.union([z.string(), z.number()]).optional(),
  worst: z.union([z.string(), z.number()]).optional(),
  earlyGrace: z.number().min(0).optional(),
  lateGrace: z.number().min(0).optional(),
  lateCliff: z.number().min(0).optional(),
  tiers: z.array(ScoringTierSchema).optional(),
  minMultiplier: z.number().min(0).max(1).optional(),
});

const MetadataFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["number", "time", "boolean", "string", "duration"]),
  defaultValue: z.any().optional(),
  unit: z.string().optional(),
  scoringConfig: ScoringConfigSchema.optional(),
});

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "habit-tracker", version: "1.0.0" });

// ── list_users ──────────────────────────────────────────────────────────────

server.tool(
  "list_users",
  "List all registered users. Call this first to get the user_id required by all other tools.",
  {},
  async () => {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    return ok(
      data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at }))
    );
  }
);

// ── list_habits ─────────────────────────────────────────────────────────────

server.tool(
  "list_habits",
  "List all habit definitions for a user.",
  { user_id: z.string().describe("User UUID") },
  async ({ user_id }) => {
    const { data, error } = await supabase
      .from("habits")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ok(data);
  }
);

// ── create_habit ────────────────────────────────────────────────────────────

server.tool(
  "create_habit",
  "Create a new habit for a user.",
  {
    user_id: z.string(),
    name: z.string().describe("Display name"),
    type: z.enum(["positive", "negative"]).default("positive").describe(
      "Positive adds XP, negative subtracts XP"
    ),
    base_xp: z.number().min(5).default(10).describe("Base XP per completion"),
    frequency: z
      .array(z.number().int().min(0).max(6))
      .optional()
      .describe("Days of week: 0=Sun…6=Sat. Omit for every day."),
    metadata_schema: z.array(MetadataFieldSchema).optional().describe(
      "Optional custom tracking field definitions"
    ),
  },
  async ({ user_id, name, type, base_xp, frequency, metadata_schema }) => {
    const { data, error } = await supabase
      .from("habits")
      .insert({
        user_id,
        name,
        type,
        base_xp,
        frequency: frequency ?? null,
        metadata_schema: metadata_schema ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok({ message: "Habit created.", habit: data });
  }
);

// ── update_habit ────────────────────────────────────────────────────────────

server.tool(
  "update_habit",
  "Update one or more fields of an existing habit.",
  {
    habit_id: z.string(),
    user_id: z.string(),
    name: z.string().optional(),
    type: z.enum(["positive", "negative"]).optional(),
    base_xp: z.number().min(5).optional(),
    frequency: z.array(z.number().int().min(0).max(6)).nullable().optional(),
    metadata_schema: z.array(MetadataFieldSchema).nullable().optional(),
  },
  async ({ habit_id, user_id, ...updates }) => {
    const { data, error } = await supabase
      .from("habits")
      .update(updates)
      .eq("id", habit_id)
      .eq("user_id", user_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok({ message: "Habit updated.", habit: data });
  }
);

// ── delete_habit ────────────────────────────────────────────────────────────

server.tool(
  "delete_habit",
  "Permanently delete a habit and ALL its logs. Irreversible. Always confirm with the user before calling.",
  {
    habit_id: z.string(),
    user_id: z.string(),
  },
  async ({ habit_id, user_id }) => {
    const { data: habit, error: fetchError } = await supabase
      .from("habits")
      .select("name")
      .eq("id", habit_id)
      .eq("user_id", user_id)
      .single();
    if (fetchError) throw new Error(fetchError.message);

    const { error } = await supabase
      .from("habits")
      .delete()
      .eq("id", habit_id)
      .eq("user_id", user_id);
    if (error) throw new Error(error.message);
    return ok({ message: `Deleted habit "${habit.name}" (${habit_id}) and all its logs.` });
  }
);

// ── log_day ─────────────────────────────────────────────────────────────────

server.tool(
  "log_day",
  "Save journal completions for a specific date. Replaces all existing logs for that date (delete + insert). XP is calculated automatically. Pass an empty completions array to clear the day.",
  {
    user_id: z.string(),
    date: z.string().describe("Date in yyyy-MM-dd format"),
    completions: z
      .array(
        z.object({
          habit_id: z.string(),
          metadata_values: z.record(z.any()).optional().default({}),
        })
      )
      .describe("Habits completed on this date"),
  },
  async ({ user_id, date, completions }) => {
    // Fetch habits for XP calculation
    const { data: habits, error: habitsError } = await supabase
      .from("habits")
      .select("id, base_xp, type, metadata_schema")
      .eq("user_id", user_id);
    if (habitsError) throw new Error(habitsError.message);

    const habitMap = new Map((habits ?? []).map((h: any) => [h.id, h]));

    // Fetch prior logs to compute per-habit streaks
    const { data: priorLogs, error: logsError } = await supabase
      .from("habit_logs")
      .select("habit_id, date")
      .eq("user_id", user_id)
      .lt("date", date)
      .order("date", { ascending: false });
    if (logsError) throw new Error(logsError.message);

    const logsByHabit = new Map<string, Set<string>>();
    (priorLogs ?? []).forEach((l: any) => {
      if (!logsByHabit.has(l.habit_id)) logsByHabit.set(l.habit_id, new Set());
      logsByHabit.get(l.habit_id)!.add(l.date as string);
    });

    const streakFor = (habitId: string): number => {
      let streak = 0;
      let check = daysBefore(date, 1);
      const habitLogs = logsByHabit.get(habitId);
      if (!habitLogs) return 0;
      while (habitLogs.has(toDateStr(check))) {
        streak++;
        check = new Date(check.getTime() - 86_400_000);
      }
      return streak;
    };

    // Delete existing logs for this date (idempotent)
    const { error: deleteError } = await supabase
      .from("habit_logs")
      .delete()
      .eq("user_id", user_id)
      .eq("date", date);
    if (deleteError) throw new Error(deleteError.message);

    if (completions.length === 0) {
      return ok({ message: `Cleared all logs for ${date}.` });
    }

    const logsToInsert = completions.map(({ habit_id, metadata_values = {} }) => {
      const habit = habitMap.get(habit_id) as any;
      if (!habit) throw new Error(`Habit ${habit_id} not found for user ${user_id}`);
      const filledValues = applyMetadataDefaults(habit.metadata_schema ?? [], metadata_values);
      return {
        user_id,
        habit_id,
        date,
        metadata_values: filledValues,
        xp_earned: calculateHabitXP(habit, filledValues, streakFor(habit_id)),
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from("habit_logs")
      .insert(logsToInsert)
      .select();
    if (insertError) throw new Error(insertError.message);

    return ok({ message: `Logged ${inserted!.length} habits for ${date}.`, logs: inserted });
  }
);

// ── get_logs ─────────────────────────────────────────────────────────────────

server.tool(
  "get_logs",
  "Fetch habit logs for a date range (default: last 30 days).",
  {
    user_id: z.string(),
    from_date: z.string().optional().describe("yyyy-MM-dd, defaults to 30 days ago"),
    to_date: z.string().optional().describe("yyyy-MM-dd, defaults to today"),
  },
  async ({ user_id, from_date, to_date }) => {
    const today = toDateStr(new Date());
    const from = from_date ?? toDateStr(daysBefore(today, 30));
    const to = to_date ?? today;

    const { data, error } = await supabase
      .from("habit_logs")
      .select("date, habit_id, xp_earned, metadata_values")
      .eq("user_id", user_id)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return ok(data);
  }
);

// ── get_stats ─────────────────────────────────────────────────────────────────

server.tool(
  "get_stats",
  "Compute all-time XP, current streak, freeze count, and XP averages for a user.",
  { user_id: z.string() },
  async ({ user_id }) => {
    const { data: habits } = await supabase
      .from("habits")
      .select("id, base_xp")
      .eq("user_id", user_id);
    const xpMap = new Map((habits ?? []).map((h: any) => [h.id, h.base_xp]));

    const { data: logs } = await supabase
      .from("habit_logs")
      .select("date, habit_id, xp_earned")
      .eq("user_id", user_id)
      .order("date", { ascending: false });

    let allTimeXp = 0;
    const logSet = new Set<string>();
    const dailyXp = new Map<string, number>();

    (logs ?? []).forEach((log: any) => {
      const xp =
        log.xp_earned != null && log.xp_earned > 0
          ? log.xp_earned
          : xpMap.get(log.habit_id) ?? 0;
      allTimeXp += xp;
      if (xp > 0) {
        logSet.add(log.date);
        dailyXp.set(log.date, (dailyXp.get(log.date) ?? 0) + xp);
      }
    });

    // Streak calculation — matches StatsView.tsx exactly
    let streak = 0;
    let checkDate = new Date();
    outer: while (true) {
      const dateStr = toDateStr(checkDate);
      if (logSet.has(dateStr)) {
        streak++;
        checkDate = new Date(checkDate.getTime() - 86_400_000);
      } else {
        if (streak === 0) {
          checkDate = new Date(checkDate.getTime() - 86_400_000);
          if (logSet.has(toDateStr(checkDate))) {
            streak++;
            checkDate = new Date(checkDate.getTime() - 86_400_000);
            continue outer;
          }
        }
        break;
      }
    }

    const { data: userStats } = await supabase
      .from("user_stats")
      .select("freeze_count, rewarded_weeks")
      .eq("user_id", user_id)
      .maybeSingle();

    const currentFreeze   = userStats?.freeze_count   ?? 0;
    const currentRewarded = userStats?.rewarded_weeks ?? 0;
    const { newFreezers, newRewardedWeeks } = calculateStreakFreezers(streak, currentFreeze, currentRewarded);

    if (newFreezers !== currentFreeze || newRewardedWeeks !== currentRewarded) {
      await supabase.from("user_stats").upsert({
        user_id,
        freeze_count:   newFreezers,
        rewarded_weeks: newRewardedWeeks,
        updated_at:     new Date().toISOString(),
      });
    }

    const sevenDaysAgo = toDateStr(daysBefore(toDateStr(new Date()), 7));
    let weekXp = 0;
    dailyXp.forEach((xp, date) => {
      if (date >= sevenDaysAgo) weekXp += xp;
    });

    return ok({
      allTimeXp,
      streak,
      freezeCount: newFreezers,
      avgXpLast7Days: Math.round(weekXp / 7),
      totalDaysLogged: logSet.size,
    });
  }
);

// ── get_user_stats ────────────────────────────────────────────────────────────

server.tool(
  "get_user_stats",
  "Get the user's streak freeze inventory (freeze_count 0-3) and rewarded weeks.",
  { user_id: z.string() },
  async ({ user_id }) => {
    const { data, error } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return ok(data ?? { user_id, freeze_count: 0, rewarded_weeks: 0 });
  }
);

// ── update_user_stats ─────────────────────────────────────────────────────────

server.tool(
  "update_user_stats",
  "Read and write a user's streak freeze inventory. Use to consume a freeze (decrement freeze_count) or correct data. Only the fields you provide will be changed.",
  {
    user_id: z.string(),
    freeze_count: z.number().int().min(0).max(3).optional().describe("0–3 available streak freezers"),
    rewarded_weeks: z.number().int().min(0).optional().describe("Total weeks already rewarded with a freezer"),
  },
  async ({ user_id, freeze_count, rewarded_weeks }) => {
    const { data: current, error: fetchError } = await supabase
      .from("user_stats")
      .select("freeze_count, rewarded_weeks")
      .eq("user_id", user_id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);

    const merged = {
      user_id,
      freeze_count:   freeze_count   ?? current?.freeze_count   ?? 0,
      rewarded_weeks: rewarded_weeks ?? current?.rewarded_weeks ?? 0,
      updated_at:     new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("user_stats")
      .upsert(merged)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ok({ message: "User stats updated.", user_stats: data });
  }
);

// ── get_scoring_guide ─────────────────────────────────────────────────────────

server.tool(
  "get_scoring_guide",
  "Returns a complete JSON reference guide for building metadata_schema fields with scoringConfig. No DB calls — instant reference.",
  {},
  async () => {
    const guide = {
      overview: "metadata_schema is an array of MetadataField objects. Each field can have an optional scoringConfig that maps a logged value to a multiplier (0–1.0) applied to base_xp.",
      typeRules: {
        number: "Numeric value (e.g. reps, pages, glasses of water)",
        time: "String in HH:MM format (e.g. \"22:30\"). All time scoring uses minutes-since-midnight internally.",
        boolean: "true/false — use tiered mode with tiers [{upTo:0,multiplier:0},{upTo:1,multiplier:1}]",
        string: "Free text — no scoring config supported (scoringConfig ignored)",
        duration: "Total minutes as a number (e.g. 90 = 1h30m). Use linear/logarithmic/exponential modes.",
      },
      fieldExamples: {
        number: {
          id: "reps", label: "Reps", type: "number", unit: "reps",
          scoringConfig: { mode: "linear", ideal: 20, worst: 0 },
        },
        time: {
          id: "bed_time", label: "Bed Time", type: "time",
          scoringConfig: { mode: "asymmetric", ideal: "22:00", earlyGrace: 60, lateGrace: 0, lateCliff: 90 },
        },
        boolean: {
          id: "did_stretch", label: "Did Stretch?", type: "boolean",
          scoringConfig: { mode: "tiered", tiers: [{ upTo: 0, multiplier: 0 }, { upTo: 1, multiplier: 1 }] },
        },
        string: {
          id: "notes", label: "Notes", type: "string",
          // no scoringConfig — strings cannot be scored
        },
        duration: {
          id: "sleep_minutes", label: "Sleep Duration", type: "duration", unit: "min",
          scoringConfig: { mode: "logarithmic", ideal: 480, worst: 0, minMultiplier: 0.1 },
        },
      },
      scoringModes: {
        linear: {
          description: "Straight line between worst (0%) and ideal (100%).",
          requiredFields: ["ideal", "worst"],
          example: { mode: "linear", ideal: 10000, worst: 0 },
        },
        logarithmic: {
          description: "Fast gains at low values, diminishing returns toward ideal. Good for sleep, steps.",
          requiredFields: ["ideal", "worst"],
          example: { mode: "logarithmic", ideal: 480, worst: 0 },
        },
        exponential: {
          description: "Slow start, accelerating gains near ideal. Good for streaks or effort that compounds.",
          requiredFields: ["ideal", "worst"],
          example: { mode: "exponential", ideal: 100, worst: 0 },
        },
        asymmetric: {
          description: "Gaussian bell curve with a flat plateau. Designed for time-of-day habits where both too-early and too-late are penalized, but differently.",
          requiredFields: ["ideal"],
          optionalFields: {
            earlyGrace: "Minutes before ideal that still score 1.0. Default: 60.",
            lateGrace: "Minutes after ideal that still score 1.0. Default: 0.",
            lateCliff: "Minutes past the plateau edge where XP drops to ~50%. Implemented as Gaussian sigma calibrated so excess=lateCliff → 0.5 multiplier. Default: 90.",
            minMultiplier: "Floor for the multiplier. Default: 0.",
          },
          mathNote: "excess = |deviation| - allowance; sigmaTrue = lateCliff / sqrt(2*ln2); multiplier = exp(-(excess²)/(2*sigmaTrue²))",
          examples: [
            { scenario: "Bed time 22:00, 30min early grace, no late grace, cliff at 90min", config: { mode: "asymmetric", ideal: "22:00", earlyGrace: 30, lateGrace: 0, lateCliff: 90 } },
            { scenario: "Wake up 07:00, symmetric 30min grace each side", config: { mode: "asymmetric", ideal: "07:00", earlyGrace: 30, lateGrace: 30, lateCliff: 60 } },
          ],
        },
        tiered: {
          description: "Step-function lookup. First tier whose upTo >= value wins. Use 'Infinity' for the catch-all last tier.",
          requiredFields: ["tiers"],
          example: {
            mode: "tiered",
            tiers: [
              { upTo: 2000, multiplier: 0.3 },
              { upTo: 5000, multiplier: 0.6 },
              { upTo: 10000, multiplier: 1.0 },
              { upTo: "Infinity", multiplier: 1.5 },
            ],
          },
        },
      },
      multiFieldExample: {
        description: "A workout habit with scored duration + scored reps + unscored notes",
        metadata_schema: [
          { id: "duration_min", label: "Duration", type: "duration", unit: "min", scoringConfig: { mode: "linear", ideal: 60, worst: 0 } },
          { id: "reps", label: "Reps", type: "number", unit: "reps", scoringConfig: { mode: "logarithmic", ideal: 50, worst: 0, minMultiplier: 0.2 } },
          { id: "notes", label: "Notes", type: "string" },
        ],
        note: "XP multiplier = average of all fields that have a scoringConfig (duration + reps here). 'notes' is ignored in scoring.",
      },
    };
    return ok(guide);
  }
);

// ── get_due_habits ────────────────────────────────────────────────────────────

server.tool(
  "get_due_habits",
  "Returns habits scheduled for a given date with suggested optimal values for each metadata field. Use this before log_day to know exactly what to log and what metadata values will maximize XP.",
  {
    user_id: z.string(),
    date: z.string().optional().describe("yyyy-MM-dd, defaults to today"),
  },
  async ({ user_id, date }) => {
    const targetDate = date ?? toDateStr(new Date());
    const dayOfWeek = new Date(targetDate + "T12:00:00Z").getUTCDay(); // 0=Sun…6=Sat

    const { data: habits, error } = await supabase
      .from("habits")
      .select("*")
      .eq("user_id", user_id);
    if (error) throw new Error(error.message);

    const { data: existingLogs } = await supabase
      .from("habit_logs")
      .select("habit_id, xp_earned, metadata_values")
      .eq("user_id", user_id)
      .eq("date", targetDate);
    const loggedMap = new Map((existingLogs ?? []).map((l: any) => [l.habit_id, l]));

    const due = (habits ?? []).filter((h: any) => {
      if (!h.frequency || !Array.isArray(h.frequency)) return true;
      return h.frequency.includes(dayOfWeek);
    });

    const typeDefaults: Record<string, any> = {
      number: 0, duration: 0, boolean: false, time: "00:00", string: "",
    };

    const result = due.map((h: any) => {
      const schema: MetadataField[] = h.metadata_schema ?? [];
      const suggestedValues: Record<string, any> = {};
      const defaultValues: Record<string, any> = {};

      for (const field of schema) {
        const cfg = field.scoringConfig as ScoringConfig | undefined;
        if (cfg?.ideal !== undefined) {
          suggestedValues[field.id] = cfg.ideal;
        } else if (cfg?.mode === "tiered" && cfg.tiers?.length) {
          const lastFiniteTier = [...cfg.tiers].reverse().find(
            (t) => t.upTo !== "Infinity" && t.upTo !== Infinity
          );
          if (lastFiniteTier) suggestedValues[field.id] = lastFiniteTier.upTo;
        }
        defaultValues[field.id] = (field as any).defaultValue !== undefined
          ? (field as any).defaultValue
          : (typeDefaults[field.type] ?? null);
      }

      return {
        habit_id: h.id,
        name: h.name,
        type: h.type,
        base_xp: h.base_xp,
        metadata_schema: schema,
        suggestedValues,
        defaultValues,
        alreadyLogged: loggedMap.has(h.id) ? loggedMap.get(h.id) : null,
      };
    });

    return ok({ date: targetDate, dayOfWeek, dueHabits: result });
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
