-- ═══════════════════════════════════════════
-- 迁移脚本：为 tournaments 表添加 court_order 列
-- 用于配置赛事场地排序（逗号分隔的场地名称）
-- ═══════════════════════════════════════════

-- 添加 court_order 列（TEXT 类型，存储场地排序，如 '中央球场,1号球场,2号球场'）
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS court_order TEXT DEFAULT '';
