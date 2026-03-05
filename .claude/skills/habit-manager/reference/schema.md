# Habit Tracker — Schema Reference

## Database Tables

### `habits`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Auto-generated |
| `user_id` | UUID | FK to auth.users |
| `name` | TEXT | Display name |
| `type` | ENUM | `'positive'` or `'negative'` |
| `base_xp` | INTEGER | Default 10, min 5 |
| `metadata_schema` | JSONB | Array of MetadataField objects, or null |
| `frequency` | INTEGER[] | [0=Sun…6=Sat]. Null or empty = every day |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Auto-updated via trigger |

### `habit_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Auto-generated |
| `habit_id` | UUID | FK to habits (cascades on delete) |
| `user_id` | UUID | FK to auth.users |
| `completed_at` | TIMESTAMPTZ | Timestamp of save |
| `date` | DATE | Logical day in `yyyy-MM-dd` |
| `metadata_values` | JSONB | `{ fieldId: value }` pairs |
| `xp_earned` | INTEGER | Computed at log time — can be negative for negative habits |

**Unique constraint**: `(habit_id, date, user_id)` — one log per habit per day

### `user_stats`

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID | PK |
| `freeze_count` | INTEGER | 0–3, streak freezers in inventory |
| `rewarded_weeks` | INTEGER | Total perfect weeks already rewarded |
| `updated_at` | TIMESTAMPTZ | |

## MetadataField Object

```json
{
  "id": "field_key",
  "label": "Display Name",
  "type": "number|time|boolean|string|duration",
  "defaultValue": "...",
  "unit": "grams",
  "scoringConfig": {
    "mode": "linear|exponential|asymmetric|tiered",
    "ideal": 8,
    "worst": 0,
    "minMultiplier": 0.1
  }
}
```

### Scoring Modes

| Mode | Use case | Parameters |
|---|---|---|
| `linear` | Gradual scale (weight lifted, pages read) | `ideal`, `worst`, `minMultiplier` |
| `exponential` | Diminishing returns (sleep hours, water intake) | `ideal`, `worst`, `minMultiplier` |
| `asymmetric` | Time fields where earlier is better (wake-up time) | `ideal`, `earlyGrace`, `lateGrace`, `lateCliff`, `minMultiplier` |
| `tiered` | Discrete buckets (mood score 1–5) | `tiers: [{upTo, multiplier}]`, `minMultiplier` |

## Frequency Examples

```json
null          // every day
[1,2,3,4,5]  // weekdays only
[0,6]         // weekends only
[1,3,5]       // Mon / Wed / Fri
[3]           // Wednesdays only
```

## XP Examples

**Simple positive habit** — "Read 30 min", base_xp=10, 10-day streak, no metadata:
```
streakBonus = min(1.0 + 10 × 0.05, 2.0) = 1.5
xp_earned   = round(10 × 1.0 × 1.5) = 15
```

**With metadata scoring** — "Morning run", base_xp=20, 5-day streak, metadata gradientMultiplier=0.8:
```
streakBonus        = min(1.0 + 5 × 0.05, 2.0) = 1.25
gradientMultiplier = 0.8
xp_earned          = round(20 × 0.8 × 1.25) = 20
```

**Negative habit** — "Junk food", base_xp=10, 3-day streak:
```
streakBonus = min(1.0 + 3 × 0.05, 2.0) = 1.15
xp_earned   = round(10 × 1.0 × 1.15) = 12 → signed as -12
```

## Streak Freeze System

- A "perfect week" = 7 consecutive days where any habit was logged
- Each perfect week awards +1 freeze token (max 3 in inventory)
- `rewarded_weeks` prevents double-awarding across sessions
- The app UI can use a freeze token to protect a missed day — this is handled client-side only, not tracked in `user_stats`
