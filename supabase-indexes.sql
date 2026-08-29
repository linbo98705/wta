-- ═══════════════════════════════════════════
-- Supabase 索引优化脚本
-- 用于加速后台高频查询
-- ═══════════════════════════════════════════

-- ── tournament_players 表 ──────────────────
-- 按赛事查询参赛球员（最频繁）
CREATE INDEX IF NOT EXISTS idx_tp_tournament_id ON tournament_players(tournament_id);

-- 按球员查询参与的赛事（删除/清理时用到）
CREATE INDEX IF NOT EXISTS idx_tp_player_id ON tournament_players(player_id);

-- 唯一约束：同一球员在同一赛事只能报名一次
CREATE UNIQUE INDEX IF NOT EXISTS idx_tp_unique ON tournament_players(tournament_id, player_id);

-- ── matches 表 ─────────────────────────────
-- 按赛事查询所有比赛（签表、赛程页）
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);

-- 按轮次查询（晋级逻辑）
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round);

-- 按 match_order 排序（签表展示顺序）
CREATE INDEX IF NOT EXISTS idx_matches_order ON matches(tournament_id, match_order);

-- 按球员查询参与的比赛（删除球员时清理引用）
CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_id) WHERE player1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_id) WHERE player2_id IS NOT NULL;

-- ── daily_guesses 表 ───────────────────────
-- 按赛事查询竞猜列表
CREATE INDEX IF NOT EXISTS idx_guesses_tournament_id ON daily_guesses(tournament_id);

-- 按日期查询（每日竞猜首页）
CREATE INDEX IF NOT EXISTS idx_guesses_date ON daily_guesses(guess_date);

-- 组合索引：按赛事 + 日期
CREATE INDEX IF NOT EXISTS idx_guesses_tournament_date ON daily_guesses(tournament_id, guess_date);

-- ── tournament_player_snapshots 表 ─────────
-- 按赛事查询快照（冻结/读取）
CREATE INDEX IF NOT EXISTS idx_snapshots_tournament_id ON tournament_player_snapshots(tournament_id);

-- ── profiles 表 ────────────────────────────
-- 按角色查询用户（管理员面板）
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ── user_tournaments 表 ────────────────────
-- 按用户查询分配的赛事（editor 权限过滤）
CREATE INDEX IF NOT EXISTS idx_ut_user_id ON user_tournaments(user_id);

-- 按赛事查询授权用户（反向查询）
CREATE INDEX IF NOT EXISTS idx_ut_tournament_id ON user_tournaments(tournament_id);

-- 唯一约束：同一用户对同一赛事只能分配一次
CREATE UNIQUE INDEX IF NOT EXISTS idx_ut_unique ON user_tournaments(user_id, tournament_id);
