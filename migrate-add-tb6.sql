-- 添加 TB6 字段到 daily_guesses 表
-- 在 Supabase Dashboard 的 SQL Editor 中执行

ALTER TABLE daily_guesses ADD COLUMN IF NOT EXISTS tb6_match TEXT DEFAULT '';
ALTER TABLE daily_guesses ADD COLUMN IF NOT EXISTS tb6_result TEXT DEFAULT '';
