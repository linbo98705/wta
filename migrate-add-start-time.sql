-- 为 matches 表添加 start_time 字段
-- 在 Supabase Dashboard 的 SQL Editor 中执行此脚本

ALTER TABLE matches ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '';
