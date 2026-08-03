-- 修复 daily_guesses 表的 RLS 策略和列权限
-- 问题原因：tb3-tb6 列可能缺少 GRANT UPDATE/INSERT 权限，
-- 导致已登录管理员编辑竞猜时 tb1/tb2 能更新但 tb3-tb6 被静默忽略
-- 在 Supabase Dashboard 的 SQL Editor 中执行此文件

-- ═══════════════════════════════════════════
-- 1. RLS 策略（行级安全）
-- ═══════════════════════════════════════════

ALTER TABLE daily_guesses ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户和已登录用户 SELECT（前台展示需要）
DROP POLICY IF EXISTS "daily_guesses_select_all" ON daily_guesses;
CREATE POLICY "daily_guesses_select_all"
    ON daily_guesses FOR SELECT
    TO anon, authenticated
    USING (true);

-- 允许已登录用户 INSERT（管理员创建竞猜）
DROP POLICY IF EXISTS "daily_guesses_insert_authenticated" ON daily_guesses;
CREATE POLICY "daily_guesses_insert_authenticated"
    ON daily_guesses FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 允许已登录用户 UPDATE（管理员编辑竞猜）
DROP POLICY IF EXISTS "daily_guesses_update_authenticated" ON daily_guesses;
CREATE POLICY "daily_guesses_update_authenticated"
    ON daily_guesses FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 允许已登录用户 DELETE（管理员删除竞猜）
DROP POLICY IF EXISTS "daily_guesses_delete_authenticated" ON daily_guesses;
CREATE POLICY "daily_guesses_delete_authenticated"
    ON daily_guesses FOR DELETE
    TO authenticated
    USING (true);

-- ═══════════════════════════════════════════
-- 2. 列级权限（关键修复！）
-- 当通过 ALTER TABLE 后续添加 tb3-tb6 列时，
-- 新列可能不会自动继承 authenticated 角色的 UPDATE/INSERT 权限
-- 这会导致 PostgREST 静默忽略这些列的更新
-- ═══════════════════════════════════════════

-- 授予 authenticated 角色对所有列的完整权限
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_guesses TO authenticated;
GRANT SELECT ON daily_guesses TO anon;

-- 确保所有列（包括 tb3-tb6）都有 UPDATE 权限
-- PostgreSQL 中 GRANT UPDATE ON table 会覆盖所有列，无需逐列授权
-- 但如果之前使用过 GRANT UPDATE (col1, col2) 限制了列，需要重新授予全表权限
GRANT UPDATE ON daily_guesses TO authenticated;
GRANT INSERT ON daily_guesses TO authenticated;
