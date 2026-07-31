-- ═══════════════════════════════════════════
-- 迁移脚本：为 matches 表添加 match_date 列
-- 用于前端按日期筛选赛程赛果
-- ═══════════════════════════════════════════

-- 添加 match_date 列（TEXT 类型，存储日期字符串如 '2026-07-31'）
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_date TEXT DEFAULT '';

-- 更新 RLS 策略（无需修改，现有策略已覆盖所有列）
