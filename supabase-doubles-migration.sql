-- ═══════════════════════════════════════════════════════
-- Supabase 双打功能迁移 SQL
-- 在 Supabase Dashboard > SQL Editor 中执行
-- ═══════════════════════════════════════════════════════

-- 1. tournaments 表添加 match_type 字段
--    singles = 单打（默认），doubles = 双打
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS match_type TEXT DEFAULT 'singles';

-- 2. matches 表添加 player3_id, player4_id 字段（双打扩展）
--    player3_id = 队伍A第二名球员，player4_id = 队伍B第二名球员
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player3_id BIGINT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player4_id BIGINT;

-- 3. matches 表添加 guess_a2_tb, guess_b2_tb 字段（四球员竞猜扩展）
--    如果之前已执行过则跳过
ALTER TABLE matches ADD COLUMN IF NOT EXISTS guess_a2_tb TEXT DEFAULT '';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS guess_b2_tb TEXT DEFAULT '';

-- 4. 验证字段已添加
SELECT
    'tournaments' as table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'tournaments' AND column_name = 'match_type'

UNION ALL

SELECT
    'matches' as table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'matches'
  AND column_name IN ('player3_id', 'player4_id', 'guess_a2_tb', 'guess_b2_tb')
ORDER BY table_name, column_name;
