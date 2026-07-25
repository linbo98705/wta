#!/usr/bin/env python3
"""填充演示数据 - 模拟WTA赛事"""

import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), 'data', 'tournament.db')

def seed():
    if os.path.exists(DB):
        os.remove(DB)

    db = sqlite3.connect(DB)
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
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            country TEXT DEFAULT '',
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
            match_date TEXT DEFAULT '',
            match_time TEXT DEFAULT '',
            status TEXT DEFAULT 'scheduled',
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
            FOREIGN KEY (player1_id) REFERENCES players(id),
            FOREIGN KEY (player2_id) REFERENCES players(id),
            FOREIGN KEY (winner_id) REFERENCES players(id)
        );
    ''')

    # 创建赛事
    tournaments = [
        ('China Open', '中国网球公开赛', '北京, 中国', 'Hard', 'WTA 1000', '2024-09-25', '2024-10-06', 32),
        ('Wuhan Open', '武汉网球公开赛', '武汉, 中国', 'Hard', 'WTA 1000', '2024-10-07', '2024-10-13', 32),
        ('Zhengzhou Open', '郑州网球公开赛', '郑州, 中国', 'Hard', 'WTA 500', '2024-10-14', '2024-10-20', 28),
    ]

    for t in tournaments:
        db.execute('''INSERT INTO tournaments (name, name_cn, location, surface, category, start_date, end_date, draw_size)
                      VALUES (?,?,?,?,?,?,?,?)''', t)

    # 创建球员（name现在是中文名）
    players = [
        ('伊加·斯瓦泰克', '波兰', 'POL', 1),
        ('阿丽娜·萨巴伦卡', '白俄罗斯', 'BLR', 2),
        ('可可·高芙', '美国', 'USA', 3),
        ('伊莲娜·莱巴金娜', '哈萨克斯坦', 'KAZ', 4),
        ('杰西卡·佩古拉', '美国', 'USA', 5),
        ('玛可塔·万卓索娃', '捷克', 'CZE', 6),
        ('昂斯·贾巴尔', '突尼斯', 'TUN', 7),
        ('玛丽亚·萨卡里', '希腊', 'GRE', 8),
        ('郑钦文', '中国', 'CHN', 9),
        ('叶莲娜·奥斯塔彭科', '拉脱维亚', 'LAT', 10),
        ('达莉亚·卡萨特金娜', '俄罗斯', 'RUS', 11),
        ('巴博拉·克赖奇科娃', '捷克', 'CZE', 12),
        ('麦迪逊·凯斯', '美国', 'USA', 13),
        ('佩特拉·科维托娃', '捷克', 'CZE', 14),
        ('贝琳达·本西奇', '瑞士', 'SUI', 15),
        ('柳德米拉·萨姆索诺娃', '俄罗斯', 'RUS', 16),
        ('维罗妮卡·库德梅托娃', '俄罗斯', 'RUS', 17),
        ('卡罗琳娜·穆霍娃', '捷克', 'CZE', 18),
        ('比阿特丽斯·哈达德·玛雅', '巴西', 'BRA', 19),
        ('叶卡捷琳娜·亚历山德罗娃', '俄罗斯', 'RUS', 20),
        ('多娜·维基奇', '克罗地亚', 'CRO', 21),
        ('维多利亚·阿扎伦卡', '白俄罗斯', 'BLR', 22),
        ('玛格达·里内特', '波兰', 'POL', 23),
        ('伊莉娜·斯维托丽娜', '乌克兰', 'UKR', 24),
        ('安娜斯塔西娅·波塔波娃', '俄罗斯', 'RUS', 25),
        ('斯隆·斯蒂芬斯', '美国', 'USA', 26),
        ('安赫利娜·卡利尼娜', '乌克兰', 'UKR', 27),
        ('王欣瑜', '中国', 'CHN', 28),
        ('朱琳', '中国', 'CHN', 32),
        ('王曦雨', '中国', 'CHN', 38),
        ('袁悦', '中国', 'CHN', 42),
        ('白卓璇', '中国', 'CHN', 55),
    ]

    for p in players:
        db.execute('INSERT INTO players (name, country, ranking) VALUES (?,?,?)', (p[0], p[1], p[3]))

    # 为第一个赛事添加参赛球员
    seeds = [
        (1, 1, 1, 'main'), (2, 2, 2, 'main'), (3, 3, 3, 'main'), (4, 4, 4, 'main'),
        (5, 5, 5, 'main'), (6, 6, 6, 'main'), (7, 7, 7, 'main'), (8, 8, 8, 'main'),
    ]

    non_seeds = [
        (1, 9, 0, 'main'), (1, 10, 0, 'main'), (1, 11, 0, 'main'), (1, 12, 0, 'main'),
        (1, 13, 0, 'main'), (1, 14, 0, 'main'), (1, 15, 0, 'main'), (1, 16, 0, 'main'),
        (1, 17, 0, 'main'), (1, 18, 0, 'main'), (1, 19, 0, 'main'), (1, 20, 0, 'main'),
        (1, 21, 0, 'main'), (1, 22, 0, 'main'), (1, 23, 0, 'main'), (1, 24, 0, 'main'),
        (1, 25, 0, 'main'), (1, 26, 0, 'main'), (1, 27, 0, 'main'),
        (1, 28, 0, 'wc'), (1, 29, 0, 'wc'), (1, 30, 0, 'wc'), (1, 31, 0, 'wc'), (1, 32, 0, 'q'),
    ]

    for tp in seeds + non_seeds:
        db.execute('INSERT INTO tournament_players (tournament_id, player_id, seed, entry_type) VALUES (?,?,?,?)', tp)

    # R32 matches
    r32 = [
        (1, 32, 1, '6-1 6-2', '2024-09-28', 'completed'),
        (16, 17, 16, '7-5 6-3', '2024-09-28', 'completed'),
        (9, 24, 9, '6-3 6-4', '2024-09-28', 'completed'),
        (8, 25, 8, '6-2 7-6', '2024-09-28', 'completed'),
        (5, 28, 5, '6-1 6-0', '2024-09-29', 'completed'),
        (12, 21, 21, '4-6 6-3 6-4', '2024-09-29', 'completed'),
        (13, 20, 13, '7-5 6-2', '2024-09-29', 'completed'),
        (4, 29, 4, '6-0 6-1', '2024-09-29', 'completed'),
        (3, 30, 3, '6-2 6-1', '2024-09-29', 'completed'),
        (14, 19, 14, '6-4 7-6', '2024-09-29', 'completed'),
        (11, 22, 22, '6-7 6-4 6-3', '2024-09-29', 'completed'),
        (6, 27, 6, '6-3 6-2', '2024-09-29', 'completed'),
        (7, 26, 7, '6-4 6-4', '2024-09-30', 'completed'),
        (10, 23, 10, '6-3 7-5', '2024-09-30', 'completed'),
        (15, 18, 18, '6-7 6-3 6-4', '2024-09-30', 'completed'),
        (2, 31, 2, '6-1 6-2', '2024-09-30', 'completed'),
    ]
    for i, (p1, p2, winner, score, date, status) in enumerate(r32, 1):
        db.execute('''INSERT INTO matches (tournament_id, round, match_order, player1_id, player2_id, winner_id, score, match_date, status)
                      VALUES (?,?,?,?,?,?,?,?,?)''', (1, 'R32', i, p1, p2, winner, score, date, status))

    # R16
    r16 = [
        (1, 16, 1, '6-3 6-4', '2024-10-01', 'completed'),
        (9, 8, 9, '7-6 6-7 6-4', '2024-10-01', 'completed'),
        (5, 21, 5, '6-4 6-2', '2024-10-01', 'completed'),
        (13, 4, 4, '6-3 7-5', '2024-10-01', 'completed'),
        (3, 14, 3, '6-2 6-1', '2024-10-02', 'completed'),
        (22, 6, 6, '6-4 3-6 6-3', '2024-10-02', 'completed'),
        (7, 10, 7, '6-3 6-4', '2024-10-02', 'completed'),
        (18, 2, 2, '7-5 6-7 6-4', '2024-10-02', 'completed'),
    ]
    for i, (p1, p2, winner, score, date, status) in enumerate(r16, 9):
        db.execute('''INSERT INTO matches (tournament_id, round, match_order, player1_id, player2_id, winner_id, score, match_date, status)
                      VALUES (?,?,?,?,?,?,?,?,?)''', (1, 'R16', i, p1, p2, winner, score, date, status))

    # QF
    qf = [
        (1, 9, 1, '6-4 6-3', '2024-10-03', 'completed'),
        (5, 4, 4, '6-7 6-3 7-6', '2024-10-03', 'completed'),
        (3, 6, 3, '6-2 6-4', '2024-10-04', 'completed'),
        (7, 2, 2, '6-4 7-6', '2024-10-04', 'completed'),
    ]
    for i, (p1, p2, winner, score, date, status) in enumerate(qf, 17):
        db.execute('''INSERT INTO matches (tournament_id, round, match_order, player1_id, player2_id, winner_id, score, match_date, status)
                      VALUES (?,?,?,?,?,?,?,?,?)''', (1, 'QF', i, p1, p2, winner, score, date, status))

    # SF
    sf = [
        (1, 4, 1, '7-5 6-3', '2024-10-05', 'completed'),
        (3, 2, 2, '6-7 6-4 6-3', '2024-10-05', 'completed'),
    ]
    for i, (p1, p2, winner, score, date, status) in enumerate(sf, 21):
        db.execute('''INSERT INTO matches (tournament_id, round, match_order, player1_id, player2_id, winner_id, score, match_date, status)
                      VALUES (?,?,?,?,?,?,?,?,?)''', (1, 'SF', i, p1, p2, winner, score, date, status))

    # Final
    db.execute('''INSERT INTO matches (tournament_id, round, match_order, player1_id, player2_id, status, match_date)
                  VALUES (?,?,?,?,?,?,?)''', (1, 'F', 23, 1, 2, 'scheduled', '2024-10-06'))

    db.commit()
    db.close()
    print("? 演示数据已填充完成！")
    print("   - 3个赛事")
    print("   - 32名球员")
    print("   - 中国网球公开赛已添加完整参赛名单和部分赛果")

if __name__ == '__main__':
    seed()
