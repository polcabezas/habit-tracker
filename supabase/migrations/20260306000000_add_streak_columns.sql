-- Per-habit streak (for XP bonus)
ALTER TABLE habits ADD COLUMN streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE habits ADD COLUMN streak_last_date DATE;

-- Global streak (for display + freeze system)
ALTER TABLE user_stats ADD COLUMN global_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN global_streak_last_date DATE;

-- Running XP total
ALTER TABLE user_stats ADD COLUMN total_xp BIGINT NOT NULL DEFAULT 0;
