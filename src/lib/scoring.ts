import type { MetadataField } from '@/components/HabitCard';

/**
 * Calculates the compound XP yield for a habit based on consecutive completed days.
 * 
 * Rules:
 * - Base = 10 XP
 * - For every consecutive day, +5% multiplier (0.05)
 * - Maximum multiplier is 2.0x (100% bonus), which maxes out at 20 consecutive days.
 * 
 * @param streak The number of consecutive days completed so far.
 * @returns The XP yielded for completing an action today.
 */
export function calculateCompoundXP(streak: number, baseXP: number = 10): number {
  const bonusMultiplier = Math.min(1.0 + (streak * 0.05), 2.0);
  return Math.round(baseXP * bonusMultiplier);
}

/**
 * Calculates how many freezers the user should earn based on unrewarded perfect weeks.
 * 
 * A perfect week is exactly 7 days of 100% completion.
 * Max inventory is 3 freezers.
 * 
 * @param totalConsecutiveDays The total number of consecutive days ALL habits were completed.
 * @param currentFreezers The current amount of freezers.
 * @param rewardedWeeks How many weeks have already been rewarded with freezers.
 * @returns The new count of freezers and new rewarded weeks count.
 */
export function calculateStreakFreezers(
  totalConsecutiveDays: number, 
  currentFreezers: number,
  rewardedWeeks: number
): { newFreezers: number, newRewardedWeeks: number } {
  const earnedWeeks = Math.floor(totalConsecutiveDays / 7);
  const newUnrewardedWeeks = Math.max(0, earnedWeeks - rewardedWeeks);
  
  const newFreezers = Math.min(3, currentFreezers + newUnrewardedWeeks);
  
  return {
    newFreezers,
    newRewardedWeeks: rewardedWeeks + newUnrewardedWeeks
  };
}

/**
 * Parses "HH:MM" → total minutes from midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Returns a quality multiplier (0.0–1.5) for a single metadata field value.
 * Returns 1.0 if the field has no scoringConfig.
 */
export function calculateFieldMultiplier(field: MetadataField, value: any): number {
  const cfg = field.scoringConfig;
  if (!cfg) return 1.0;

  const min = cfg.minMultiplier ?? 0;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // ── Tiered ──────────────────────────────────────────────────────────────────
  if (cfg.mode === 'tiered') {
    if (!cfg.tiers || cfg.tiers.length === 0) return 1.0;
    const actualMin = field.type === 'time' ? parseTimeToMinutes(String(value)) : Number(value);
    for (const tier of cfg.tiers) {
      const upTo = tier.upTo === Infinity || tier.upTo === 'Infinity'
        ? Infinity
        : field.type === 'time'
          ? parseTimeToMinutes(String(tier.upTo))
          : Number(tier.upTo);
      if (actualMin <= upTo) return tier.multiplier;
    }
    return min;
  }

  // ── Asymmetric (time fields — Gaussian bell + flat plateau) ─────────────
  if (cfg.mode === 'asymmetric') {
    if (cfg.ideal === undefined) return 1.0;

    const idealMin = parseTimeToMinutes(String(cfg.ideal));
    let actualMin  = parseTimeToMinutes(String(value));

    // Midnight wraparound: times more than 6h before ideal are actually next-day
    if (actualMin < idealMin - 360) actualMin += 1440;

    const preAllowance  = cfg.earlyGrace ?? 60;  // minutes before ideal at 1.0
    const postAllowance = cfg.lateGrace  ?? 0;   // minutes after ideal at 1.0
    const sigma         = cfg.lateCliff  ?? 90;  // minutes past plateau edge → 50% XP
    const deviation     = actualMin - idealMin;

    const allowance = deviation < 0 ? preAllowance : postAllowance;

    if (Math.abs(deviation) <= allowance) return 1.0; // inside plateau

    const excess    = Math.abs(deviation) - allowance;
    const sigmaTrue = sigma / Math.sqrt(2 * Math.LN2); // calibrate so excess=sigma → 50%
    const multiplier = Math.exp(-(excess * excess) / (2 * sigmaTrue * sigmaTrue));
    return clamp(multiplier, min, 1.0);
  }

  // ── Logarithmic / Exponential / Linear (require ideal + worst) ──────────
  if (cfg.ideal === undefined || cfg.worst === undefined) return 1.0;

  const toNum = (v: string | number) =>
    field.type === 'time' ? parseTimeToMinutes(String(v)) : Number(v);

  const idealNum = toNum(cfg.ideal);
  const worstNum = toNum(cfg.worst);
  let actualNum = field.type === 'time' ? parseTimeToMinutes(String(value)) : Number(value);

  // Midnight wraparound fix for time fields where lower (earlier) is better.
  // e.g. ideal=22:00 (1320), actual=00:30 (30) → should be read as 24:30 (1470), not 00:30.
  // Heuristic: if the recorded time is more than 6 hours before the ideal it has
  // almost certainly crossed midnight, so add 1440 minutes.
  if (field.type === 'time' && !(idealNum > worstNum) && actualNum < idealNum - 360) {
    actualNum += 1440;
  }

  if (cfg.mode === 'linear') {
    if (idealNum === worstNum) return 1.0;
    // At ideal → 1.0, at worst → min; clamped to [min, 1.0]
    const raw = min + (1 - min) * (actualNum - worstNum) / (idealNum - worstNum);
    return clamp(raw, min, 1.0);
  }

  const higherIsBetter = idealNum > worstNum;
  let ratio: number;
  if (higherIsBetter) {
    ratio = idealNum > 0 ? actualNum / idealNum : 0;
  } else {
    // lower is better — invert ratio
    ratio = actualNum > 0 ? idealNum / actualNum : 0;
  }
  const r = Math.max(0, ratio);

  // ── Logarithmic — fast early gains, natural saturation near ideal ────────
  // Formula: 1 − e^(−C × ratio), C=2.303 → multiplier ≈ 0.90 at ratio=1
  // NOTE: any DB records saved with mode='exponential' before this rename
  // will now resolve to the true exponential branch below instead of here.
  if (cfg.mode === 'logarithmic') {
    const C = 2.303;
    return clamp(1 - Math.exp(-C * r), min, 1.5);
  }

  // ── Exponential — slow start, accelerating gains, full reward at ideal ───
  // Formula: (e^(C×ratio) − 1) / (e^C − 1), C=3 → multiplier = 1.0 exactly at ratio=1
  const C = 3;
  const multiplier = (Math.exp(C * r) - 1) / (Math.exp(C) - 1);
  return clamp(multiplier, min, 1.5);
}

/**
 * Averages multipliers for all scored fields. Returns 1.0 when no fields have scoringConfig.
 */
export function calculateGradientMultiplier(
  metadataSchema: MetadataField[],
  metadataValues: Record<string, any>
): number {
  const scoredFields = metadataSchema.filter(f => f.scoringConfig);
  if (scoredFields.length === 0) return 1.0;
  const sum = scoredFields.reduce((acc, f) => acc + calculateFieldMultiplier(f, metadataValues[f.id]), 0);
  return sum / scoredFields.length;
}

/**
 * Master XP function: base_xp × gradientMultiplier × streakBonus, signed by habit type.
 */
export function calculateHabitXP(
  habit: { base_xp: number; type: 'positive' | 'negative'; metadataSchema?: MetadataField[] },
  metadataValues: Record<string, any>,
  streak: number
): number {
  const gradientMultiplier = calculateGradientMultiplier(habit.metadataSchema ?? [], metadataValues);
  const streakBonus = Math.min(1.0 + streak * 0.05, 2.0);
  const rawXP = Math.round(habit.base_xp * gradientMultiplier * streakBonus);
  return habit.type === 'negative' ? -rawXP : rawXP;
}
