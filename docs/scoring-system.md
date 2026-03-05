# Scoring System

## Master Formula

```
finalXP = round(base_xp × gradientMultiplier × streakBonus)

gradientMultiplier = average of all field multipliers  (1.0 if no fields have scoringConfig)
streakBonus        = min(1.0 + streak × 0.05, 2.0)
```

Negative habits negate the result. The gradient multiplier is the only new layer — habits with no `scoringConfig` fields behave exactly as before.

---

## Streak Bonus

| Consecutive days | Bonus | Multiplier |
|---|---|---|
| 0 | +0% | 1.00× |
| 1 | +5% | 1.05× |
| 10 | +50% | 1.50× |
| 20+ | +100% (cap) | 2.00× |

---

## Gradient Multiplier

Each `MetadataField` can optionally declare a `scoringConfig`. When a habit is logged, every scored field produces a multiplier in the range `[minMultiplier, 1.5]`. The gradient multiplier is the **average** of those values.

Fields without `scoringConfig` are ignored entirely (they don't pull the average down).

### Type signature

```typescript
interface ScoringConfig {
  mode: 'logarithmic' | 'exponential' | 'linear' | 'asymmetric' | 'tiered';

  // logarithmic / exponential / linear
  ideal?: string | number;   // value → multiplier = 1.0
  worst?: string | number;   // value → multiplier = minMultiplier

  // asymmetric (time fields)
  earlyGrace?: number;       // preAllowance  — minutes before ideal at 1.0  (default: 60)
  lateGrace?:  number;       // postAllowance — minutes after ideal at 1.0   (default: 0)
  lateCliff?:  number;       // sigma         — minutes past plateau edge → 50% XP (default: 90)

  // tiered
  tiers?: { upTo: string | number; multiplier: number }[];

  // common
  minMultiplier?: number;    // XP floor, e.g. 0.1 = never below 10%  (default: 0)
}
```

---

## Scoring Modes

### `logarithmic` (default)

Best for numeric and duration fields. Models diminishing returns — fast early gains, natural saturation near the target. Mathematically a negative-exponential approach to 1.

> **Warning — time fields:** `logarithmic` treats time as a plain number (minutes from midnight). It scores by proximity to `ideal` on the number line, so values *below* the ideal score *less* — it does not know that "earlier is better." For any habit where earlier is better (bedtime, screen-off, etc.) **use `asymmetric` instead**.

```
multiplier = 1 − e^(−2.303 × ratio)
```

Where `ratio = actual / ideal` (higher-is-better) or `ratio = ideal / actual` (lower-is-better, determined automatically when `ideal < worst`).

The constant `2.303` is calibrated so that `actual = ideal` → multiplier ≈ **0.90**. Exceeding the ideal gives a small bonus (capped at 1.5×).

| actual / ideal | multiplier |
|---|---|
| 0.0 | 0.00 |
| 0.25 | 0.44 |
| 0.50 | 0.68 |
| 0.75 | 0.82 |
| 1.00 | ~0.90 |
| 1.50 | ~0.97 |

**Example:** "Pages read" field, `ideal = 10`, `worst = 0`. Reading 5 pages → ratio 0.5 → ~68% of base XP (before streak).

```
  1.0 │                              · · · · · ·
      │                          · ·
  0.9 │                      · ·           ← at ideal
      │                  · ·
  0.8 │              · ·
      │           · ·
  0.7 │         ·
      │       ·
  0.5 │     ·
      │   ·
  0.0 ┼──────────────────────────────────────────
      0   0.25  0.50  0.75  1.00  1.25  1.50
                             ↑
                      ideal  (ratio = 1.0, ≈ 0.90)
```

> Shape: steep climb at low values — the first half of effort captures most of the reward. Keeps giving small bonuses past the ideal.

---

### `exponential`

The mathematical inverse of logarithmic. Slow start, accelerating gains — most of the XP is concentrated near the ideal. Use when partial effort should be strongly penalised and only near-complete performance is meaningfully rewarded.

```
multiplier = (e^(3 × ratio) − 1) / (e^3 − 1)
```

`ratio` direction is determined the same way as logarithmic (`ideal > worst` → higher is better). At `ratio = 1.0` the multiplier is exactly **1.0**. Exceeding the ideal gives a bonus (capped at 1.5×).

| actual / ideal | multiplier |
|---|---|
| 0.0 | 0.00 |
| 0.25 | 0.06 |
| 0.50 | 0.18 |
| 0.75 | 0.44 |
| 1.00 | 1.00 |
| 1.25 | 1.5× (capped) |

**Example:** "Pages read" field, `ideal = 10`, `worst = 0`. Reading 5 pages → ratio 0.5 → only ~18% of base XP. Reading 8 pages → ~63%. Reading 10 → 100%.

```
  1.0 │                                   ·
      │                               · ·
      │                            · ·
  0.6 │                         · ·
      │                      · ·
  0.4 │                   · ·
      │               · ·
  0.2 │          · · ·
      │   · · · ·
  0.0 ┼──────────────────────────────────────────
      0   0.25  0.50  0.75  1.00  1.25  1.50
                             ↑
                           ideal (ratio = 1.0, = 1.00)
```

> Shape: a "hockey stick" — low effort gives very little XP, but closing in on the ideal delivers most of the reward in the final stretch. Encourages going all-in rather than coasting at 50%.

---

### `linear`

Strict proportional scoring. Use when the relationship between effort and reward should be exactly proportional.

```
multiplier = minMultiplier + (1 − minMultiplier) × (actual − worst) / (ideal − worst)
```

Clamped to `[minMultiplier, 1.0]`. Works for both higher-is-better and lower-is-better (direction inferred from `ideal` vs `worst`).

**Example:** `ideal = 10`, `worst = 0`, `minMultiplier = 0`. Value 5 → **50%** of base XP.

```
  1.0 │                         ·─────────────
      │                       ·
  0.8 │                     ·
      │                   ·
  0.6 │                 ·
      │               ·
  0.4 │             ·
      │           ·
  0.2 │         ·
      │       ·
  0.0 ┼──────────────────────────────────────
    worst  2    4    6    8   10   12
                              ↑
                            ideal
```

> Shape: a straight diagonal — every unit of input contributes equal XP. No diminishing returns, no early bonus, just strict proportionality.

---

### `asymmetric`

Designed for time-of-day fields where the ideal has a **flat plateau** of full XP, then a **Gaussian bell-curve decay** on either side. The pre and post allowances around ideal can differ, making it naturally asymmetric (e.g. lenient toward early bedtimes, strict toward late ones).

```
deviation = actual_minutes − ideal_minutes   (negative = early, positive = late)

allowance = preAllowance  if deviation < 0
            postAllowance if deviation >= 0

if |deviation| <= allowance:
    multiplier = 1.0                          ← flat plateau

else:
    excess    = |deviation| − allowance
    σ_true    = sigma / √(2 × ln 2)          ← calibrated so excess = sigma → 50%
    multiplier = e^(−excess² / (2 × σ_true²))
    clamped to [minMultiplier, 1.0]
```

**Midnight normalisation:** if `actualMin < idealMin − 360`, add 1440 (next-day crossing).

Fields reuse existing `ScoringConfig` names with new semantics:

| Field | New meaning | Default |
|---|---|---|
| `earlyGrace` | `preAllowance` — minutes before ideal at 1.0 | 60 |
| `lateGrace` | `postAllowance` — minutes after ideal at 1.0 | 0 |
| `lateCliff` | `sigma` — minutes past plateau edge where XP = 50% | 90 |

**Example:** bedtime habit, `ideal = "22:00"`, `preAllowance = 60`, `postAllowance = 0`, `sigma = 90`.

| Logged at | Deviation | Excess | Multiplier |
|---|---|---|---|
| 20:00 | −120 min | 60 min | ~73% |
| 21:00 | −60 min | 0 (at pre-edge) | 100% |
| 22:00 | 0 | 0 (plateau) | 100% |
| 22:30 | +30 min | 30 min | ~93% |
| 23:00 | +60 min | 60 min | ~73% |
| 23:30 | +90 min | 90 min | **50%** ← exactly sigma |
| 00:00 | +120 min | 120 min | ~29% |
| 04:00 | +360 min | 360 min | ~0% (floor) |

```
  1.0 │          · · · · · · ·
      │        ·               ·
  0.9 │      ·                    ·
      │    ·                          ·
  0.7 │  ·                                ·
      │ ·                                    ·
  0.5 │·                                        ·  ← σ from plateau edge
      │                                              · ·
  0.2 │                                                    · ·
  0.0 ┼──────────────────────────────────────────────────────────────
     -3h  -2h  -1h  │  0  │  +1h  +1.5h  +2h    +3h    +4h
           pre-edge ↑     ↑ post-edge
              (preAllowance)  (postAllowance)
              ←── plateau ───→
```

> Shape: a true Gaussian bell with a flat top — full XP inside the plateau, smooth symmetric decay on both sides. The pre and post allowances let you make it asymmetric (e.g. lenient before ideal, strict after).

---

### `tiered`

Fixed buckets. The first tier whose `upTo` threshold is ≥ the logged value wins.

```typescript
tiers: [
  { upTo: 6,        multiplier: 0.3 },
  { upTo: 7,        multiplier: 0.6 },
  { upTo: 8,        multiplier: 0.9 },
  { upTo: Infinity, multiplier: 1.0 },
]
```

Tiers are evaluated in order; the first match is used. If no tier matches, `minMultiplier` is returned. Works with `number`, `duration`, and `time` fields.

```
  1.0 │                    ┌──────────────
      │                    │
  0.9 │                    │
      │                    │
  0.7 │          ┌─────────┘
      │          │
  0.4 │  ┌───────┘
      │  │
  0.1 ┤──┘
  0.0 ┼──────────────────────────────────
      0h   5h    6h    7h    8h    9h+
      ↑tier 1↑tier 2↑tier 3↑tier 4↑
       (sleep duration example)
```

> Shape: a staircase — discrete jumps between named bands. No interpolation between steps. Use when the habit has natural category boundaries (e.g. sleep under 6h is categorically different from 7–8h, not just slightly worse).

---

## Multi-Field Habits

When a habit has multiple scored fields the gradient multiplier is their **average**:

```
gradientMultiplier = (m₁ + m₂ + … + mₙ) / n
```

**Example:** habit with two fields scoring 0.8× and 0.6× → gradient = 0.70×.

---

## Backward Compatibility

Habits with no `scoringConfig` on any field return `gradientMultiplier = 1.0`, so `finalXP = round(base_xp × streakBonus)` — identical to the previous binary system.

---

## UI: Quality Chip

When a habit is completed and has at least one scored field, the HabitCard shows a colour-coded **Quality: X%** chip next to the streak badge.

| Multiplier | Colour |
|---|---|
| ≥ 80% | Green |
| ≥ 50% | Yellow |
| < 50% | Red |

The percentage reflects the current metadata values in state. After saving, `xp_earned` in the DB captures the exact gradient-adjusted value.

---

## Relevant Files

| File | Role |
|---|---|
| `src/lib/scoring.ts` | `calculateFieldMultiplier`, `calculateGradientMultiplier`, `calculateHabitXP` |
| `src/components/HabitCard.tsx` | `ScoringConfig`, `ScoringTier`, `ScoringMode` types; quality chip |
| `src/views/JournalView.tsx` | Calls `calculateHabitXP` for optimistic UI and save mutation |
| `src/views/ProfileView.tsx` | Scoring config UI per metadata field |
