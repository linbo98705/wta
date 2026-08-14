-- ═══════════════════════════════════════════════════════
-- Supabase 迁移：tournament_players 添加 partner_id 列
-- 在 Supabase Dashboard > SQL Editor 中执行
-- ═══════════════════════════════════════════════════════

-- 1. tournament_players 表添加 partner_id 字段（双打搭档）
ALTER TABLE tournament_players ADD COLUMN IF NOT EXISTS partner_id BIGINT;

-- 2. 验证字段已添加
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tournament_players' AND column_name = 'partner_id';
