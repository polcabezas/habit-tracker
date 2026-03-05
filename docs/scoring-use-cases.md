# Scoring Use Cases

Each combination of field type and scoring mode suits different real-world habits. Use this as a reference when configuring a new parameter.

---

## `number` fields

### `number` + `logarithmic`
Best when early effort gives the biggest reward and gains naturally plateau near the target. Mirrors physiological diminishing returns.

| Habit | Field | ideal | worst | Notes |
|---|---|---|---|---|
| Reading | Pages read | 20 | 0 | Fast reward for first pages, saturates near goal |
| Hydration | Glasses of water | 8 | 0 | Strong incentive to reach the first few glasses |
| Strength training | Reps completed | 20 | 0 | Each rep counts more early on |
| Focus work | Pomodoros completed | 4 | 0 | Rewards consistency without demanding perfection |
| Journaling | Words written | 300 | 0 | Encourages getting started; extra words give diminishing bonus |
| Coffee reduction | Cups of coffee | 1 | 5 | `ideal < worst` → lower is better; each cup above 1 penalises smoothly |

---

### `number` + `exponential`
Use when partial effort should be heavily penalised — only near-complete performance earns meaningful XP. The "go hard or go home" curve.

| Habit | Field | ideal | worst | Notes |
|---|---|---|---|---|
| Strength training | Reps completed | 20 | 0 | Doing 10/20 reps = only 18% XP; 15/20 = 44% — rewards finishing sets |
| Calorie target | Calories eaten | 2500 | 0 | Strong penalty for large deficits; close to target is what counts |
| Language practice | Flashcards reviewed | 50 | 0 | Reviewing 10 cards out of 50 barely counts; commit or don't |
| Study session | Problems solved | 30 | 0 | Rewards completing the full set, not half-attempts |
| Running | Distance (km) | 5 | 0 | 2.5 km = 18% XP — encourages finishing the full run |

---

### `number` + `linear`
Use when every unit of effort should count equally — no saturation, no diminishing returns.

| Habit | Field | ideal | worst | Notes |
|---|---|---|---|---|
| Steps | Steps walked | 10000 | 0 | Every 1000 steps = +10% XP, no plateau |
| Calorie budget | Calories eaten | 2000 | 3000 | Strict penalty per calorie over budget |
| Push-ups | Push-ups done | 50 | 0 | 25 reps = exactly 50% XP |
| Screen time | Hours on phone | 2 | 8 | `ideal < worst`; each extra hour costs proportionally |
| Sobriety | Alcohol units | 0 | 4 | Zero units → full XP; linear penalty per unit |

---

### `number` + `tiered`
Use when effort naturally falls into distinct categories rather than a continuum — rating scales, effort levels, habit intensity bands.

| Habit | Field | Example tiers | Notes |
|---|---|---|---|
| Sleep quality | Self-rated score (1–10) | ≤4 → 20%, ≤6 → 50%, ≤8 → 80%, ≤10 → 100% | Discrete quality bands |
| Mood check-in | Mood score (1–5) | ≤1 → 20%, ≤3 → 60%, ≤5 → 100% | Coarse scale, tiered fits better than a curve |
| Workout intensity | Level (1–3) | ≤1 → 40%, ≤2 → 70%, ≤3 → 100% | Light / moderate / hard |
| Cold shower | Temperature (°C) | ≤15 → 100%, ≤20 → 70%, ≤Inf → 30% | `ideal < worst`; colder = better in bands |
| Social media | Sessions per day | ≤1 → 100%, ≤3 → 60%, ≤5 → 20%, ≤Inf → 0% | Hard boundaries are more natural than a curve |

---

## `duration` fields
Duration is stored as total minutes, making it ideal for time-based effort.

### `duration` + `logarithmic`
Best for sessions where showing up matters most — the first 20 minutes of a 60-minute workout are worth more psychologically than the last 20.

| Habit | Field | ideal | worst | Notes |
|---|---|---|---|---|
| Workout | Session length | 60 min | 0 | 30 min ≈ 68% XP; mirrors energy expenditure curve |
| Sleep | Total sleep | 8 h (480 min) | 0 | Models how health benefits saturate around 8 hours |
| Deep work | Focus session | 90 min | 0 | Short sessions still rewarded; bonus for long ones |
| Meditation | Sitting time | 20 min | 0 | Strong reward for first 10 min; small bonus beyond |
| Language practice | Active study time | 30 min | 0 | Daily short sessions valued more than occasional long ones |
| Reading | Reading time | 30 min | 0 | Alternative to page count when pace varies |

---

### `duration` + `exponential`
Use when "almost finishing" should matter exponentially more than "barely starting" — rewards commitment over sporadic effort.

| Habit | Field | ideal | worst | Notes |
|---|---|---|---|---|
| Deep work | Focus session | 90 min | 0 | 45 min = 18% XP; 70 min = 44% — rewards actually reaching flow state |
| Cold exposure | Cold shower duration | 3 min | 0 | 1 min = 18% — the final minutes are what build resilience |
| HIIT workout | High-intensity minutes | 20 min | 0 | Low-effort runs barely count; only real effort scores well |
| Breath work | Session length | 15 min | 0 | Short sessions give little; full sessions give full reward |

---

### `duration` + `linear`
Use when every minute should be worth the same — strict proportionality with no saturation.

| Habit | Field | ideal | worst | Notes |
|---|---|---|---|---|
| Walking | Walk duration | 30 min | 0 | 15 min = exactly 50% XP |
| Stretching | Stretch session | 15 min | 0 | Simple, proportional |
| Instrument practice | Practice time | 60 min | 0 | Teacher-assigned time; every minute counts equally |
| Cooking at home | Time spent cooking | 45 min | 0 | Longer home cooking = proportionally more XP |

---

### `duration` + `tiered`
Use when sleep or effort naturally falls into health/performance bands that don't follow a smooth curve.

| Habit | Field | Example tiers | Notes |
|---|---|---|---|
| Sleep | Sleep duration | ≤5h → 10%, ≤6h → 40%, ≤7h → 70%, ≤8h → 100%, ≤9h → 90%, ≤Inf → 60% | Oversleeping mildly penalised |
| Nap | Nap duration | ≤20min → 100%, ≤45min → 70%, ≤90min → 40%, ≤Inf → 20% | Optimal nap is short; long naps cause grogginess |
| Workout | Session length | ≤15min → 30%, ≤30min → 60%, ≤45min → 80%, ≤Inf → 100% | Minimum thresholds matter more than the curve |

---

## `time` fields
Stores a clock time as `"HH:MM"`.

### `time` + `logarithmic`
Only valid when **later is strictly better** with no midnight crossing. `logarithmic` treats time as a plain number (minutes from midnight) and scores by proximity to `ideal` — values *below* ideal score *less*, not more. This means going to bed at 21:00 when ideal is 22:00 scores *lower* than 22:00, not higher. **Do not use for bedtime or any "earlier is better" habit — use `asymmetric` instead.**

| Habit | Field | ideal | worst | Notes |
|---|---|---|---|---|
| Morning routine | Wake-up time | 06:00 | 10:00 | Earlier wake = higher XP; smooth decay toward 10am |
| Intermittent fasting | First meal time | 12:00 | 08:00 | `ideal > worst` in minutes (720 > 480); later first meal = better |
| Workout | Gym start time | 07:00 | 12:00 | Rewards morning sessions; afternoon still gets partial credit |
| Supplements | Time taken | 08:00 | 13:00 | Penalises forgetting until afternoon |

---

### `time` + `linear`
Use when lateness should be penalised strictly proportionally — each minute late costs the same amount of XP.

| Habit | Field | ideal | worst | Notes |
|---|---|---|---|---|
| Work start | Start time | 09:00 | 11:00 | Every minute after 9am = equal XP loss |
| Lunch | Lunch time | 12:30 | 15:00 | Late lunch linearly penalised |
| Evening walk | Walk start | 18:00 | 21:00 | Rewards earlier evening activity equally |
| Kids bedtime routine | Start time | 19:30 | 21:30 | Strict proportional schedule adherence |

---

### `time` + `asymmetric`
The natural fit for any habit where there is an **ideal time with a tolerance window**, then a **Gaussian bell-curve decay** on either side. Pre and post allowances can differ for natural asymmetry (lenient before, strict after, or vice versa).

| Habit | Field | ideal | preAllowance | postAllowance | sigma | Notes |
|---|---|---|---|---|---|---|
| Bedtime | Bedtime | 22:00 | 60 min | 0 min | 90 min | Up to 1h early = full XP; 90 min late = 50% |
| Wake-up | Wake-up time | 06:30 | 30 min | 15 min | 60 min | Slight earliness OK; small plateau for snooze |
| Screen off | Screens off | 21:00 | 60 min | 0 min | 60 min | Turning off early = full XP; decays past ideal |
| First coffee | Coffee time | 09:30 | 30 min | 30 min | 90 min | Symmetric plateau around target; Gaussian decay |
| Medication | Dose time | 08:00 | 20 min | 20 min | 40 min | Symmetric tolerance; 40 min off = 50% XP |
| Intermittent fast break | First meal | 12:00 | 0 min | 30 min | 90 min | Breaking fast slightly late is fine; early = penalty |
| Kids pickup | Pickup time | 15:30 | 0 min | 10 min | 20 min | Must not be late; 20 min late = 50% XP |
| Dinner | Dinner time | 19:00 | 60 min | 30 min | 90 min | Eating a bit early or a bit late both acceptable |

---

### `time` + `tiered`
Use when time-of-day falls into named windows that matter more than exact timing — morning vs. afternoon vs. evening distinctions.

| Habit | Field | Example tiers | Notes |
|---|---|---|---|
| Bedtime | Bedtime | ≤21:00 → 100%, ≤22:00 → 90%, ≤23:00 → 70%, ≤00:00 → 40%, ≤Inf → 10% | Named sleep windows |
| Workout timing | Workout start | ≤09:00 → 100%, ≤12:00 → 80%, ≤17:00 → 60%, ≤Inf → 40% | Morning / midday / evening bands |
| Wake-up | Wake-up time | ≤06:00 → 100%, ≤07:00 → 80%, ≤08:00 → 60%, ≤Inf → 30% | Clear morning tiers |
| Alcohol | First drink time | ≤17:00 → 40%, ≤19:00 → 70%, ≤21:00 → 90%, ≤Inf → 60% | Later drinking = better (earlier = worse) |

---

## Visual Comparison

The same habit ("pages read", ideal=10, worst=0) scored five different ways. Each chart shows **multiplier (0–100% XP)** on the Y axis and **logged value** on the X axis.

```
── LOGARITHMIC ──────────────────────────────────────────────────
  Fast early gains, plateau near goal. Exceeding ideal gives a
  small bonus. Best for: effort with diminishing returns.

  100% │                        · · · · · ·
       │                    · ·
   90% │                · ·           ← ideal ≈ 90%
       │            · ·
   70% │        · ·
       │      ·
   50% │    ·
       │  ·
    0% ┼──────────────────────────────────────
       0   2   4   6   8  [10]  12   14
                          ↑ ideal


── EXPONENTIAL ──────────────────────────────────────────────────
  Slow start, accelerating finish. Almost no XP until you near
  the goal. Best for: "go hard or go home" commitments.

  100% │                                  ·
       │                              · ·
   60% │                          · ·
       │                      · ·
   40% │                  · ·
       │            · · ·
   18% │      · · ·
       │· · ·
    0% ┼──────────────────────────────────────
       0   2   4   6   8  [10]  12   14
                          ↑ ideal


── LINEAR ───────────────────────────────────────────────────────
  Strict proportionality — every unit counts the same.
  Best for: targets where partial effort = partial reward.

  100% │                         ·─────────────
       │                       ·
   80% │                     ·
       │                   ·
   60% │                 ·
       │               ·
   40% │             ·
       │           ·
   20% │         ·
    0% ┼──────────────────────────────────────
       0   2   4   6   8  [10]  12   14
                          ↑ ideal


── ASYMMETRIC (time field, ideal = 22:00, preAllowance=60, sigma=90) ───
  Gaussian bell with flat plateau. Full XP inside the plateau,
  smooth decay on both sides. Best for: time habits with tolerance.

  100% │          · · · · · · ·
       │        ·               ·
   90% │      ·                    ·
       │    ·                          ·
   70% │  ·                                ·
       │ ·                                    ·
   50% │·                                        ·  ← σ from plateau edge
       │                                              · ·
   20% │                                                    · ·
    0% ┼────────────────────────────────────────────────────────────
      -3h  -2h  -1h  │  0  │  +1h  +1.5h  +2h    +3h    +4h
            pre-edge ↑     ↑ post-edge
      ← early ───────│ plateau │──────────────── late ──────────→
                      ↑ ideal (22:00)


── TIERED (sleep hours, 4 bands) ────────────────────────────────
  Fixed XP jumps at defined thresholds. No curve — just bands.
  Best for: categorical quality levels (mood, intensity, etc.)

  100% │                    ┌──────────────
       │                    │
   70% │          ┌─────────┘
       │          │
   40% │  ┌───────┘
       │  │
   10% ┤──┘
    0% ┼──────────────────────────────────
       0h   5h    6h    7h    8h    9h+
       ↑bad↑poor↑  ok ↑ good↑ ideal
```

---

## Choosing the right mode

| Situation | Recommended mode |
|---|---|
| Effort has natural diminishing returns (showing up is most of the battle) | `logarithmic` |
| Partial effort should be harshly penalised — only near-complete counts | `exponential` |
| Every unit of effort should count equally | `linear` |
| Time-of-day habit where earlier is better | `asymmetric` |
| Habit falls into named categories or bands | `tiered` |
| Numeric rating scale (mood, energy, quality) | `tiered` |
| Sleep or nap duration with an optimal range | `tiered` (handles over/under) |
| "More is better" quantity, showing up = reward | `logarithmic` |
| "More is better" quantity, only finishing counts | `exponential` |
| Strict schedule adherence (minutes matter) | `asymmetric` or `linear` |

### Logarithmic vs Exponential at a glance

| | Logarithmic | Exponential |
|---|---|---|
| At 25% of ideal | 44% XP | 6% XP |
| At 50% of ideal | 68% XP | 18% XP |
| At 75% of ideal | 82% XP | 44% XP |
| At 100% of ideal | ~90% XP | 100% XP |
| Mindset | "Every rep counts" | "Finish or it barely matters" |
| Example | Pages read, water drunk | Full workout set, cold shower |
