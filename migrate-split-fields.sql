-- 迁移：将竞猜内容拆分为"球员名"和"比分"两个字段
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本

-- 1. 新增比分文本字段（存储如 "6-4 6-3" 的比分）
ALTER TABLE matches ADD COLUMN IF NOT EXISTS guess_a_score_text TEXT DEFAULT '';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS guess_b_score_text TEXT DEFAULT '';

-- 2. 迁移现有数据：从 guess_a_tb / guess_b_tb 中拆分出比分部分
--    原格式如 "Sabalenka 6-4 6-3"，将末尾数字部分移到新字段，前面部分保留为球员名
UPDATE matches
SET guess_a_score_text = COALESCE(
    (regexp_match(guess_a_tb, '\s+(\d[\d\s\-\.]+)$'))[1],
    ''
);
UPDATE matches
SET guess_b_score_text = COALESCE(
    (regexp_match(guess_b_tb, '\s+(\d[\d\s\-\.]+)$'))[1],
    ''
);

-- 3. 从 guess_a_tb / guess_b_tb 中移除已拆出的比分部分，只保留球员名
UPDATE matches
SET guess_a_tb = btrim(regexp_replace(guess_a_tb, '\s+\d[\d\s\-\.]+$', '', 'g'));
UPDATE matches
SET guess_b_tb = btrim(regexp_replace(guess_b_tb, '\s+\d[\d\s\-\.]+$', '', 'g'));

-- 4. 验证结果（可选，执行后查看输出）
SELECT id, guess_a_tb AS player_a, guess_a_score_text AS score_a,
       guess_b_tb AS player_b, guess_b_score_text AS score_b
FROM matches
WHERE guess_a_tb != '' OR guess_b_tb != '';
