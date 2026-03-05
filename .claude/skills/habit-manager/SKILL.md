---
name: habit-manager
description: Manage the habit tracker app — add/edit/delete habits, log journal completions, view XP and streaks, check streak freeze inventory. Use when asked to manage habits, log progress, view stats, or interact with the habit tracker database.
argument-hint: "[action] [details]"
disable-model-invocation: true
allowed-tools: Habit-tracker(*)
---

# Habit Tracker Manager

You are managing a personal habit tracker app. All data is in a hosted Supabase PostgreSQL database. All operations go through the `habit-tracker` MCP tools.

## Step 0: Always Get the User ID First

Call `list_users` at the start of every session. The app has one user. Use their `id` for all subsequent tool calls.

## Data Model

**Habits** — the habit definitions:
- `id`: UUID
- `name`: display name
- `type`: `"positive"` (adds XP) or `"negative"` (subtracts XP)
- `base_xp`: base XP per completion (min 5, default 10)
- `frequency`: array of weekday numbers [0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat]. Null = every day.
- `metadata_schema`: optional array of custom tracking fields (see [reference/schema.md](reference/schema.md))

**Habit Logs** — one row per completed habit per day:
- `date`: `yyyy-MM-dd` format (always use this format)
- `xp_earned`: computed at save time — includes streak bonus + metadata quality multiplier

**User Stats**: `freeze_count` (0–3 streak freezers earned by perfect weeks), `rewarded_weeks`

## XP Formula (handled automatically by `log_day`)

```
xp = base_xp × gradientMultiplier × min(1 + streak × 0.05, 2.0)
```

- `gradientMultiplier`: quality score from metadata fields with scoringConfig (1.0 if none)
- `streak`: consecutive days logged immediately before the target date
- Negative habits: XP is negative (subtracted from total)
- **You never calculate XP manually** — `log_day` does it using the correct formula

## Tool Reference

### Viewing state
```
list_users()
list_habits(user_id)
get_stats(user_id)          — all-time XP, streak, averages, freeze count
get_user_stats(user_id)     — freeze inventory and rewarded weeks
get_logs(user_id, from_date?, to_date?)
```

### Managing habits
```
create_habit(user_id, name, type?, base_xp?, frequency?, metadata_schema?)
update_habit(habit_id, user_id, ...fields)
delete_habit(habit_id, user_id)   — IRREVERSIBLE, cascades all logs
```

### Logging a day
```
log_day(user_id, "yyyy-MM-dd", [{ habit_id, metadata_values? }, ...])
```
- Pass all completed habits for the day in one call
- Pass an empty array `[]` to clear the day's logs
- Calling again for the same date replaces, never duplicates

## Safety Rules

1. **Call `list_users` first** — never guess or hardcode user_id
2. **Before `delete_habit`**: show the user what habit and how many logs will be deleted, then ask for explicit confirmation
3. **Use `yyyy-MM-dd` dates** — today is available from system context
4. **`log_day` is atomic** — it deletes then inserts; partial completion is not possible
5. **Negative habits reduce XP** — always confirm type before creating

## Your Task

$ARGUMENTS
