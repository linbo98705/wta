#!/usr/bin/env python3
"""模拟WTA比赛网站 - Flask后端"""

import os
import sqlite3
import json
import io
import random
from datetime import datetime, date
from flask import Flask, g, request, jsonify, render_template, send_from_directory, make_response
import openpyxl

app = Flask(__name__)
app.config['SECRET_KEY'] = 'wta-simulator-secret-key-2024'
DATABASE = os.path.join(os.path.dirname(__file__), 'data', 'tournament.db')

# ── 后台认证 ────────────────────────────────────────────
ADMIN_USERNAME = 'admin'
ADMIN_PASSWORD = 'wta2024'

from functools import wraps

def require_admin_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or auth.username != ADMIN_USERNAME or auth.password != ADMIN_PASSWORD:
            resp = make_response('需要登录', 401)
            resp.headers['WWW-Authenticate'] = 'Basic realm="Admin Area"'
            return resp
        return f(*args, **kwargs)
    return decorated

# ── 数据库 ──────────────────────────────────────────────

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    db = sqlite3.connect(DATABASE)
    db.executescript('''
        CREATE TABLE IF NOT EXISTS tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            name_cn TEXT NOT NULL,
            location TEXT NOT NULL,
            surface TEXT NOT NULL DEFAULT 'Hard',
            category TEXT NOT NULL DEFAULT 'WTA 500',
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            draw_size INTEGER NOT NULL DEFAULT 32,
            logo_url TEXT DEFAULT '',
            theme TEXT DEFAULT 'purple',
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            country TEXT DEFAULT '',
            country_code TEXT NOT NULL DEFAULT '',
            ranking INTEGER DEFAULT 999,
            seed INTEGER DEFAULT 0,
            photo_url TEXT DEFAULT '',
            bio TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS tournament_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            seed INTEGER DEFAULT 0,
            entry_type TEXT DEFAULT 'main',
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
            FOREIGN KEY (player_id) REFERENCES players(id),
            UNIQUE(tournament_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            round TEXT NOT NULL,
            match_order INTEGER DEFAULT 0,
            player1_id INTEGER,
            player2_id INTEGER,
            winner_id INTEGER,
            score TEXT DEFAULT '',
            court TEXT DEFAULT '',
            status TEXT DEFAULT 'scheduled',
            guess_team_a TEXT DEFAULT '',
            guess_team_b TEXT DEFAULT '',
            guess_a_tb TEXT DEFAULT '',
            guess_b_tb TEXT DEFAULT '',
            guess_a_total INTEGER DEFAULT 0,
            guess_b_total INTEGER DEFAULT 0,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
            FOREIGN KEY (player1_id) REFERENCES players(id),
            FOREIGN KEY (player2_id) REFERENCES players(id),
            FOREIGN KEY (winner_id) REFERENCES players(id)
        );

        CREATE TABLE IF NOT EXISTS tournament_player_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            country TEXT DEFAULT '',
            country_code TEXT DEFAULT '',
            ranking INTEGER DEFAULT 999,
            seed INTEGER DEFAULT 0,
            entry_type TEXT DEFAULT 'main',
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
            UNIQUE(tournament_id, player_id)
        );
    ''')
    # 为已存在的数据库添加竞猜字段（如果缺失）
    for col, col_type in [
        ('guess_team_a', 'TEXT DEFAULT \'\''),
        ('guess_team_b', 'TEXT DEFAULT \'\''),
        ('guess_a_tb', 'TEXT DEFAULT \'\''),
        ('guess_b_tb', 'TEXT DEFAULT \'\''),
        ('guess_a_total', 'INTEGER DEFAULT 0'),
        ('guess_b_total', 'INTEGER DEFAULT 0'),
        ('guess_a_tb_score', 'TEXT DEFAULT \'\''),
        ('guess_b_tb_score', 'TEXT DEFAULT \'\''),
        ('guess_winner', 'TEXT DEFAULT \'\''),
        ('guess_reason', 'TEXT DEFAULT \'\''),
        # 旧字段（向后兼容，不再使用）
        ('guess_team_a_score', 'TEXT DEFAULT \'\''),
        ('guess_team_b_score', 'TEXT DEFAULT \'\''),
        ('guess_team_a_points', 'INTEGER DEFAULT 0'),
        ('guess_team_b_points', 'INTEGER DEFAULT 0'),
    ]:
        try:
            db.execute(f'ALTER TABLE matches ADD COLUMN {col} {col_type}')
        except sqlite3.OperationalError:
            pass  # 列已存在

    # ── 每日竞猜表 ──
    db.executescript('''
        CREATE TABLE IF NOT EXISTS daily_guesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            guess_date TEXT NOT NULL DEFAULT '',
            deadline TEXT DEFAULT '',
            tb1_match TEXT DEFAULT '',
            tb1_result TEXT DEFAULT '',
            tb2_match TEXT DEFAULT '',
            tb2_result TEXT DEFAULT '',
            tb3_match TEXT DEFAULT '',
            tb3_result TEXT DEFAULT '',
            tb4_match TEXT DEFAULT '',
            tb4_result TEXT DEFAULT '',
            tb5_match TEXT DEFAULT '',
            tb5_result TEXT DEFAULT '',
            tb6_match TEXT DEFAULT '',
            tb6_result TEXT DEFAULT '',
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
        );
    ''')
    # deadline 字段增量迁移
    try:
        db.execute('ALTER TABLE daily_guesses ADD COLUMN deadline TEXT DEFAULT \'\'')
    except sqlite3.OperationalError:
        pass
    # tb6 字段增量迁移
    try:
        db.execute('ALTER TABLE daily_guesses ADD COLUMN tb6_match TEXT DEFAULT \'\'')
    except sqlite3.OperationalError:
        pass
    try:
        db.execute('ALTER TABLE daily_guesses ADD COLUMN tb6_result TEXT DEFAULT \'\'')
    except sqlite3.OperationalError:
        pass
    # tournaments.theme 字段增量迁移（后台可选的页面主题，默认紫色）
    try:
        db.execute("ALTER TABLE tournaments ADD COLUMN theme TEXT DEFAULT 'purple'")
    except sqlite3.OperationalError:
        pass
    db.commit()
    db.close()

# ── 初始化数据库 ────────────────────────────────────────

with app.app_context():
    if not os.path.exists(DATABASE):
        os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
    init_db()
    print("数据库已初始化/迁移完成")

# ── 前端页面路由 ────────────────────────────────────────

@app.route('/')
def index():
    """首页 - 赛事列表"""
    return render_template('index.html')

@app.route('/tournament/<int:tid>')
def tournament_home(tid):
    """赛事主页"""
    return render_template('tournament.html', tid=tid)

@app.route('/tournament/<int:tid>/players')
def player_list(tid):
    """参赛名单"""
    return render_template('players.html', tid=tid)

@app.route('/tournament/<int:tid>/draw')
def draw(tid):
    """比赛签表"""
    return render_template('draw.html', tid=tid)

@app.route('/tournament/<int:tid>/schedule')
def schedule(tid):
    """赛程"""
    return render_template('schedule.html', tid=tid)

@app.route('/tournament/<int:tid>/results')
def results(tid):
    """赛果 - 合并到赛程赛果页面"""
    from flask import redirect, url_for
    return redirect(f'/tournament/{tid}/schedule')

@app.route('/tournament/<int:tid>/guesses')
def guesses(tid):
    """每日竞猜页面"""
    return render_template('guesses.html', tid=tid)

@app.route('/admin')
@require_admin_auth
def admin():
    """后台管理"""
    return render_template('admin.html')

# ── API 路由 ───────────────────────────────────────────

# 赛事 API
@app.route('/api/tournaments')
def api_tournaments():
    db = get_db()
    rows = db.execute('SELECT * FROM tournaments ORDER BY start_date DESC').fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tournaments/<int:tid>')
def api_tournament(tid):
    db = get_db()
    row = db.execute('SELECT * FROM tournaments WHERE id = ?', (tid,)).fetchone()
    if row:
        return jsonify(dict(row))
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/tournaments', methods=['POST'])
def api_create_tournament():
    data = request.json
    db = get_db()
    db.execute('''INSERT INTO tournaments (name, name_cn, location, surface, category,
                  start_date, end_date, draw_size, logo_url, theme)
                  VALUES (?,?,?,?,?,?,?,?,?,?)''',
               (data['name'], data['name_cn'], data['location'], data.get('surface', 'Hard'),
                data.get('category', 'WTA 500'), data['start_date'], data['end_date'],
                data.get('draw_size', 32), data.get('logo_url', ''), data.get('theme', 'purple')))
    db.commit()
    return jsonify({'id': db.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201

@app.route('/api/tournaments/<int:tid>', methods=['PUT'])
def api_update_tournament(tid):
    data = request.json
    db = get_db()
    fields = []
    values = []
    for k in ['name', 'name_cn', 'location', 'surface', 'category', 'start_date', 'end_date', 'draw_size', 'is_active', 'logo_url', 'theme']:
        if k in data:
            fields.append(f'{k}=?')
            values.append(data[k])
    if fields:
        values.append(tid)
        db.execute(f'UPDATE tournaments SET {",".join(fields)} WHERE id=?', values)
        db.commit()
    return jsonify({'success': True})

@app.route('/api/tournaments/<int:tid>', methods=['DELETE'])
def api_delete_tournament(tid):
    db = get_db()
    db.execute('DELETE FROM tournament_players WHERE tournament_id=?', (tid,))
    db.execute('DELETE FROM tournament_player_snapshots WHERE tournament_id=?', (tid,))
    db.execute('DELETE FROM matches WHERE tournament_id=?', (tid,))
    db.execute('DELETE FROM tournaments WHERE id=?', (tid,))
    db.commit()
    return jsonify({'success': True})

# 球员 API
@app.route('/api/players')
def api_players():
    db = get_db()
    rows = db.execute('SELECT * FROM players ORDER BY name').fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/players/<int:pid>')
def api_player(pid):
    db = get_db()
    row = db.execute('SELECT * FROM players WHERE id = ?', (pid,)).fetchone()
    if row:
        return jsonify(dict(row))
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/players', methods=['POST'])
def api_create_player():
    data = request.json
    db = get_db()
    db.execute('''INSERT INTO players (name, country, ranking, seed, photo_url, bio)
                  VALUES (?,?,?,?,?,?)''',
               (data['name'], data.get('country', ''),
                data.get('ranking', 999), data.get('seed', 0), data.get('photo_url', ''), data.get('bio', '')))
    db.commit()
    return jsonify({'id': db.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201

@app.route('/api/players/<int:pid>', methods=['PUT'])
def api_update_player(pid):
    data = request.json
    db = get_db()
    fields = []
    values = []
    for k in ['name', 'country', 'ranking', 'seed', 'photo_url', 'bio']:
        if k in data:
            fields.append(f'{k}=?')
            values.append(data[k])
    if fields:
        values.append(pid)
        db.execute(f'UPDATE players SET {",".join(fields)} WHERE id=?', values)
        db.commit()
    return jsonify({'success': True})

@app.route('/api/players/<int:pid>', methods=['DELETE'])
def api_delete_player(pid):
    db = get_db()
    db.execute('DELETE FROM tournament_players WHERE player_id=?', (pid,))
    db.execute('DELETE FROM matches WHERE player1_id=? OR player2_id=?', (pid, pid))
    db.execute('DELETE FROM players WHERE id=?', (pid,))
    db.commit()
    return jsonify({'success': True})

# 批量添加球员
@app.route('/api/players/batch', methods=['POST'])
def api_batch_create_players():
    data = request.json
    if not isinstance(data, list) or len(data) == 0:
        return jsonify({'error': '需要球员数组'}), 400
    db = get_db()
    ids = []
    updated = 0
    created = 0
    for p in data:
        name = p['name'].strip()
        if not name:
            continue
        # 检查是否已存在同名球员
        existing = db.execute('SELECT id FROM players WHERE name = ?', (name,)).fetchone()
        if existing:
            # 更新已有球员信息
            db.execute('UPDATE players SET country=?, ranking=? WHERE id=?',
                       (p.get('country', ''), p.get('ranking', 999), existing[0]))
            ids.append(existing[0])
            updated += 1
        else:
            # 新增
            db.execute('INSERT INTO players (name, country, ranking) VALUES (?,?,?)',
                       (name, p.get('country', ''), p.get('ranking', 999)))
            ids.append(db.execute('SELECT last_insert_rowid()').fetchone()[0])
            created += 1
    db.commit()
    return jsonify({'ids': ids, 'count': len(ids), 'created': created, 'updated': updated}), 201

# 批量删除球员
@app.route('/api/players/batch/delete', methods=['POST'])
def api_batch_delete_players():
    data = request.json
    if not isinstance(data, list) or len(data) == 0:
        return jsonify({'error': '需要球员ID数组'}), 400
    db = get_db()
    for pid in data:
        db.execute('DELETE FROM tournament_players WHERE player_id=?', (pid,))
        db.execute('DELETE FROM matches WHERE player1_id=? OR player2_id=?', (pid, pid))
        db.execute('DELETE FROM players WHERE id=?', (pid,))
    db.commit()
    return jsonify({'success': True, 'count': len(data)})

# 上传文件解析球员
@app.route('/api/players/upload', methods=['POST'])
def api_upload_players():
    if 'file' not in request.files:
        return jsonify({'error': '请上传文件'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '文件名为空'}), 400

    filename = file.filename.lower()
    players_data = []

    try:
        if filename.endswith('.csv'):
            # CSV 解析
            content = file.read().decode('utf-8')
            lines = content.splitlines()
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                # 支持逗号或Tab分隔
                sep = '\t' if '\t' in line else ','
                cols = [c.strip().strip('"') for c in line.split(sep)]
                if cols and cols[0]:
                    players_data.append({
                        'name': cols[0],
                        'country': cols[1] if len(cols) > 1 else '',
                        'ranking': int(cols[2]) if len(cols) > 2 and cols[2].isdigit() else 999
                    })
        elif filename.endswith('.xlsx') or filename.endswith('.xls'):
            # Excel 解析
            wb = openpyxl.load_workbook(io.BytesIO(file.read()))
            ws = wb.active
            for row in ws.iter_rows(min_row=1, values_only=True):
                # 跳过空行和表头行（第一行如果看起来像标题就跳过）
                if not row or not row[0]:
                    continue
                name = str(row[0]).strip()
                # 跳过表头
                if name in ('姓名', '中文姓名', '球员', '名字', 'name', 'Name'):
                    continue
                country = str(row[1]).strip() if len(row) > 1 and row[1] else ''
                ranking = 999
                if len(row) > 2 and row[2] is not None:
                    try:
                        ranking = int(row[2])
                    except (ValueError, TypeError):
                        ranking = 999
                players_data.append({'name': name, 'country': country, 'ranking': ranking})
        else:
            return jsonify({'error': '不支持的文件格式，请上传 .csv 或 .xlsx 文件'}), 400
    except Exception as e:
        return jsonify({'error': f'文件解析失败: {str(e)}'}), 400

    if not players_data:
        return jsonify({'error': '未检测到有效数据'}), 400

    return jsonify({'players': players_data, 'count': len(players_data)})

# 赛事参赛球员 API
@app.route('/api/tournaments/<int:tid>/players')
def api_tournament_players(tid):
    db = get_db()
    # 签表生成后使用快照数据，避免球员信息修改影响已生成的赛事
    snap_count = db.execute(
        'SELECT COUNT(*) FROM tournament_player_snapshots WHERE tournament_id=?', (tid,)
    ).fetchone()[0]
    if snap_count > 0:
        rows = db.execute('''
            SELECT player_id as id, name, country, country_code, ranking,
                   seed as t_seed, entry_type, seed, '' as photo_url, '' as bio
            FROM tournament_player_snapshots
            WHERE tournament_id = ?
            ORDER BY ranking ASC
        ''', (tid,)).fetchall()
    else:
        rows = db.execute('''
            SELECT p.*, tp.seed as t_seed, tp.entry_type
            FROM tournament_players tp
            JOIN players p ON tp.player_id = p.id
            WHERE tp.tournament_id = ?
            ORDER BY p.ranking ASC
        ''', (tid,)).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tournaments/<int:tid>/players', methods=['POST'])
def api_add_tournament_player(tid):
    data = request.json
    db = get_db()
    try:
        db.execute('INSERT INTO tournament_players (tournament_id, player_id, seed, entry_type) VALUES (?,?,?,?)',
                   (tid, data['player_id'], data.get('seed', 0), data.get('entry_type', 'main')))
        db.commit()
        return jsonify({'success': True}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Player already in tournament'}), 400

@app.route('/api/tournaments/<int:tid>/players/<int:pid>', methods=['DELETE'])
def api_remove_tournament_player(tid, pid):
    db = get_db()
    db.execute('DELETE FROM tournament_players WHERE tournament_id=? AND player_id=?', (tid, pid))
    db.commit()
    return jsonify({'success': True})

# 自动重算种子
@app.route('/api/tournaments/<int:tid>/recalc-seeds', methods=['POST'])
def api_recalc_seeds(tid):
    db = get_db()
    tournament = db.execute('SELECT * FROM tournaments WHERE id=?', (tid,)).fetchone()
    if not tournament:
        return jsonify({'error': 'Tournament not found'}), 404

    draw_size = tournament['draw_size']
    max_seeds = get_num_seeds(draw_size)

    # 获取所有报名球员，按排名升序（排名越小越靠前）
    players = db.execute('''
        SELECT tp.*, p.ranking FROM tournament_players tp
        JOIN players p ON tp.player_id = p.id
        WHERE tp.tournament_id = ?
        ORDER BY p.ranking ASC
    ''', (tid,)).fetchall()

    # 先将所有种子清零
    db.execute('UPDATE tournament_players SET seed=0 WHERE tournament_id=?', (tid,))

    # 给排名靠前的球员分配种子（正赛优先）
    seeded_count = 0
    for p in players:
        if seeded_count >= max_seeds:
            break
        if p['entry_type'] in ('main', 'wc', 'q'):  # 所有类型都可以成为种子
            seeded_count += 1
            db.execute('UPDATE tournament_players SET seed=? WHERE id=?', (seeded_count, p['id']))

    db.commit()
    return jsonify({'success': True, 'seeded': seeded_count, 'max_seeds': max_seeds})

@app.route('/api/tournaments/<int:tid>/players/<int:pid>', methods=['PUT'])
def api_update_tournament_player(tid, pid):
    data = request.json
    db = get_db()
    db.execute('UPDATE tournament_players SET seed=?, entry_type=? WHERE tournament_id=? AND player_id=?',
               (data.get('seed', 0), data.get('entry_type', 'main'), tid, pid))
    db.commit()
    return jsonify({'success': True})

# 比赛 API
@app.route('/api/tournaments/<int:tid>/matches')
def api_matches(tid):
    db = get_db()
    round_filter = request.args.get('round', '')
    # 签表生成后使用快照数据，避免球员信息修改影响已生成的赛事
    snap_count = db.execute(
        'SELECT COUNT(*) FROM tournament_player_snapshots WHERE tournament_id=?', (tid,)
    ).fetchone()[0]
    use_snapshot = snap_count > 0

    if use_snapshot:
        base_query = '''
            SELECT m.*, s1.name as p1_name, '' as p1_country, s1.country as p1_country_name,
                   s2.name as p2_name, '' as p2_country, s2.country as p2_country_name,
                   sw.name as winner_name
            FROM matches m
            LEFT JOIN tournament_player_snapshots s1
                ON m.player1_id = s1.player_id AND s1.tournament_id = m.tournament_id
            LEFT JOIN tournament_player_snapshots s2
                ON m.player2_id = s2.player_id AND s2.tournament_id = m.tournament_id
            LEFT JOIN tournament_player_snapshots sw
                ON m.winner_id = sw.player_id AND sw.tournament_id = m.tournament_id
        '''
    else:
        base_query = '''
            SELECT m.*, p1.name as p1_name, '' as p1_country, p1.country as p1_country_name,
                   p2.name as p2_name, '' as p2_country, p2.country as p2_country_name,
                   w.name as winner_name
            FROM matches m
            LEFT JOIN players p1 ON m.player1_id = p1.id
            LEFT JOIN players p2 ON m.player2_id = p2.id
            LEFT JOIN players w ON m.winner_id = w.id
        '''

    if round_filter:
        rows = db.execute(
            base_query + ' WHERE m.tournament_id = ? AND m.round = ? ORDER BY m.match_order',
            (tid, round_filter)
        ).fetchall()
    else:
        rows = db.execute(
            base_query + ' WHERE m.tournament_id = ? ORDER BY m.match_order',
            (tid,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/matches', methods=['POST'])
def api_create_match():
    data = request.json
    db = get_db()
    db.execute('''INSERT INTO matches (tournament_id, round, match_order, player1_id, player2_id,
                  winner_id, score, court, status,
                  guess_team_a, guess_team_b, guess_a_tb, guess_b_tb, guess_a_total, guess_b_total)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
               (data['tournament_id'], data['round'], data.get('match_order', 0),
                data.get('player1_id'), data.get('player2_id'), data.get('winner_id'),
                data.get('score', ''), data.get('court', ''), data.get('status', 'scheduled'),
                data.get('guess_team_a', ''), data.get('guess_team_b', ''),
                data.get('guess_a_tb', ''), data.get('guess_b_tb', ''),
                data.get('guess_a_total', 0), data.get('guess_b_total', 0)))
    db.commit()
    return jsonify({'id': db.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201

def _advance_winner_by_idx(db, winner_id, current_idx, all_next_matches):
    """
    将胜者晋级到下一轮对应比赛。
    current_idx: 当前比赛在当前轮次中的 1-indexed 位置。
    all_next_matches: 下一轮所有比赛按 match_order 排序的列表。
    奇数位置(1,3,5...)→player1，偶数位置(2,4,6...)→player2。
    """
    if not all_next_matches or winner_id is None:
        return
    next_idx = (current_idx - 1) // 2  # 0-indexed
    if next_idx < len(all_next_matches):
        nxt = all_next_matches[next_idx]
        slot = 'player1_id' if (current_idx % 2 == 1) else 'player2_id'
        db.execute(
            f'UPDATE matches SET {slot}=? WHERE id=?',
            (winner_id, nxt['id'])
        )
        # 如果双方都就位，状态改为 scheduled
        refreshed = db.execute(
            'SELECT player1_id, player2_id FROM matches WHERE id=?', (nxt['id'],)
        ).fetchone()
        if refreshed and refreshed['player1_id'] and refreshed['player2_id']:
            db.execute('UPDATE matches SET status=? WHERE id=?', ('scheduled', nxt['id']))


def _auto_advance_byes(db, tid, round_order, start_round_idx=None):
    """
    自动处理 Bye（轮空）晋级：对于指定轮次（或所有轮次）中
    status='bye' 且只有一个有效球员的比赛，该球员直接晋级到下一轮。
    位置基于当前轮次所有比赛（含非Bye）的 match_order 排序计算。
    """
    if start_round_idx is None:
        start_round_idx = 0
    for r_idx in range(start_round_idx, len(round_order) - 1):
        cur_round = round_order[r_idx]
        next_round = round_order[r_idx + 1]

        # 获取当前轮次所有比赛（用于确定位置索引）
        all_cur_matches = db.execute(
            'SELECT * FROM matches WHERE tournament_id=? AND round=? ORDER BY match_order',
            (tid, cur_round)
        ).fetchall()

        # 构建位置索引映射：match_id → 在轮次中的 1-indexed 位置
        pos_map = {}
        for ci, cm in enumerate(all_cur_matches):
            pos_map[cm['id']] = ci + 1

        next_matches = db.execute(
            'SELECT * FROM matches WHERE tournament_id=? AND round=? ORDER BY match_order',
            (tid, next_round)
        ).fetchall()

        if not next_matches:
            continue

        for m in all_cur_matches:
            if m['status'] != 'bye':
                continue
            # 已处理过的 Bye（winner_id 已设置）跳过，避免重复晋级
            if m['winner_id']:
                continue
            p1, p2 = m['player1_id'], m['player2_id']
            # Bye 场景：一个有效球员 + 一个空位
            if p1 and not p2:
                bye_winner = p1
            elif p2 and not p1:
                bye_winner = p2
            else:
                continue

            cur_idx = pos_map.get(m['id'])
            if cur_idx is None:
                continue

            # 设置胜者但保持 bye 状态（不计入比赛）
            db.execute(
                'UPDATE matches SET winner_id=? WHERE id=?',
                (bye_winner, m['id'])
            )
            # 晋级到下一轮
            _advance_winner_by_idx(db, bye_winner, cur_idx, next_matches)


@app.route('/api/matches/<int:mid>', methods=['PUT'])
def api_update_match(mid):
    data = request.json
    db = get_db()

    # 先获取当前比赛信息
    match = db.execute('SELECT * FROM matches WHERE id=?', (mid,)).fetchone()
    if not match:
        return jsonify({'error': 'Match not found'}), 404

    fields = []
    values = []
    for k in ['player1_id', 'player2_id', 'winner_id', 'score', 'court', 'status', 'round', 'match_order',
              'guess_team_a', 'guess_team_b', 'guess_a_tb', 'guess_b_tb', 'guess_a_total', 'guess_b_total',
              'guess_a_tb_score', 'guess_b_tb_score', 'guess_winner', 'guess_reason']:
        if k in data:
            fields.append(f'{k}=?')
            values.append(data[k])
    if fields:
        values.append(mid)
        db.execute(f'UPDATE matches SET {",".join(fields)} WHERE id=?', values)

    # 胜者自动晋级到下一轮
    new_status = data.get('status', match['status'])
    new_winner = data.get('winner_id', match['winner_id'])

    # 如果状态改为已完成但未指定胜者，拒绝
    if new_status == 'completed' and not new_winner:
        return jsonify({'error': '请选择胜者后再标记为已完成'}), 400

    if new_status == 'completed' and new_winner:
        tid = match['tournament_id']
        round_order = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F']
        current_round = match['round']

        if current_round in round_order:
            r_idx = round_order.index(current_round)
            if r_idx < len(round_order) - 1:
                next_round = round_order[r_idx + 1]

                # 获取当前轮次所有比赛（按 match_order 排序）以确定相对位置
                cur_matches = db.execute(
                    'SELECT * FROM matches WHERE tournament_id=? AND round=? ORDER BY match_order',
                    (tid, current_round)
                ).fetchall()
                # 获取下一轮所有比赛（按 match_order 排序）
                next_matches = db.execute(
                    'SELECT * FROM matches WHERE tournament_id=? AND round=? ORDER BY match_order',
                    (tid, next_round)
                ).fetchall()

                # 计算当前比赛在轮次内的 1-indexed 位置
                cur_idx = None
                for ci, cm in enumerate(cur_matches):
                    if cm['id'] == mid:
                        cur_idx = ci + 1
                        break
                if cur_idx is not None:
                    _advance_winner_by_idx(db, new_winner, cur_idx, next_matches)

    db.commit()
    return jsonify({'success': True})

@app.route('/api/matches/<int:mid>', methods=['DELETE'])
def api_delete_match(mid):
    db = get_db()
    db.execute('DELETE FROM matches WHERE id=?', (mid,))
    db.commit()
    return jsonify({'success': True})

# 自动生成签表
@app.route('/api/tournaments/<int:tid>/generate-draw', methods=['POST'])
def api_generate_draw(tid):
    db = get_db()
    tournament = db.execute('SELECT * FROM tournaments WHERE id=?', (tid,)).fetchone()
    if not tournament:
        return jsonify({'error': 'Tournament not found'}), 404

    draw_size = tournament['draw_size']
    
    # 获取参赛球员（按种子排序，种子在前）
    players = db.execute('''
        SELECT p.*, tp.seed as t_seed, tp.entry_type FROM tournament_players tp
        JOIN players p ON tp.player_id = p.id
        WHERE tp.tournament_id = ?
        ORDER BY tp.seed ASC, p.ranking ASC
    ''', (tid,)).fetchall()
    player_list = [dict(p) for p in players]

    if len(player_list) < 2:
        return jsonify({'error': 'Need at least 2 players'}), 400

    # 生成签表时创建球员信息快照，冻结当前球员数据
    db.execute('DELETE FROM tournament_player_snapshots WHERE tournament_id=?', (tid,))
    for p in player_list:
        db.execute('''INSERT INTO tournament_player_snapshots
                      (tournament_id, player_id, name, country, country_code, ranking, seed, entry_type)
                      VALUES (?,?,?,?,?,?,?,?)''',
                   (tid, p['id'], p['name'], p.get('country', ''), p.get('country_code', ''),
                    p.get('ranking', 999), p.get('t_seed', 0), p.get('entry_type', 'main')))

    # 删除旧比赛
    db.execute('DELETE FROM matches WHERE tournament_id=?', (tid,))

    total_slots = get_total_slots(draw_size)
    num_seeds = get_num_seeds(draw_size)
    rounds = get_rounds(draw_size)
    match_order = 0
    created_matches = []

    if draw_size == 96:
        # ─── 96签 ───
        # 96签 = 128槽位，32种子 + 64非种子
        # 种子按128签32种子位置表分布，对手全部是Bye
        # 非种子成对填入不含种子的槽位配对
        
        num_seeds = get_num_seeds(128)  # 32 seeds using 128-draw table
        seed_positions = generate_draw_positions(128, num_seeds)
        
        # 初始化128槽位
        filled = [None] * 128
        
        # 放置种子（按128签种子位置表）
        seeded_players = [p for p in player_list if p.get('t_seed', 0) > 0]
        seeded_players.sort(key=lambda p: p['t_seed'])
        for p in seeded_players:
            seed_num = p['t_seed']
            if seed_num in seed_positions:
                pos = seed_positions[seed_num] - 1  # 0-indexed
                filled[pos] = p['id']
        
        # 收集非种子并随机排列
        non_seeded = [p for p in player_list if p.get('t_seed', 0) == 0]
        random.shuffle(non_seeded)
        
        # 成对填入非种子到不含种子的配对中
        ns_idx = 0
        for i in range(0, 128, 2):
            has_seed = False
            for j in [i, i+1]:
                if filled[j]:
                    pp = next((pl for pl in player_list if pl['id'] == filled[j]), None)
                    if pp and pp.get('t_seed', 0) > 0:
                        has_seed = True
            if not has_seed and ns_idx + 1 < len(non_seeded):
                filled[i] = non_seeded[ns_idx]['id']
                filled[i + 1] = non_seeded[ns_idx + 1]['id']
                ns_idx += 2
        
        # 记录R128中种子轮空的信息
        # R128 配对 i (槽位 2i, 2i+1) → R64 第 i//2 场
        seed_bye_winners = {}
        
        # 创建R128比赛（64场）
        first_round = rounds[0]
        
        for i in range(64):
            p1 = filled[i * 2]
            p2 = filled[i * 2 + 1]
            
            # 双方都空 → 跳过（96签正确填充时不会出现）
            if p1 is None and p2 is None:
                continue
            
            match_order += 1
            r64_idx = i // 2
            
            # 检查是否有种子（种子轮空）
            has_seed = False
            seed_pid = None
            for pid in [p1, p2]:
                if pid:
                    pp = next((pl for pl in player_list if pl['id'] == pid), None)
                    if pp and pp.get('t_seed', 0) > 0:
                        has_seed = True
                        seed_pid = pid
            
            status = 'bye' if has_seed else ('scheduled' if p1 and p2 else 'bye')
            winner_id = seed_pid if has_seed else None
            
            # 种子自动晋级到对应的R64比赛
            if has_seed and seed_pid:
                is_player1 = (p1 == seed_pid)
                if r64_idx not in seed_bye_winners:
                    seed_bye_winners[r64_idx] = {}
                if is_player1:
                    seed_bye_winners[r64_idx]['player1'] = seed_pid
                else:
                    seed_bye_winners[r64_idx]['player2'] = seed_pid
            
            db.execute('''INSERT INTO matches (tournament_id, round, match_order, player1_id, player2_id, winner_id, status)
                          VALUES (?,?,?,?,?,?,?)''',
                       (tid, first_round, match_order, p1, p2, winner_id, status))
            created_matches.append({
                'round': first_round,
                'match_order': match_order,
                'player1_id': p1,
                'player2_id': p2
            })
        
        # 创建后续轮次，R64自动填入晋级种子
        for r_idx in range(1, len(rounds)):
            round_name = rounds[r_idx]
            num_matches = 128 // (2 ** (r_idx + 1))
            for i in range(num_matches):
                match_order += 1
                if round_name == 'R64' and i in seed_bye_winners:
                    sw = seed_bye_winners[i]
                    p1_id = sw.get('player1')
                    p2_id = sw.get('player2')
                    db.execute('''INSERT INTO matches (tournament_id, round, match_order, player1_id, player2_id, status)
                                  VALUES (?,?,?,?,?,?)''',
                               (tid, round_name, match_order, p1_id, p2_id, 'scheduled'))
                else:
                    db.execute('''INSERT INTO matches (tournament_id, round, match_order, status)
                                  VALUES (?,?,?,?)''',
                               (tid, round_name, match_order, 'pending'))
                created_matches.append({
                    'round': round_name,
                    'match_order': match_order,
                    'player1_id': seed_bye_winners.get(i, {}).get('player1'),
                    'player2_id': seed_bye_winners.get(i, {}).get('player2')
                })
    else:
        # ─── 非96签（32/64/128签）原有逻辑 ───
        # 按WTA规则填充签表
        filled = fill_draw_positions(player_list, total_slots, draw_size)

        first_round = rounds[0]
        first_round_matches = total_slots // 2

        for i in range(first_round_matches):
            p1 = filled[i * 2]
            p2 = filled[i * 2 + 1]
            match_order += 1
            db.execute('''INSERT INTO matches (tournament_id, round, match_order, player1_id, player2_id, status)
                          VALUES (?,?,?,?,?,?)''',
                       (tid, first_round, match_order, p1, p2, 'scheduled' if p1 and p2 else 'bye'))
            created_matches.append({
                'round': first_round,
                'match_order': match_order,
                'player1_id': p1,
                'player2_id': p2
            })

        # 创建后续轮次占位
        for r_idx in range(1, len(rounds)):
            round_name = rounds[r_idx]
            num_matches = total_slots // (2 ** (r_idx + 1))
            for i in range(num_matches):
                match_order += 1
                db.execute('''INSERT INTO matches (tournament_id, round, match_order, status)
                              VALUES (?,?,?,?)''',
                           (tid, round_name, match_order, 'pending'))
                created_matches.append({
                    'round': round_name,
                    'match_order': match_order,
                    'player1_id': None,
                    'player2_id': None
                })

    db.commit()

    # 签表生成后，自动处理 Bye 晋级（96签已在生成时处理，跳过）
    round_order = get_rounds(draw_size)
    if draw_size != 96:
        _auto_advance_byes(db, tid, round_order)
        db.commit()

    return jsonify({'success': True, 'matches_created': len(created_matches)})

# 手动触发 Bye 晋级（用于修复历史数据）
@app.route('/api/tournaments/<int:tid>/advance-byes', methods=['POST'])
def api_advance_byes(tid):
    db = get_db()
    tournament = db.execute('SELECT * FROM tournaments WHERE id=?', (tid,)).fetchone()
    if not tournament:
        return jsonify({'error': 'Tournament not found'}), 404
    draw_size = tournament['draw_size']
    round_order = get_rounds(draw_size)

    # 修复历史数据：将已标记为 completed 但无比分且只有一方球员的比赛恢复为 bye 状态
    completed_byes = db.execute(
        """SELECT * FROM matches WHERE tournament_id=? AND status='completed'
           AND (score='' OR score IS NULL) AND (
               (player1_id IS NOT NULL AND player2_id IS NULL) OR
               (player1_id IS NULL AND player2_id IS NOT NULL)
           )""",
        (tid,)
    ).fetchall()
    for m in completed_byes:
        db.execute('UPDATE matches SET status=? WHERE id=?', ('bye', m['id']))

    _auto_advance_byes(db, tid, round_order)
    db.commit()
    # 统计处理数量（bye 状态且已设置胜者）
    advanced = db.execute(
        "SELECT COUNT(*) FROM matches WHERE tournament_id=? AND status='bye' AND winner_id IS NOT NULL",
        (tid,)
    ).fetchone()[0]
    return jsonify({'success': True, 'bye_advances': advanced})

def get_rounds(draw_size):
    if draw_size <= 16:
        return ['R16', 'QF', 'SF', 'F']
    elif draw_size <= 32:
        return ['R32', 'R16', 'QF', 'SF', 'F']
    elif draw_size <= 64:
        return ['R64', 'R32', 'R16', 'QF', 'SF', 'F']
    elif draw_size <= 96:
        # 96签：首轮64人打R128（32人轮空），相当于128的槽位
        return ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F']
    else:
        return ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F']

def get_total_slots(draw_size):
    # 返回向上取整的2的幂
    # 96签使用128的槽位（32个轮空）
    n = 1
    while n < draw_size:
        n *= 2
    return n

def get_num_seeds(draw_size):
    """根据签位大小确定种子数量（遵循WTA规则）"""
    if draw_size >= 128:
        return 32
    elif draw_size >= 96:
        return 32
    elif draw_size >= 64:
        return 16
    elif draw_size >= 32:
        return 8
    else:
        return 4

# ── 官方 Grand Slam Rule Book 种子位置表 ──
# 来源: 2026 Official Grand Slam Rule Book, Section vi "Procedure for Placing Seeds"
# 
# 规则:
#   1. Seed 1 固定在 Line 1, Seed 2 固定在 Line N
#   2. Seeds 3-4:   随机抽签分配两个固定位置
#   3. Seeds 5-8:   四人一组随机分配到四个固定位置
#   4. Seeds 9-12:  四人一组随机分配到四个固定位置
#   5. Seeds 13-16: 四人一组随机分配到四个固定位置
#   6. Seeds 17-24: 八人一组随机分配到八个固定位置
#   7. Seeds 25-32: 八人一组随机分配到八个固定位置
#   8. 非种子选手按抽签顺序从上到下填入剩余空位

# 各签位的种子位置（1-indexed line numbers）
SEED_POSITION_TABLE = {
    # draw_size -> { seed_group: [positions] }
    32: {
        (3, 4):   [9, 24],
        (5, 8):   [8, 16, 17, 25],
    },
    64: {
        (3, 4):   [17, 48],
        (5, 8):   [16, 32, 33, 49],
        (9, 12):  [9, 25, 40, 56],
        (13, 16): [8, 24, 41, 57],
    },
    128: {
        (3, 4):   [33, 96],
        (5, 8):   [32, 64, 65, 97],
        (9, 12):  [17, 49, 80, 112],
        (13, 16): [16, 48, 81, 113],
        (17, 24): [9, 24, 41, 56, 73, 88, 105, 120],
        (25, 32): [8, 25, 40, 57, 72, 89, 104, 121],
    },
}

def generate_draw_positions(total_slots, num_seeds):
    """
    按照 Grand Slam Rule Book 官方规则生成种子排布位置（1-indexed）。
    
    规则核心：
    - Seed 1 固定在 Line 1, Seed 2 固定在 Line N
    - 其他种子按组（pairs/groups of four/groups of eight）分配到官方指定的精确行号
    - 每组内的种子随机分配到该组的各个位置
    """
    positions = {}
    
    # Seed 1 固定在顶部
    positions[1] = 1
    # Seed 2 固定在底部
    positions[2] = total_slots
    
    # 查表获取该签位大小的位置表
    table = SEED_POSITION_TABLE.get(total_slots, {})
    
    # 按种子范围排序处理
    for (start_seed, end_seed), group_positions in sorted(table.items()):
        if num_seeds >= end_seed:
            # 复制位置列表并随机打乱，实现组内随机分配
            shuffled_positions = list(group_positions)
            random.shuffle(shuffled_positions)
            for i, seed_num in enumerate(range(start_seed, end_seed + 1)):
                positions[seed_num] = shuffled_positions[i]
        elif num_seeds >= start_seed:
            # 部分种子：只分配需要的数量
            shuffled_positions = list(group_positions)
            random.shuffle(shuffled_positions)
            count = num_seeds - start_seed + 1
            for i in range(count):
                positions[start_seed + i] = shuffled_positions[i]
    
    return positions

def fill_draw_positions(players, total_slots, draw_size):
    """
    按照 Grand Slam Rule Book 官方规则填充签表：
    1. 按种子号放置种子选手到官方指定的精确位置
    2. 非种子选手先随机抽签，然后从上到下填入剩余空位
    3. 空位保持 None（轮空）
    
    players: 按排名升序排列的球员列表
    """
    num_seeds = get_num_seeds(draw_size)
    
    # 将球员分为种子和非种子
    seeded = [p for p in players if p.get('t_seed', 0) > 0]
    seeded.sort(key=lambda p: p['t_seed'])
    
    non_seeded = [p for p in players if p.get('t_seed', 0) == 0]
    random.shuffle(non_seeded)  # 非种子随机抽签
    
    # 生成种子位置
    seed_positions = generate_draw_positions(total_slots, num_seeds)
    
    # 初始化签表
    result = [None] * total_slots  # 0-indexed, 值为player_id或None(轮空)
    
    # 放置种子选手
    for p in seeded:
        seed_num = p['t_seed']
        if seed_num in seed_positions:
            pos = seed_positions[seed_num] - 1  # 转0-indexed
            result[pos] = p['id']
    
    # 非种子从上到下填入剩余空位（按抽签顺序）
    non_seeded_idx = 0
    for i in range(total_slots):
        if result[i] is None and non_seeded_idx < len(non_seeded):
            result[i] = non_seeded[non_seeded_idx]['id']
            non_seeded_idx += 1
    
    # 轮空位置保持None
    
    return result

# ── 每日竞猜 API ──────────────────────────────────────

@app.route('/api/tournaments/<int:tid>/daily-guesses')
def api_get_daily_guesses(tid):
    """获取某赛事所有每日竞猜"""
    db = get_db()
    rows = db.execute(
        'SELECT * FROM daily_guesses WHERE tournament_id=? ORDER BY guess_date DESC, id DESC',
        (tid,)
    ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tournaments/<int:tid>/daily-guesses', methods=['POST'])
@require_admin_auth
def api_create_daily_guess(tid):
    """创建每日竞猜"""
    data = request.json
    db = get_db()
    fields = ['guess_date', 'deadline']
    values = [data.get('guess_date', ''), data.get('deadline', '')]
    for i in range(1, 7):
        fields.append(f'tb{i}_match')
        values.append(data.get(f'tb{i}_match', ''))
        fields.append(f'tb{i}_result')
        values.append(data.get(f'tb{i}_result', ''))
    fields.append('tournament_id')
    values.append(tid)
    placeholders = ','.join(['?'] * len(values))
    db.execute(f'INSERT INTO daily_guesses ({",".join(fields)}) VALUES ({placeholders})', values)
    db.commit()
    return jsonify({'success': True})

@app.route('/api/daily-guesses/<int:gid>', methods=['PUT'])
@require_admin_auth
def api_update_daily_guess(gid):
    """更新每日竞猜"""
    data = request.json
    db = get_db()
    guess = db.execute('SELECT * FROM daily_guesses WHERE id=?', (gid,)).fetchone()
    if not guess:
        return jsonify({'error': 'Not found'}), 404
    fields = []
    values = []
    if 'guess_date' in data:
        fields.append('guess_date=?')
        values.append(data['guess_date'])
    if 'deadline' in data:
        fields.append('deadline=?')
        values.append(data['deadline'])
    for i in range(1, 7):
        for k in [f'tb{i}_match', f'tb{i}_result']:
            if k in data:
                fields.append(f'{k}=?')
                values.append(data[k])
    if fields:
        values.append(gid)
        db.execute(f'UPDATE daily_guesses SET {",".join(fields)} WHERE id=?', values)
        db.commit()
    return jsonify({'success': True})

@app.route('/api/daily-guesses/<int:gid>', methods=['DELETE'])
@require_admin_auth
def api_delete_daily_guess(gid):
    """删除每日竞猜"""
    db = get_db()
    db.execute('DELETE FROM daily_guesses WHERE id=?', (gid,))
    db.commit()
    return jsonify({'success': True})

# ── 运行 ───────────────────────────────────────────────

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
