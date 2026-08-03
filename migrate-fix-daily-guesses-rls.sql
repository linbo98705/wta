-- 修复 daily_guesses 表的 RLS 策略
-- 问题原因：daily_guesses 表缺少 UPDATE 和 DELETE 的 RLS 策略，
-- 导致已登录管理员编辑竞猜时 UPDATE 被 RLS 静默阻止（返回成功但 0 行受影响）
-- 在 Supabase Dashboard 的 SQL Editor 中执行此文件

-- 确保 RLS 已启用
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

-- 允许已登录用户 UPDATE（管理员编辑竞猜）— 这是之前缺失的策略
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
