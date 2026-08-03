-- 修复 daily_guesses 表的更新问题
-- 问题原因：tb3-tb6 列可能缺少 GRANT UPDATE 权限，导致 UPDATE 静默忽略这些列
-- 解决方案：创建 SECURITY DEFINER 函数绕过 RLS 和列权限
-- 在 Supabase Dashboard 的 SQL Editor 中执行此文件

-- ═══════════════════════════════════════════
-- 1. 创建 RPC 函数（SECURITY DEFINER 绕过所有权限检查）
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_daily_guess(
    p_id BIGINT,
    p_data JSONB
) RETURNS JSONB AS $$
DECLARE
    result_row daily_guesses%ROWTYPE;
BEGIN
    UPDATE daily_guesses SET
        guess_date = COALESCE(p_data->>'guess_date', guess_date),
        deadline = COALESCE(p_data->>'deadline', deadline),
        tb1_match = COALESCE(p_data->>'tb1_match', tb1_match),
        tb1_result = COALESCE(p_data->>'tb1_result', tb1_result),
        tb2_match = COALESCE(p_data->>'tb2_match', tb2_match),
        tb2_result = COALESCE(p_data->>'tb2_result', tb2_result),
        tb3_match = COALESCE(p_data->>'tb3_match', tb3_match),
        tb3_result = COALESCE(p_data->>'tb3_result', tb3_result),
        tb4_match = COALESCE(p_data->>'tb4_match', tb4_match),
        tb4_result = COALESCE(p_data->>'tb4_result', tb4_result),
        tb5_match = COALESCE(p_data->>'tb5_match', tb5_match),
        tb5_result = COALESCE(p_data->>'tb5_result', tb5_result),
        tb6_match = COALESCE(p_data->>'tb6_match', tb6_match),
        tb6_result = COALESCE(p_data->>'tb6_result', tb6_result)
    WHERE id = p_id
    RETURNING * INTO result_row;

    IF result_row IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Record not found');
    END IF;

    RETURN to_jsonb(result_row);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 允许已登录用户调用此函数
GRANT EXECUTE ON FUNCTION public.update_daily_guess(BIGINT, JSONB) TO authenticated;

-- ═══════════════════════════════════════════
-- 2. 修复列权限（双保险）
-- ═══════════════════════════════════════════

ALTER TABLE daily_guesses ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户和已登录用户 SELECT
DROP POLICY IF EXISTS "daily_guesses_select_all" ON daily_guesses;
CREATE POLICY "daily_guesses_select_all"
    ON daily_guesses FOR SELECT
    TO anon, authenticated
    USING (true);

-- 允许已登录用户 INSERT
DROP POLICY IF EXISTS "daily_guesses_insert_authenticated" ON daily_guesses;
CREATE POLICY "daily_guesses_insert_authenticated"
    ON daily_guesses FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 允许已登录用户 UPDATE
DROP POLICY IF EXISTS "daily_guesses_update_authenticated" ON daily_guesses;
CREATE POLICY "daily_guesses_update_authenticated"
    ON daily_guesses FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 允许已登录用户 DELETE
DROP POLICY IF EXISTS "daily_guesses_delete_authenticated" ON daily_guesses;
CREATE POLICY "daily_guesses_delete_authenticated"
    ON daily_guesses FOR DELETE
    TO authenticated
    USING (true);

-- 确保所有列都有完整的权限
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_guesses TO authenticated;
GRANT SELECT ON daily_guesses TO anon;
