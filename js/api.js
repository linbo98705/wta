/**
 * ═══════════════════════════════════════════
 * WTA 赛事模拟网站 - API 层
 * 用 Supabase 查询替代 Flask API
 * 包含完整的签表生成逻辑（移植自 app.py）
 * ═══════════════════════════════════════════
 *
 * 依赖：js/supabase-client.js（提供全局 supabase 客户端）
 */

// ── 签表规则常量 ────────────────────────────

/**
 * 根据签位大小返回向上取整的 2 的幂（总槽位数）
 * @param {number} draw_size - 签位大小（32/64/96/128）
 * @returns {number} 总槽位数
 */
function getTotalSlots(draw_size) {
    let n = 1;
    while (n < draw_size) {
        n *= 2;
    }
    return n;
}

/**
 * 根据签位大小确定种子数量（遵循 WTA 规则）
 * @param {number} draw_size
 * @returns {number}
 */
function getNumSeeds(draw_size) {
    if (draw_size >= 128) return 32;
    if (draw_size >= 96) return 32;
    if (draw_size >= 64) return 16;
    if (draw_size >= 32) return 8;
    return 4;
}

/**
 * 根据签位大小返回轮次名称数组
 * @param {number} draw_size
 * @returns {string[]}
 */
function getRounds(draw_size) {
    if (draw_size <= 16) return ['R16', 'QF', 'SF', 'F'];
    if (draw_size <= 32) return ['R32', 'R16', 'QF', 'SF', 'F'];
    if (draw_size <= 64) return ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
    // 96 签和 128 签：首轮 64 人打 R128（96 签 32 人轮空），相当于 128 的槽位
    return ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
}

// ── 官方 Grand Slam Rule Book 种子位置表 ──
// 来源: 2026 Official Grand Slam Rule Book, Section vi "Procedure for Placing Seeds"
//
// 规则:
//   1. Seed 1 固定在 Line 1, Seed 2 固定在 Line N
//   2. Seeds 3-4:   随机抽签分配两个固定位置
//   3. Seeds 5-8:   四人一组随机分配到四个固定位置
//   4. Seeds 9-12:  四人一组随机分配到四个固定位置
//   5. Seeds 13-16: 四人一组随机分配到四个固定位置
//   6. Seeds 17-24: 八人一组随机分配到八个固定位置
//   7. Seeds 25-32: 八人一组随机分配到八个固定位置
//   8. 非种子选手按抽签顺序从上到下填入剩余空位

const SEED_POSITION_TABLE = {
    // total_slots -> { seed_group_key: [positions (1-indexed)] }
    32: {
        '3-4':   [9, 24],
        '5-8':   [8, 16, 17, 25],
    },
    64: {
        '3-4':   [17, 48],
        '5-8':   [16, 32, 33, 49],
        '9-12':  [9, 25, 40, 56],
        '13-16': [8, 24, 41, 57],
    },
    128: {
        '3-4':   [33, 96],
        '5-8':   [32, 64, 65, 97],
        '9-12':  [17, 49, 80, 112],
        '13-16': [16, 48, 81, 113],
        '17-24': [9, 24, 41, 56, 73, 88, 105, 120],
        '25-32': [8, 25, 40, 57, 72, 89, 104, 121],
    },
};

/**
 * Fisher-Yates 洗牌算法
 * @param {Array} arr - 原地打乱的数组
 * @returns {Array}
 */
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * 按照 Grand Slam Rule Book 官方规则生成种子排布位置（1-indexed）
 *
 * 规则核心：
 * - Seed 1 固定在 Line 1, Seed 2 固定在 Line N
 * - 其他种子按组（pairs/groups of four/groups of eight）分配到官方指定的精确行号
 * - 每组内的种子随机分配到该组的各个位置
 *
 * @param {number} totalSlots - 总槽位数（32/64/128）
 * @param {number} numSeeds - 种子数量
 * @returns {Object} { seed_number: position (1-indexed) }
 */
function generateDrawPositions(totalSlots, numSeeds) {
    const positions = {};

    // Seed 1 固定在顶部
    positions[1] = 1;
    // Seed 2 固定在底部
    positions[2] = totalSlots;

    // 查表获取该签位大小的位置表
    const table = SEED_POSITION_TABLE[totalSlots] || {};

    // 将组键解析并排序
    const groupKeys = Object.keys(table).sort((a, b) => {
        const aStart = parseInt(a.split('-')[0]);
        const bStart = parseInt(b.split('-')[0]);
        return aStart - bStart;
    });

    for (const key of groupKeys) {
        const [startStr, endStr] = key.split('-');
        const startSeed = parseInt(startStr);
        const endSeed = parseInt(endStr);
        const groupPositions = table[key];

        if (numSeeds >= endSeed) {
            // 完整的种子组：随机分配
            const shuffled = shuffleArray([...groupPositions]);
            for (let i = 0; i < endSeed - startSeed + 1; i++) {
                positions[startSeed + i] = shuffled[i];
            }
        } else if (numSeeds >= startSeed) {
            // 部分种子组：只分配需要的数量
            const shuffled = shuffleArray([...groupPositions]);
            const count = numSeeds - startSeed + 1;
            for (let i = 0; i < count; i++) {
                positions[startSeed + i] = shuffled[i];
            }
        }
    }

    return positions;
}

/**
 * 按照 Grand Slam Rule Book 官方规则填充签表
 * 1. 按种子号放置种子选手到官方指定的精确位置
 * 2. 非种子选手先随机抽签，然后从上到下填入剩余空位
 * 3. 空位（Bye）优先分配给高种子选手的对手（遵循 WTA 标准：种子排位越高，优先轮空）
 *
 * @param {Array} players - 按种子和排名排序的球员列表
 *   每个球员需包含 { id, t_seed, ranking }
 * @param {number} totalSlots - 总槽位数
 * @param {number} drawSize - 签位大小
 * @returns {Array} 签表数组（0-indexed），值为 player_id 或 null（轮空）
 */
function fillDrawPositions(players, totalSlots, drawSize) {
    const numSeeds = getNumSeeds(drawSize);

    // 分离种子和非种子
    const seeded = players.filter(p => (p.t_seed || 0) > 0).sort((a, b) => a.t_seed - b.t_seed);
    const nonSeeded = players.filter(p => (p.t_seed || 0) === 0);

    // 非种子随机抽签
    const shuffledNonSeeded = shuffleArray(nonSeeded);

    // 生成种子位置
    const seedPositions = generateDrawPositions(totalSlots, numSeeds);

    // 初始化签表
    const result = new Array(totalSlots).fill(null);

    // 放置种子选手
    for (const p of seeded) {
        const seedNum = p.t_seed;
        if (seedPositions[seedNum] !== undefined) {
            const pos = seedPositions[seedNum] - 1; // 转 0-indexed
            result[pos] = p.id;
        }
    }

    // ── WTA 标准：Bye 优先分配给高种子的对手 ──
    // 计算需要多少个 Bye
    const numByes = totalSlots - players.length;
    if (numByes > 0) {
        // 收集所有配对中，有种子且对手为空的位置（即种子的对手）
        // 按种子号从小到大排序，确保高种子优先轮空
        const seedOpponentSlots = [];
        for (let i = 0; i < totalSlots; i += 2) {
            const slotA = i;
            const slotB = i + 1;
            const aIsSeed = result[slotA] !== null;
            const bIsSeed = result[slotB] !== null;
            // 配对中只有一个种子，且对手为空
            if (aIsSeed && !bIsSeed) {
                const seedPlayer = players.find(p => p.id === result[slotA]);
                seedOpponentSlots.push({ slot: slotB, seed: seedPlayer ? seedPlayer.t_seed : 999 });
            } else if (bIsSeed && !aIsSeed) {
                const seedPlayer = players.find(p => p.id === result[slotB]);
                seedOpponentSlots.push({ slot: slotA, seed: seedPlayer ? seedPlayer.t_seed : 999 });
            }
        }
        // 按种子号从小到大排序（种子1优先，种子2次之...）
        seedOpponentSlots.sort((a, b) => a.seed - b.seed);
        // 标记前 numByes 个位置为 Bye（保留 null，不填入非种子）
        const byeSlots = new Set(seedOpponentSlots.slice(0, numByes).map(s => s.slot));

        // 非种子从上到下填入剩余空位（跳过 Bye 位置）
        let nsIdx = 0;
        for (let i = 0; i < totalSlots; i++) {
            if (result[i] === null && !byeSlots.has(i) && nsIdx < shuffledNonSeeded.length) {
                result[i] = shuffledNonSeeded[nsIdx].id;
                nsIdx++;
            }
        }
    } else {
        // 没有 Bye：非种子从上到下填入剩余空位（按抽签顺序）
        let nsIdx = 0;
        for (let i = 0; i < totalSlots; i++) {
            if (result[i] === null && nsIdx < shuffledNonSeeded.length) {
                result[i] = shuffledNonSeeded[nsIdx].id;
                nsIdx++;
            }
        }
    }

    return result;
}

/**
 * 将胜者晋级到下一轮对应比赛
 * currentIdx: 当前比赛在当前轮次中的 1-indexed 位置
 * allNextMatches: 下一轮所有比赛按 match_order 排序的列表
 * 奇数位置(1,3,5...)→player1，偶数位置(2,4,6...)→player2
 *
 * @param {number} winnerId - 胜者球员 ID
 * @param {number} currentIdx - 当前比赛在轮次中的 1-indexed 位置
 * @param {Array} allNextMatches - 下一轮比赛列表（按 match_order 排序）
 * @returns {Object|null} 需要更新的下一轮比赛 { id, slot, winnerId }，无晋级返回 null
 */
function calcAdvanceToNextRound(winnerId, currentIdx, allNextMatches) {
    if (!allNextMatches || winnerId == null) return null;

    const nextIdx = Math.floor((currentIdx - 1) / 2); // 0-indexed
    if (nextIdx >= allNextMatches.length) return null;

    const nxt = allNextMatches[nextIdx];
    const slot = (currentIdx % 2 === 1) ? 'player1_id' : 'player2_id';
    const partnerSlot = (currentIdx % 2 === 1) ? 'player3_id' : 'player4_id';

    return { id: nxt.id, slot, partnerSlot, winnerId };
}

// ═══════════════════════════════════════════════════════════
// API 函数：赛事 (tournaments)
// ═══════════════════════════════════════════════════════════

/**
 * 获取所有赛事列表（按开始日期降序）
 * @returns {Promise<Array>}
 */
async function getTournaments() {
    const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_date', { ascending: false });

    if (error) {
        console.error('获取赛事列表失败:', error.message);
        return [];
    }
    return data || [];
}

/**
 * 获取单个赛事详情
 * @param {number} id - 赛事 ID
 * @returns {Promise<Object|null>}
 */
async function getTournament(id) {
    const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('获取赛事失败:', error.message);
        return null;
    }
    return data;
}

/**
 * 创建赛事
 * @param {Object} data - 赛事数据
 * @returns {Promise<Object>} { success, id, error }
 */
async function createTournament(data) {
    const { data: row, error } = await supabase
        .from('tournaments')
        .insert({
            name: data.name,
            name_cn: data.name_cn || '',
            location: data.location || '',
            surface: data.surface || 'Hard',
            category: data.category || 'WTA 500',
            start_date: data.start_date,
            end_date: data.end_date,
            draw_size: data.draw_size || 32,
            match_type: data.match_type || 'singles',
            logo_url: data.logo_url || '',
            court_order: data.court_order || '',
        })
        .select('id')
        .single();

    if (error) {
        return { success: false, id: null, error: error.message };
    }
    return { success: true, id: row.id, error: null };
}

/**
 * 上传赛事 Logo 图片到 Supabase Storage
 * @param {File} file - 图片文件
 * @param {number} tournamentId - 赛事 ID（用于生成文件名）
 * @returns {Promise<Object>} { success, url, error }
 */
async function uploadTournamentLogo(file, tournamentId) {
    try {
        // 生成文件名：tournament_{id}_{timestamp}.{ext}
        const ext = file.name.split('.').pop();
        const fileName = `tournament_${tournamentId}_${Date.now()}.${ext}`;

        const { error } = await supabase.storage
            .from('tournament-logos')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) {
            return { success: false, url: null, error: error.message };
        }

        // 获取公开 URL
        const { data: { publicUrl } } = supabase.storage
            .from('tournament-logos')
            .getPublicUrl(fileName);

        return { success: true, url: publicUrl, error: null };
    } catch (err) {
        return { success: false, url: null, error: err.message };
    }
}

/**
 * 更新赛事
 * @param {number} id - 赛事 ID
 * @param {Object} data - 要更新的字段
 * @returns {Promise<Object>} { success, error }
 */
async function updateTournament(id, data) {
    // 过滤有效字段
    const allowed = ['name', 'name_cn', 'location', 'surface', 'category', 'start_date', 'end_date', 'draw_size', 'match_type', 'is_active', 'logo_url', 'court_order'];
    const updates = {};
    for (const k of allowed) {
        if (data[k] !== undefined) {
            updates[k] = data[k];
        }
    }

    if (Object.keys(updates).length === 0) {
        return { success: true, error: null };
    }

    const { error } = await supabase
        .from('tournaments')
        .update(updates)
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true, error: null };
}

/**
 * 删除赛事（级联删除关联数据）
 * @param {number} id - 赛事 ID
 * @returns {Promise<Object>} { success, error }
 */
async function deleteTournament(id) {
    const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true, error: null };
}

// ═══════════════════════════════════════════════════════════
// API 函数：球员 (players)
// ═══════════════════════════════════════════════════════════

/**
 * 获取所有球员列表（按姓名排序）
 * @returns {Promise<Array>}
 */
async function getPlayers() {
    const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('name', { ascending: true });

    if (error) {
        console.error('获取球员列表失败:', error.message);
        return [];
    }
    return data || [];
}

/**
 * 获取单个球员详情
 * @param {number} id - 球员 ID
 * @returns {Promise<Object|null>}
 */
async function getPlayer(id) {
    const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('获取球员失败:', error.message);
        return null;
    }
    return data;
}

/**
 * 创建球员
 * @param {Object} data - 球员数据
 * @returns {Promise<Object>} { success, id, error }
 */
async function createPlayer(data) {
    const { data: row, error } = await supabase
        .from('players')
        .insert({
            name: data.name,
            country: data.country || '',
            country_code: data.country_code || '',
            ranking: data.ranking || 999,
            seed: data.seed || 0,
            photo_url: data.photo_url || '',
            bio: data.bio || '',
        })
        .select('id')
        .single();

    if (error) {
        return { success: false, id: null, error: error.message };
    }
    return { success: true, id: row.id, error: null };
}

/**
 * 更新球员
 * @param {number} id - 球员 ID
 * @param {Object} data - 要更新的字段
 * @returns {Promise<Object>} { success, error }
 */
async function updatePlayer(id, data) {
    const allowed = ['name', 'country', 'country_code', 'ranking', 'seed', 'photo_url', 'bio'];
    const updates = {};
    for (const k of allowed) {
        if (data[k] !== undefined) {
            updates[k] = data[k];
        }
    }

    if (Object.keys(updates).length === 0) {
        return { success: true, error: null };
    }

    const { error } = await supabase
        .from('players')
        .update(updates)
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true, error: null };
}

/**
 * 删除球员（级联清理关联数据）
 * @param {number} id - 球员 ID
 * @returns {Promise<Object>} { success, error }
 */
async function deletePlayer(id) {
    try {
        // 先删除关联数据（如果 RLS 策略不支持级联）
        await supabase.from('tournament_players').delete().eq('player_id', id);
        // 将比赛中引用该球员的字段置空
        await supabase.from('matches')
            .update({ player1_id: null, winner_id: null })
            .eq('player1_id', id);
        await supabase.from('matches')
            .update({ player2_id: null, winner_id: null })
            .eq('player2_id', id);

        const { error } = await supabase
            .from('players')
            .delete()
            .eq('id', id);

        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true, error: null };
    } catch (err) {
        console.error('删除球员异常:', err);
        return { success: false, error: err.message };
    }
}

/**
 * 批量创建球员（跳过重名已存在的球员，更新其排名和国家信息）
 * @param {Array} list - 球员数据列表 [{ name, country, ranking, country_code }]
 * @returns {Promise<Object>} { ids, count, created, updated, error }
 */
async function batchCreatePlayers(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return { ids: [], count: 0, created: 0, updated: 0, error: '需要球员数组' };
    }

    const ids = [];
    let created = 0;
    let updated = 0;

    try {
        const validNames = list.map(p => (p.name || '').trim()).filter(n => n);
        const { data: existingRows } = await supabase
            .from('players')
            .select('id, name')
            .in('name', validNames);

        const existingMap = {};
        (existingRows || []).forEach(r => { existingMap[r.name.toLowerCase()] = r.id; });

        const toUpdate = [];
        const toInsert = [];

        for (const p of list) {
            const name = (p.name || '').trim();
            if (!name) continue;
            const existingId = existingMap[name.toLowerCase()];
            if (existingId) {
                toUpdate.push({
                    id: existingId,
                    country: p.country || '',
                    country_code: p.country_code || '',
                    ranking: p.ranking || 999,
                });
                ids.push(existingId);
                updated++;
            } else {
                toInsert.push({
                    name: name,
                    country: p.country || '',
                    country_code: p.country_code || '',
                    ranking: p.ranking || 999,
                });
            }
        }

        if (toUpdate.length > 0) {
            for (const u of toUpdate) {
                await supabase.from('players').update({ country: u.country, country_code: u.country_code, ranking: u.ranking }).eq('id', u.id);
            }
        }

        if (toInsert.length > 0) {
            const { data: inserted } = await supabase
                .from('players')
                .insert(toInsert)
                .select('id');
            (inserted || []).forEach(r => { ids.push(r.id); created++; });
        }

        return { ids, count: ids.length, created, updated };
    } catch (err) {
        console.error('批量创建球员异常:', err);
        return { ids, count: ids.length, created, updated, error: err.message };
    }
}

/**
 * 批量删除球员
 * @param {Array} idList - 球员 ID 数组
 * @returns {Promise<Object>} { success, count, error }
 */
async function batchDeletePlayers(idList) {
    if (!Array.isArray(idList) || idList.length === 0) {
        return { success: false, count: 0, error: '需要球员ID数组' };
    }
    try {
        // 清理关联数据
        await supabase.from('tournament_players').delete().in('player_id', idList);

        // 清理比赛引用
        for (const pid of idList) {
            await supabase.from('matches')
                .update({ player1_id: null, winner_id: null })
                .eq('player1_id', pid);
            await supabase.from('matches')
                .update({ player2_id: null, winner_id: null })
                .eq('player2_id', pid);
        }

        const { error } = await supabase
            .from('players')
            .delete()
            .in('id', idList);

        if (error) {
            return { success: false, count: idList.length, error: error.message };
        }
        return { success: true, count: idList.length };
    } catch (err) {
        console.error('批量删除球员异常:', err);
        return { success: false, count: idList.length, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════
// API 函数：赛事参赛球员 (tournament_players)
// ═══════════════════════════════════════════════════════════

/**
 * 获取赛事参赛球员（含种子和参赛类型信息，按排名升序）
 * @param {number} tid - 赛事 ID
 * @returns {Promise<Array>} 球员列表，每个包含 { ...playerFields, t_seed, entry_type }
 */
async function getTournamentPlayers(tid) {
    // 签表生成后使用快照数据，避免球员信息修改影响已生成的赛事
    const { count: snapCount, error: snapErr } = await supabase
        .from('tournament_player_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tid);

    if (!snapErr && snapCount > 0) {
        const { data: snapData, error: snapError2 } = await supabase
            .from('tournament_player_snapshots')
            .select('player_id, name, country, country_code, ranking, seed, entry_type')
            .eq('tournament_id', tid)
            .order('ranking', { ascending: true });

        if (!snapError2 && snapData) {
            return snapData.map(row => ({
                id: row.player_id,
                name: row.name,
                country: row.country,
                country_code: row.country_code,
                ranking: row.ranking,
                seed: row.seed,
                t_seed: row.seed,
                entry_type: row.entry_type,
                photo_url: '',
                bio: '',
            }));
        }
    }

    const { data, error } = await supabase
        .from('tournament_players')
        .select('seed, entry_type, player:player_id(id, name, country, country_code, ranking, seed, photo_url, bio)')
        .eq('tournament_id', tid);

    if (error) {
        console.error('获取赛事参赛球员失败:', error.message);
        return [];
    }

    // 展平关联数据，添加 t_seed 别名
    return (data || []).map(row => {
        const player = row.player || {};
        return {
            ...player,
            t_seed: row.seed || 0,
            entry_type: row.entry_type || 'main',
            tp_id: row.id, // tournament_players 表的 ID
        };
    }).sort((a, b) => (a.ranking || 999) - (b.ranking || 999));
}

/**
 * 获取赛事参赛球员（始终读取实时数据，忽略快照）
 * 用于签表生成和冻结快照等需要最新数据的场景
 */
async function getLiveTournamentPlayers(tid) {
    const { data, error } = await supabase
        .from('tournament_players')
        .select('id, seed, entry_type, player:player_id(id, name, country, country_code, ranking, seed, photo_url, bio)')
        .eq('tournament_id', tid);

    if (error) {
        console.error('获取赛事参赛球员失败:', error.message);
        return [];
    }

    return (data || []).map(row => {
        const player = row.player || {};
        return {
            ...player,
            t_seed: row.seed || 0,
            entry_type: row.entry_type || 'main',
            tp_id: row.id,
        };
    }).sort((a, b) => (a.ranking || 999) - (b.ranking || 999));
}

/**
 * 添加参赛球员
 * @param {number} tid - 赛事 ID
 * @param {Object} data - { player_id, seed?, entry_type? }
 * @returns {Promise<Object>} { success, error }
 */
async function addTournamentPlayer(tid, data) {
    const { error } = await supabase
        .from('tournament_players')
        .insert({
            tournament_id: tid,
            player_id: data.player_id,
            seed: data.seed || 0,
            entry_type: data.entry_type || 'main',
        });

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Player already in tournament' };
        }
        return { success: false, error: error.message };
    }
    return { success: true, error: null };
}

/**
 * 移除参赛球员
 * @param {number} tid - 赛事 ID
 * @param {number} pid - 球员 ID
 * @returns {Promise<Object>} { success, error }
 */
async function removeTournamentPlayer(tid, pid) {
    const { error } = await supabase
        .from('tournament_players')
        .delete()
        .eq('tournament_id', tid)
        .eq('player_id', pid);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true, error: null };
}

/**
 * 更新参赛球员信息（种子、参赛类型）
 * @param {number} tid - 赛事 ID
 * @param {number} pid - 球员 ID
 * @param {Object} data - { seed?, entry_type? }
 * @returns {Promise<Object>} { success, error }
 */
async function updateTournamentPlayer(tid, pid, data) {
    const updates = {};
    if (data.seed !== undefined) updates.seed = data.seed;
    if (data.entry_type !== undefined) updates.entry_type = data.entry_type;

    const { error } = await supabase
        .from('tournament_players')
        .update(updates)
        .eq('tournament_id', tid)
        .eq('player_id', pid);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true, error: null };
}

/**
 * 自动重算种子：按排名升序给前 N 名球员分配种子
 * @param {number} tid - 赛事 ID
 * @returns {Promise<Object>} { success, seeded, maxSeeds, error }
 */
async function recalcSeeds(tid) {
    const tournament = await getTournament(tid);
    if (!tournament) {
        return { success: false, seeded: 0, maxSeeds: 0, error: 'Tournament not found' };
    }

    const drawSize = tournament.draw_size;
    const maxSeeds = getNumSeeds(drawSize);

    const { data: tpRows, error: tpError } = await supabase
        .from('tournament_players')
        .select('id, seed, player:player_id(ranking)')
        .eq('tournament_id', tid);

    if (tpError) {
        return { success: false, seeded: 0, maxSeeds, error: tpError.message };
    }

    const sorted = (tpRows || [])
        .map(r => ({
            tp_id: r.id,
            old_seed: r.seed || 0,
            ranking: (r.player && r.player.ranking) || 999,
        }))
        .sort((a, b) => a.ranking - b.ranking);

    const updates = [];
    let seeded = 0;
    for (let i = 0; i < sorted.length; i++) {
        const newSeed = seeded < maxSeeds ? seeded + 1 : 0;
        if (newSeed !== sorted[i].old_seed) {
            updates.push({ id: sorted[i].tp_id, seed: newSeed });
        }
        if (newSeed > 0) seeded++;
    }

    if (updates.length > 0) {
        await Promise.all(
            updates.map(u => supabase.from('tournament_players').update({ seed: u.seed }).eq('id', u.id))
        );
    }

    return { success: true, seeded, maxSeeds, updated: updates.length, error: null };
}

// ═══════════════════════════════════════════════════════════
// API 函数：比赛 (matches)
// ═══════════════════════════════════════════════════════════

/**
 * 获取赛事所有比赛（含球员姓名、国旗等信息）
 * @param {number} tid - 赛事 ID
 * @param {string} [roundFilter] - 可选，过滤特定轮次
 * @returns {Promise<Array>}
 */
async function getMatches(tid, roundFilter) {
    // 签表生成后使用快照数据，避免球员信息修改影响已生成的赛事
    const { count: snapCount, error: snapErr } = await supabase
        .from('tournament_player_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tid);

    const useSnapshot = !snapErr && snapCount > 0;

    let query;
    if (useSnapshot) {
        // 用快照表 JOIN 球员信息
        query = supabase
            .from('matches')
            .select(`*`)
            .eq('tournament_id', tid)
            .order('match_order', { ascending: true });
    } else {
        query = supabase
            .from('matches')
            .select(`
                *,
                player1:player1_id(name, country, country_code),
                player2:player2_id(name, country, country_code),
                player3:player3_id(name, country, country_code),
                player4:player4_id(name, country, country_code),
                winner:winner_id(name)
            `)
            .eq('tournament_id', tid)
            .order('match_order', { ascending: true });
    }

    if (roundFilter) {
        query = query.eq('round', roundFilter);
    }

    const { data, error } = await query;

    if (error) {
        console.error('获取比赛失败:', error.message);
        return [];
    }

    if (useSnapshot) {
        // 获取快照数据，构建 player_id → info 映射
        const { data: snapData } = await supabase
            .from('tournament_player_snapshots')
            .select('player_id, name, country, country_code')
            .eq('tournament_id', tid);
        const snapMap = {};
        (snapData || []).forEach(s => { snapMap[s.player_id] = s; });

        return (data || []).map(m => ({
            ...m,
            p1_name: (snapMap[m.player1_id] && snapMap[m.player1_id].name) || '',
            p1_country: (snapMap[m.player1_id] && snapMap[m.player1_id].country) || '',
            p1_country_code: (snapMap[m.player1_id] && snapMap[m.player1_id].country_code) || '',
            p2_name: (snapMap[m.player2_id] && snapMap[m.player2_id].name) || '',
            p2_country: (snapMap[m.player2_id] && snapMap[m.player2_id].country) || '',
            p2_country_code: (snapMap[m.player2_id] && snapMap[m.player2_id].country_code) || '',
            p3_name: (snapMap[m.player3_id] && snapMap[m.player3_id].name) || '',
            p4_name: (snapMap[m.player4_id] && snapMap[m.player4_id].name) || '',
            winner_name: (snapMap[m.winner_id] && snapMap[m.winner_id].name) || '',
        }));
    }

    // 展平关联数据，保持与旧 API 兼容的字段名
    return (data || []).map(m => ({
        ...m,
        p1_name: (m.player1 && m.player1.name) || '',
        p1_country: (m.player1 && m.player1.country) || '',
        p1_country_code: (m.player1 && m.player1.country_code) || '',
        p2_name: (m.player2 && m.player2.name) || '',
        p2_country: (m.player2 && m.player2.country) || '',
        p2_country_code: (m.player2 && m.player2.country_code) || '',
        p3_name: (m.player3 && m.player3.name) || '',
        p3_country: (m.player3 && m.player3.country) || '',
        p4_name: (m.player4 && m.player4.name) || '',
        p4_country: (m.player4 && m.player4.country) || '',
        winner_name: (m.winner && m.winner.name) || '',
    }));
}

/**
 * 更新比赛（含胜者自动晋级逻辑）
 * @param {number} mid - 比赛 ID
 * @param {Object} data - 要更新的字段
 * @returns {Promise<Object>} { success, error }
 */
async function updateMatch(mid, data) {
    // 先获取当前比赛信息
    const { data: match, error: fetchError } = await supabase
        .from('matches')
        .select('*')
        .eq('id', mid)
        .single();

    if (fetchError || !match) {
        return { success: false, error: 'Match not found' };
    }

    // 过滤有效字段
    const allowed = [
        'player1_id', 'player2_id', 'player3_id', 'player4_id', 'winner_id', 'score', 'court', 'match_date', 'status', 'round', 'match_order',
        'guess_team_a', 'guess_team_b', 'guess_a_tb', 'guess_b_tb',
        'guess_a_total', 'guess_b_total',
        'guess_a_tb_score', 'guess_b_tb_score', 'guess_winner', 'guess_reason',
        'guess_a2_tb', 'guess_b2_tb',
    ];
    const updates = {};
    for (const k of allowed) {
        if (data[k] !== undefined) {
            updates[k] = data[k];
        }
    }

    if (Object.keys(updates).length > 0) {
        const { error } = await supabase
            .from('matches')
            .update(updates)
            .eq('id', mid);

        if (error) {
            // 如果 match_date 列不存在，去掉该字段后重试
            if (error.message && error.message.includes('match_date') && updates.match_date !== undefined) {
                delete updates.match_date;
                const { error: retryError } = await supabase
                    .from('matches')
                    .update(updates)
                    .eq('id', mid);
                if (retryError) {
                    return { success: false, error: retryError.message };
                }
            } else {
                return { success: false, error: error.message };
            }
        }
    }

    // 胜者自动晋级到下一轮
    const newStatus = data.status !== undefined ? data.status : match.status;
    const newWinner = data.winner_id !== undefined ? data.winner_id : match.winner_id;

    if (newStatus === 'completed' && !newWinner) {
        return { success: false, error: '请选择胜者后再标记为已完成' };
    }

    if (newStatus === 'completed' && newWinner) {
        const tid = match.tournament_id;
        const currentRound = match.round;
        const roundOrder = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];

        if (roundOrder.includes(currentRound)) {
            const rIdx = roundOrder.indexOf(currentRound);
            if (rIdx < roundOrder.length - 1) {
                const nextRound = roundOrder[rIdx + 1];

                // 获取当前轮次所有比赛（按 match_order 排序）
                const { data: curMatches } = await supabase
                    .from('matches')
                    .select('*')
                    .eq('tournament_id', tid)
                    .eq('round', currentRound)
                    .order('match_order', { ascending: true });

                // 获取下一轮所有比赛（按 match_order 排序）
                const { data: nextMatches } = await supabase
                    .from('matches')
                    .select('*')
                    .eq('tournament_id', tid)
                    .eq('round', nextRound)
                    .order('match_order', { ascending: true });

                // 计算当前比赛在轮次内的 1-indexed 位置
                let curIdx = null;
                for (let ci = 0; ci < curMatches.length; ci++) {
                    if (curMatches[ci].id === mid) {
                        curIdx = ci + 1;
                        break;
                    }
                }

                if (curIdx !== null && nextMatches) {
                    const advance = calcAdvanceToNextRound(newWinner, curIdx, nextMatches);
                    if (advance) {
                        const updateData = { [advance.slot]: advance.winnerId };
                        // 双打：同时晋级伙伴（player3_id 或 player4_id）
                        if (newWinner === match.player1_id && match.player3_id) {
                            updateData[advance.partnerSlot] = match.player3_id;
                        } else if (newWinner === match.player2_id && match.player4_id) {
                            updateData[advance.partnerSlot] = match.player4_id;
                        }
                        await supabase
                            .from('matches')
                            .update(updateData)
                            .eq('id', advance.id);

                        // 如果双方都就位，状态改为 scheduled
                        const { data: refreshed } = await supabase
                            .from('matches')
                            .select('player1_id, player2_id')
                            .eq('id', advance.id)
                            .single();

                        if (refreshed && refreshed.player1_id && refreshed.player2_id) {
                            await supabase
                                .from('matches')
                                .update({ status: 'scheduled' })
                                .eq('id', advance.id);
                        }
                    }
                }
            }
        }
    }

    return { success: true, error: null };
}

/**
 * 撤销比赛结果（回退已完成的比赛）
 * 1. 将比赛状态改回 scheduled，清除 winner_id
 * 2. 清除下一轮对应位置的晋级球员
 * 3. 如下一轮双方都清空了，状态改回 pending
 * @param {number} mid - 比赛 ID
 * @returns {Promise<Object>} { success, error }
 */
async function revertMatchResult(mid) {
    // 获取当前比赛信息
    const { data: match, error: fetchError } = await supabase
        .from('matches')
        .select('*')
        .eq('id', mid)
        .single();

    if (fetchError || !match) {
        return { success: false, error: '比赛未找到' };
    }

    const tid = match.tournament_id;
    const currentRound = match.round;
    const roundOrder = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];

    try {
        // 1. 回退当前比赛状态
        await supabase
            .from('matches')
            .update({ status: 'scheduled', winner_id: null })
            .eq('id', mid);

        // 2. 清除下一轮的晋级球员
        if (roundOrder.includes(currentRound)) {
            const rIdx = roundOrder.indexOf(currentRound);
            if (rIdx < roundOrder.length - 1) {
                const nextRound = roundOrder[rIdx + 1];

                // 获取当前轮次所有比赛
                const { data: curMatches } = await supabase
                    .from('matches')
                    .select('*')
                    .eq('tournament_id', tid)
                    .eq('round', currentRound)
                    .order('match_order', { ascending: true });

                // 获取下一轮所有比赛
                const { data: nextMatches } = await supabase
                    .from('matches')
                    .select('*')
                    .eq('tournament_id', tid)
                    .eq('round', nextRound)
                    .order('match_order', { ascending: true });

                if (curMatches && nextMatches) {
                    // 找到当前比赛在轮次中的位置
                    let curIdx = null;
                    for (let ci = 0; ci < curMatches.length; ci++) {
                        if (curMatches[ci].id === mid) {
                            curIdx = ci + 1; // 1-indexed
                            break;
                        }
                    }

                    if (curIdx !== null) {
                        const nextIdx = Math.floor((curIdx - 1) / 2); // 0-indexed
                        if (nextIdx < nextMatches.length) {
                            const nxt = nextMatches[nextIdx];
                            const slot = (curIdx % 2 === 1) ? 'player1_id' : 'player2_id';
                            const partnerSlot = (curIdx % 2 === 1) ? 'player3_id' : 'player4_id';

                            // 清除对应位置的球员及双打伙伴
                            const updateData = { [slot]: null, [partnerSlot]: null };

                            // 检查清除后双方是否都空了，如果都空了则状态改回 pending
                            const remainingP1 = slot === 'player1_id' ? null : nxt.player1_id;
                            const remainingP2 = slot === 'player2_id' ? null : nxt.player2_id;
                            if (!remainingP1 && !remainingP2) {
                                updateData.status = 'pending';
                            }

                            await supabase
                                .from('matches')
                                .update(updateData)
                                .eq('id', nxt.id);
                        }
                    }
                }
            }
        }

        return { success: true, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * 创建单场比赛
 * @param {Object} data - 比赛数据
 * @returns {Promise<Object>} { success, id, error }
 */
async function createMatch(data) {
    const insertData = {
            tournament_id: data.tournament_id,
            round: data.round,
            match_order: data.match_order || 0,
            player1_id: data.player1_id || null,
            player2_id: data.player2_id || null,
            player3_id: data.player3_id || null,
            player4_id: data.player4_id || null,
            winner_id: data.winner_id || null,
            score: data.score || '',
            court: data.court || '',
            match_date: data.match_date || '',
            status: data.status || 'scheduled',
            guess_team_a: data.guess_team_a || '',
            guess_team_b: data.guess_team_b || '',
            guess_a_tb: data.guess_a_tb || '',
            guess_b_tb: data.guess_b_tb || '',
            guess_a2_tb: data.guess_a2_tb || '',
            guess_b2_tb: data.guess_b2_tb || '',
            guess_a_total: data.guess_a_total || 0,
            guess_b_total: data.guess_b_total || 0,
            guess_a_tb_score: data.guess_a_tb_score || '',
            guess_b_tb_score: data.guess_b_tb_score || '',
            guess_winner: data.guess_winner || '',
            guess_reason: data.guess_reason || '',
        };

    let { data: row, error } = await supabase
        .from('matches')
        .insert(insertData)
        .select('id')
        .single();

    // 如果 match_date 列不存在，去掉该字段后重试
    if (error && error.message && error.message.includes('match_date')) {
        delete insertData.match_date;
        const retry = await supabase
            .from('matches')
            .insert(insertData)
            .select('id')
            .single();
        row = retry.data;
        error = retry.error;
    }

    if (error) {
        return { success: false, id: null, error: error.message };
    }
    return { success: true, id: row.id, error: null };
}

// ═══════════════════════════════════════════════════════════
// API 函数：每日竞猜 (daily_guesses)
// ═══════════════════════════════════════════════════════════

/**
 * 获取赛事的所有每日竞猜
 * @param {number} tid - 赛事 ID
 * @returns {Promise<Array>}
 */
async function getDailyGuesses(tid) {
    const { data, error } = await supabase
        .from('daily_guesses')
        .select('*')
        .eq('tournament_id', tid)
        .order('guess_date', { ascending: false });

    if (error) {
        console.error('获取每日竞猜失败:', error.message);
        return [];
    }
    return data || [];
}

/**
 * 更新每日竞猜
 * @param {number} id - 竞猜 ID
 * @param {Object} data - 要更新的字段
 * @returns {Promise<Object>} { success, error }
 */
async function updateDailyGuess(id, data) {
    const allowed = ['guess_date', 'deadline'];
    for (let i = 1; i <= 6; i++) {
        allowed.push(`tb${i}_match`);
        allowed.push(`tb${i}_result`);
    }

    const updates = {};
    for (const k of allowed) {
        if (data[k] !== undefined) {
            updates[k] = data[k];
        }
    }

    if (Object.keys(updates).length === 0) {
        return { success: true, error: null };
    }

    // ── 方案1：RPC 函数（SECURITY DEFINER，绕过 RLS 和列权限）──
    // 需要在 Supabase Dashboard 执行 migrate-fix-daily-guesses-rls.sql 创建函数
    try {
        const { data: rpcResult, error: rpcError } = await supabase
            .rpc('update_daily_guess', { p_id: id, p_data: updates });

        if (!rpcError && rpcResult) {
            // RPC 成功，验证返回数据
            if (rpcResult.error) {
                return { success: false, error: rpcResult.error };
            }
            // 验证所有字段是否正确写入
            let allMatch = true;
            for (const k of Object.keys(updates)) {
                const sentVal = updates[k] || '';
                const gotVal = (rpcResult[k] !== null && rpcResult[k] !== undefined) ? rpcResult[k] : '';
                if (sentVal !== gotVal) {
                    console.warn(`RPC: 字段 ${k} 不匹配: 发送="${sentVal}", 返回="${gotVal}"`);
                    allMatch = false;
                    break;
                }
            }
            if (allMatch) {
                return { success: true, error: null };
            }
            // RPC 数据不匹配，继续尝试方案2
        }
    } catch (e) {
        console.warn('RPC 不可用，使用直接 UPDATE:', e.message);
    }

    // ── 方案2：直接 UPDATE + .select() 验证 ──
    let { data: updatedRows, error } = await supabase
        .from('daily_guesses')
        .update(updates)
        .eq('id', id)
        .select();

    // tb6 列不存在的重试
    if (error && error.message && error.message.includes('tb6')) {
        delete updates.tb6_match;
        delete updates.tb6_result;
        const retry = await supabase
            .from('daily_guesses')
            .update(updates)
            .eq('id', id)
            .select();
        updatedRows = retry.data;
        error = retry.error;
    }

    if (error) {
        return { success: false, error: error.message };
    }

    // UPDATE 返回空数组 → RLS 阻止了更新
    if (!updatedRows || updatedRows.length === 0) {
        return { success: false, error: '更新失败：权限不足，请执行 SQL 迁移修复' };
    }

    // 验证所有更新的字段是否真正写入
    // 防止 PostgREST 静默忽略无 UPDATE 权限的列
    const updated = updatedRows[0];
    for (const k of Object.keys(updates)) {
        const sentVal = updates[k] || '';
        const gotVal = (updated[k] !== null && updated[k] !== undefined) ? updated[k] : '';
        if (sentVal !== gotVal) {
            console.warn(`字段 ${k} 更新失败: 发送="${sentVal}", 实际="${gotVal}"`);
            return {
                success: false,
                error: `字段 ${k} 更新失败（列权限缺失）。请在 Supabase Dashboard 执行 migrate-fix-daily-guesses-rls.sql`
            };
        }
    }

    return { success: true, error: null };
}

/**
 * 创建每日竞猜
 * @param {Object} data - 竞猜数据
 * @returns {Promise<Object>} { success, error }
 */
async function createDailyGuess(data) {
    const insertData = {
        tournament_id: data.tournament_id,
        guess_date: data.guess_date || '',
        deadline: data.deadline || '',
    };
    for (let i = 1; i <= 6; i++) {
        insertData[`tb${i}_match`] = data[`tb${i}_match`] || '';
        insertData[`tb${i}_result`] = data[`tb${i}_result`] || '';
    }

    let { error } = await supabase
        .from('daily_guesses')
        .insert(insertData);

    // 如果 tb6 列不存在，去掉 tb6 字段后重试
    if (error && error.message && error.message.includes('tb6')) {
        delete insertData.tb6_match;
        delete insertData.tb6_result;
        const retry = await supabase
            .from('daily_guesses')
            .insert(insertData);
        error = retry.error;
    }

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true, error: null };
}

/**
 * 删除每日竞猜
 * @param {number} id - 竞猜 ID
 * @returns {Promise<Object>} { success, error }
 */
async function deleteDailyGuess(id) {
    const { error } = await supabase
        .from('daily_guesses')
        .delete()
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true, error: null };
}

// ═══════════════════════════════════════════════════════════
// 签表生成 (Generate Draw)
// 完整移植自 app.py 的 api_generate_draw 函数
// ═══════════════════════════════════════════════════════════

/**
 * 自动处理 Bye（轮空）晋级
 * 对于 status='bye' 且只有一个有效球员的比赛，该球员直接晋级到下一轮
 *
 * @param {number} tid - 赛事 ID
 * @param {string[]} roundOrder - 轮次名称数组
 * @param {number} [startRoundIdx=0] - 从哪个轮次开始处理
 */
async function autoAdvanceByes(tid, roundOrder, startRoundIdx = 0) {
    for (let rIdx = startRoundIdx; rIdx < roundOrder.length - 1; rIdx++) {
        const curRound = roundOrder[rIdx];
        const nextRound = roundOrder[rIdx + 1];

        // 获取当前轮次所有比赛（用于确定位置索引）
        const { data: allCurMatches } = await supabase
            .from('matches')
            .select('*')
            .eq('tournament_id', tid)
            .eq('round', curRound)
            .order('match_order', { ascending: true });

        // 构建位置索引映射：match_id → 1-indexed 位置
        const posMap = {};
        for (let ci = 0; ci < allCurMatches.length; ci++) {
            posMap[allCurMatches[ci].id] = ci + 1;
        }

        // 获取下一轮比赛
        const { data: nextMatches } = await supabase
            .from('matches')
            .select('*')
            .eq('tournament_id', tid)
            .eq('round', nextRound)
            .order('match_order', { ascending: true });

        if (!nextMatches || nextMatches.length === 0) continue;

        for (const m of allCurMatches) {
            if (m.status !== 'bye') continue;
            // 已处理过的 Bye（winner_id 已设置）跳过
            if (m.winner_id) continue;

            const p1 = m.player1_id;
            const p2 = m.player2_id;

            // Bye 场景：一个有效球员 + 一个空位
            let byeWinner = null;
            let byePartner = null;
            if (p1 && !p2) {
                byeWinner = p1;
                byePartner = m.player3_id || null;
            } else if (p2 && !p1) {
                byeWinner = p2;
                byePartner = m.player4_id || null;
            }
            if (!byeWinner) continue;

            const curIdx = posMap[m.id];
            if (curIdx === undefined) continue;

            // 设置胜者但保持 bye 状态
            await supabase
                .from('matches')
                .update({ winner_id: byeWinner })
                .eq('id', m.id);

            // 晋级到下一轮
            const advance = calcAdvanceToNextRound(byeWinner, curIdx, nextMatches);
            if (advance) {
                const updateData = { [advance.slot]: advance.winnerId };
                if (byePartner) {
                    updateData[advance.partnerSlot] = byePartner;
                }
                await supabase
                    .from('matches')
                    .update(updateData)
                    .eq('id', advance.id);

                // 如果双方都就位，状态改为 scheduled
                const { data: refreshed } = await supabase
                    .from('matches')
                    .select('player1_id, player2_id')
                    .eq('id', advance.id)
                    .single();

                if (refreshed && refreshed.player1_id && refreshed.player2_id) {
                    await supabase
                        .from('matches')
                        .update({ status: 'scheduled' })
                        .eq('id', advance.id);
                }
            }
        }
    }
}

/**
 * 冻结球员数据（创建快照，不重新生成签表）
 * @param {number} tid - 赛事 ID
 * @returns {Promise<Object>} { success, frozen, error }
 */
async function freezeSnapshot(tid) {
    const players = await getLiveTournamentPlayers(tid);
    if (!players || players.length === 0) {
        return { success: false, frozen: 0, error: '该赛事暂无参赛球员' };
    }

    // 删除旧快照
    await supabase.from('tournament_player_snapshots').delete().eq('tournament_id', tid);

    // 插入新快照
    const rows = players.map(p => ({
        tournament_id: tid,
        player_id: p.id,
        name: p.name,
        country: p.country || '',
        country_code: p.country_code || '',
        ranking: p.ranking || 999,
        seed: p.t_seed || 0,
        entry_type: p.entry_type || 'main',
    }));

    const BATCH_SIZE = 200;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('tournament_player_snapshots').insert(batch);
        if (error) {
            console.error('冻结球员数据失败:', error.message);
            return { success: false, frozen: 0, error: error.message };
        }
    }

    return { success: true, frozen: rows.length };
}

/**
 * 生成签表（完整移植自 app.py api_generate_draw）
 *
 * 支持 32/64/96/128 签位，遵循 Grand Slam Rule Book 种子放置规则。
 *
 * @param {number} tid - 赛事 ID
 * @returns {Promise<Object>} { success, matchesCreated, error }
 */
async function generateDraw(tid) {
    // 获取赛事信息
    const tournament = await getTournament(tid);
    if (!tournament) {
        return { success: false, matchesCreated: 0, error: 'Tournament not found' };
    }

    const drawSize = tournament.draw_size;
    const isDoubles = tournament.match_type === 'doubles';

    // 获取参赛球员（按种子排序，种子在前）— 始终读取实时数据
    const players = await getLiveTournamentPlayers(tid);

    if (players.length < 2) {
        return { success: false, matchesCreated: 0, error: 'Need at least 2 players' };
    }

    // 双打：将球员两两配对为队伍
    // teamPartnerMap[player_id] = partner_id
    let teamPartnerMap = {};
    let drawEntries = players; // 用于签表定位的条目（单打=球员，双打=队伍代表）

    if (isDoubles) {
        // 按种子和排名排序后两两配对
        const sorted = [...players].sort((a, b) => {
            const sa = a.t_seed || 999;
            const sb = b.t_seed || 999;
            if (sa !== sb) return sa - sb;
            return (a.ranking || 999) - (b.ranking || 999);
        });
        for (let i = 0; i + 1 < sorted.length; i += 2) {
            teamPartnerMap[sorted[i].id] = sorted[i + 1].id;
            teamPartnerMap[sorted[i + 1].id] = sorted[i].id;
        }
        // 每队取第一名球员（种子/排名较高者）作为签表定位代表
        drawEntries = sorted.filter((_, i) => i % 2 === 0);
    }

    // 双打辅助：为比赛对象添加伙伴字段
    function withPartners(obj, p1Id, p2Id) {
        if (isDoubles) {
            if (p1Id && teamPartnerMap[p1Id]) obj.player3_id = teamPartnerMap[p1Id];
            if (p2Id && teamPartnerMap[p2Id]) obj.player4_id = teamPartnerMap[p2Id];
        }
        return obj;
    }

    // 生成签表时创建球员信息快照，冻结当前球员数据
    await freezeSnapshot(tid);

    // 删除旧比赛
    await supabase.from('matches').delete().eq('tournament_id', tid);

    const totalSlots = getTotalSlots(drawSize);
    const rounds = getRounds(drawSize);
    let matchOrder = 0;
    const toInsert = [];

    if (drawSize === 96) {
        // ═══ 96 签特殊逻辑 ═══
        // 96签 = 128槽位，32种子 + 64非种子
        // 种子按128签32种子位置表分布，对手全部是Bye
        // 非种子成对填入不含种子的槽位配对

        const numSeeds96 = getNumSeeds(128); // 32 seeds using 128-draw table
        const seedPositions = generateDrawPositions(128, numSeeds96);

        // 初始化 128 槽位
        const filled = new Array(128).fill(null);

        // 放置种子（按 128 签种子位置表）
        const seededPlayers = drawEntries
            .filter(p => (p.t_seed || 0) > 0)
            .sort((a, b) => a.t_seed - b.t_seed);
        for (const p of seededPlayers) {
            const seedNum = p.t_seed;
            if (seedPositions[seedNum] !== undefined) {
                const pos = seedPositions[seedNum] - 1;
                filled[pos] = p.id;
            }
        }

        // 收集非种子并随机排列
        const nonSeeded = shuffleArray(drawEntries.filter(p => (p.t_seed || 0) === 0));

        // 成对填入非种子到不含种子的配对中
        let nsIdx = 0;
        for (let i = 0; i < 128; i += 2) {
            let hasSeed = false;
            for (const j of [i, i + 1]) {
                if (filled[j]) {
                    const pp = drawEntries.find(pl => pl.id === filled[j]);
                    if (pp && (pp.t_seed || 0) > 0) {
                        hasSeed = true;
                    }
                }
            }
            if (!hasSeed && nsIdx + 1 < nonSeeded.length) {
                filled[i] = nonSeeded[nsIdx].id;
                filled[i + 1] = nonSeeded[nsIdx + 1].id;
                nsIdx += 2;
            }
        }

        // 构建 playerMap 用于快速查找种子信息
        const playerMapForSeeds = {};
        drawEntries.forEach(p => { playerMapForSeeds[p.id] = p; });

        // 记录 R128 中种子轮空 → R64 的自动晋级信息
        const seedByeWinners = {};

        const firstRound = rounds[0];

        // 创建 R128 比赛（64 场）
        for (let i = 0; i < 64; i++) {
            const p1 = filled[i * 2];
            const p2 = filled[i * 2 + 1];

            // 双方都空 → 跳过
            if (p1 === null && p2 === null) continue;

            matchOrder++;
            const r64Idx = Math.floor(i / 2);

            // 检查是否有种子（种子轮空）
            let hasSeed = false;
            let seedPid = null;
            for (const pid of [p1, p2]) {
                if (pid) {
                    const pp = playerMapForSeeds[pid];
                    if (pp && (pp.t_seed || 0) > 0) {
                        hasSeed = true;
                        seedPid = pid;
                    }
                }
            }

            let status = 'bye';
            let winnerId = null;
            if (hasSeed && seedPid) {
                winnerId = seedPid;
            } else if (p1 && p2) {
                status = 'scheduled';
            }

            // 种子自动晋级到对应的 R64 比赛
            if (hasSeed && seedPid) {
                const isPlayer1 = (p1 === seedPid);
                if (!seedByeWinners[r64Idx]) seedByeWinners[r64Idx] = {};
                if (isPlayer1) {
                    seedByeWinners[r64Idx].player1 = seedPid;
                } else {
                    seedByeWinners[r64Idx].player2 = seedPid;
                }
            }

            toInsert.push(withPartners({
                tournament_id: tid,
                round: firstRound,
                match_order: matchOrder,
                player1_id: p1,
                player2_id: p2,
                winner_id: winnerId,
                status: status,
            }, p1, p2));
        }

        // 创建后续轮次，R64 自动填入晋级种子
        for (let rIdx = 1; rIdx < rounds.length; rIdx++) {
            const roundName = rounds[rIdx];
            const numMatches = 128 / Math.pow(2, rIdx + 1);
            for (let i = 0; i < numMatches; i++) {
                matchOrder++;
                if (roundName === 'R64' && seedByeWinners[i]) {
                    const sw = seedByeWinners[i];
                    toInsert.push(withPartners({
                        tournament_id: tid,
                        round: roundName,
                        match_order: matchOrder,
                        player1_id: sw.player1 || null,
                        player2_id: sw.player2 || null,
                        status: 'scheduled',
                    }, sw.player1 || null, sw.player2 || null));
                } else {
                    toInsert.push({
                        tournament_id: tid,
                        round: roundName,
                        match_order: matchOrder,
                        status: 'pending',
                    });
                }
            }
        }
    } else {
        // ═══ 非96签（32/64/128签）原有逻辑 ═══
        const filled = fillDrawPositions(drawEntries, totalSlots, drawSize);

        const firstRound = rounds[0];
        const firstRoundMatches = totalSlots / 2;

        for (let i = 0; i < firstRoundMatches; i++) {
            const p1 = filled[i * 2];
            const p2 = filled[i * 2 + 1];
            matchOrder++;
            const hasBoth = p1 !== null && p2 !== null;
            toInsert.push(withPartners({
                tournament_id: tid,
                round: firstRound,
                match_order: matchOrder,
                player1_id: p1,
                player2_id: p2,
                status: hasBoth ? 'scheduled' : 'bye',
            }, p1, p2));
        }

        // 创建后续轮次占位
        for (let rIdx = 1; rIdx < rounds.length; rIdx++) {
            const roundName = rounds[rIdx];
            const numMatches = totalSlots / Math.pow(2, rIdx + 1);
            for (let i = 0; i < numMatches; i++) {
                matchOrder++;
                toInsert.push({
                    tournament_id: tid,
                    round: roundName,
                    match_order: matchOrder,
                    status: 'pending',
                });
            }
        }
    }

    // 批量插入所有比赛
    if (toInsert.length > 0) {
        // Supabase 批量插入上限约 500 条，如果超出则分批
        const BATCH_SIZE = 200;
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
            const batch = toInsert.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('matches')
                .insert(batch);

            if (error) {
                console.error('批量插入比赛失败:', error.message);
                return { success: false, matchesCreated: 0, error: error.message };
            }
        }
    }

    // 签表生成后，自动处理 Bye 晋级（96 签已在生成时处理，跳过）
    if (drawSize !== 96) {
        await autoAdvanceByes(tid, rounds);
    }

    return { success: true, matchesCreated: toInsert.length };
}

