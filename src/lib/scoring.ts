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
