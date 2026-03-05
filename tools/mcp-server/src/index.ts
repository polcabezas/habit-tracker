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
    const idealMin = parseTimeToMinutes(String(cfg.ideal));
    const actualMin = parseTimeToMinutes(String(value));
    const earlyGrace = cfg.earlyGrace ?? 60;
    const lateGrace = cfg.lateGrace ?? 0;
    const lateCliff = cfg.lateCliff ?? 60;
    const deviation = actualMin - idealMin;
    let multiplier: number;
    if (deviation < 0) {
      const earlyAmount = -deviation;
      multiplier =
        earlyAmount <= earlyGrace
          ? 1.0
          : 1.0 - ((earlyAmount - earlyGrace) / (earlyGrace * 4)) * (1 - min);
    } else if (deviation <= lateGrace) {
      multiplier = 1.0;
    } else if (deviation <= lateCliff) {
      const range = lateCliff - lateGrace || 1;
      multiplier = 1.0 - ((deviation - lateGrace) / range) * 0.3;
    } else {
      multiplier = 0.7 * Math.exp(-(deviation - lateCliff) / (lateCliff || 60));
    }
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
    metadata_schema: z.array(z.any()).optional().describe(
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
    metadata_schema: z.array(z.any()).nullable().optional(),
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
      return {
        user_id,
        habit_id,
        date,
        metadata_values,
        xp_earned: calculateHabitXP(habit, metadata_values, streakFor(habit_id)),
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

    const { newFreezers } = calculateStreakFreezers(
      streak,
      userStats?.freeze_count ?? 0,
      userStats?.rewarded_weeks ?? 0
    );

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

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
