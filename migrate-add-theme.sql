-- ═══════════════════════════════════════════
-- 迁移脚本：为 tournaments 表添加 theme 列
-- 用于配置赛事页面主题色（默认紫色，可选紫橙搭配/硬地蓝/红土橙/草地绿）
-- ═══════════════════════════════════════════

-- 添加 theme 列（TEXT 类型，存储页面主题标识，默认 'purple'）
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'purple';
