/**
 * ═══════════════════════════════════════════
 * WTA 赛事模拟网站 - 签表可视化引擎
 * 从 templates/draw.html 的内联 JS 迁移而来
 * ═══════════════════════════════════════════
 *
 * 提供对阵签表的 SVG+HTML 渲染能力。
 * 使用方式：
 *   const html = buildBracket(matches, playerMap, startRound);
 *   document.getElementById('bracketContainer').innerHTML = html;
 */

// ── 轮次标签映射 ────────────────────────────
const roundLabels = {
    'R128': 'R128',
    'R64':  'R64',
    'R32':  'R32',
    'R16':  'R16',
    'QF':   '1/4决赛',
    'SF':   '半决赛',
    'F':    '决赛',
};

// ── 布局常量 ────────────────────────────────
const MATCH_HEIGHT = 52;   // 每场比赛高度（px）
const COL_WIDTH = 210;     // 列宽（px）
const COL_GAP = 56;        // 列间距，含连线空间（px）
const SECTION_COL_WIDTH = 28; // 区标签列宽度（px）
const SEQ_COL_WIDTH = 40;  // 序号列宽度（px）
const SEQ_COL_GAP = 8;     // 序号列与签表的间距（px）

// ── 简写别名 ────────────────────────────────
const compactStartRound = 'R16';

/**
 * 渲染单场比赛的 HTML 内容
 *
 * @param {Object} m - 比赛对象（需含 player1_id, player2_id, winner_id, status, p1_name, p2_name）
 * @param {Object} playerMap - 球员映射 { id: { t_seed, ... } }
 * @returns {string} 两行 bracket-player 的 HTML
 */
function renderMatch(m, playerMap) {
    const p1Seed = (playerMap && playerMap[m.player1_id]) ? (playerMap[m.player1_id].t_seed || 0) : 0;
    const p2Seed = (playerMap && playerMap[m.player2_id]) ? (playerMap[m.player2_id].t_seed || 0) : 0;

    // 获取球员国旗 HTML
    function playerFlag(pid) {
        if (!playerMap || !playerMap[pid]) return '';
        const p = playerMap[pid];
        return typeof countryFlag === 'function' ? countryFlag(p.country_code || '', p.country || '') : '';
    }

    // Bye（轮空）比赛：一个有效球员 + 空位
    if (m.status === 'bye') {
        const topName = m.p1_name || '';
        const bottomName = m.p2_name || '';
        const topHtml = m.player1_id
            ? '<div class="bracket-player seed-bye"><div class="bracket-player-name" title="' + topName + '">' + (p1Seed > 0 ? '<span class="seed-badge">' + p1Seed + '</span>' : '') + '<span>' + topName + '</span>' + playerFlag(m.player1_id) + '</div></div>'
            : '<div class="bracket-player bye-label"><div class="bracket-player-name"><span>Bye</span></div></div>';
        const bottomHtml = m.player2_id
            ? '<div class="bracket-player seed-bye"><div class="bracket-player-name" title="' + bottomName + '">' + (p2Seed > 0 ? '<span class="seed-badge">' + p2Seed + '</span>' : '') + '<span>' + bottomName + '</span>' + playerFlag(m.player2_id) + '</div></div>'
            : '<div class="bracket-player bye-label"><div class="bracket-player-name"><span>Bye</span></div></div>';
        return topHtml + bottomHtml;
    }

    // 正常比赛：胜/败方样式
    const p1Class = m.winner_id === m.player1_id ? 'winner' : (m.winner_id && m.winner_id !== m.player1_id ? 'loser' : '');
    const p2Class = m.winner_id === m.player2_id ? 'winner' : (m.winner_id && m.winner_id !== m.player2_id ? 'loser' : '');

    const p1Full = m.p1_name || '\u2014'; // —
    const p2Full = m.p2_name || '\u2014';

    return '<div class="bracket-player ' + p1Class + '">'
        + '<div class="bracket-player-name" title="' + p1Full + '">'
        + (p1Seed > 0 ? '<span class="seed-badge">' + p1Seed + '</span>' : '')
        + '<span>' + p1Full + '</span>' + playerFlag(m.player1_id)
        + '</div></div>'
        + '<div class="bracket-player ' + p2Class + '">'
        + '<div class="bracket-player-name" title="' + p2Full + '">'
        + (p2Seed > 0 ? '<span class="seed-badge">' + p2Seed + '</span>' : '')
        + '<span>' + p2Full + '</span>' + playerFlag(m.player2_id)
        + '</div></div>';
}

/**
 * 构建完整的对阵签表 HTML（含 SVG 连线 + 比分）
 *
 * @param {Array} matches - 比赛对象数组（来自 getMatches 返回值）
 * @param {Object} playerMap - 球员映射 { id: { t_seed, name, ... } }
 *   可从 getTournamentPlayers() 的结果构建
 * @param {string|null} startRound - 从哪个轮次开始渲染（如 'R16'），null 表示从第一轮开始
 * @returns {string} 完整的签表 HTML 字符串
 */
function buildBracket(matches, playerMap, startRound) {
    // 所有轮次的顺序（用于过滤和排序）
    const roundOrderAll = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];

    // 按轮次分组
    const roundsMap = {};
    for (const m of matches) {
        if (!roundsMap[m.round]) roundsMap[m.round] = [];
        roundsMap[m.round].push(m);
    }

    // 确定要渲染的轮次
    let roundOrder = roundOrderAll.filter(r => roundsMap[r]);
    if (startRound) {
        const idx = roundOrder.indexOf(startRound);
        if (idx >= 0) roundOrder = roundOrder.slice(idx);
    }

    // 每轮比赛按 match_order 排序
    const roundData = roundOrder.map(r =>
        roundsMap[r].sort((a, b) => a.match_order - b.match_order)
    );

    const numCols = roundData.length;
    const firstCount = roundData[0].length;
    const totalH = firstCount * MATCH_HEIGHT;
    const seqOffset = SECTION_COL_WIDTH + SEQ_COL_WIDTH + SEQ_COL_GAP; // 区标签列+序号列偏移量
    const totalW = seqOffset + numCols * (COL_WIDTH + COL_GAP) - COL_GAP;

    // ── 构建 SVG 连线 + 比分 ──
    const svgParts = [];

    for (let ci = 0; ci < numCols - 1; ci++) {
        const curMatches = roundData[ci];
        const nxtMatches = roundData[ci + 1];
        const curCnt = curMatches.length;
        const nxtCnt = nxtMatches.length;
        const ratio = curCnt / nxtCnt;

        const xCurRight = seqOffset + (ci + 1) * (COL_WIDTH + COL_GAP) - COL_GAP;
        const xNxtLeft = seqOffset + (ci + 1) * (COL_WIDTH + COL_GAP);
        const xMid = xCurRight + (COL_GAP / 2);

        for (let ni = 0; ni < nxtCnt; ni++) {
            const nxtSpan = totalH / nxtCnt;
            const nxtCenterY = ni * nxtSpan + nxtSpan / 2;

            const f1 = ni * ratio;
            const f2 = ni * ratio + ratio - 1;

            const curSpan = totalH / curCnt;
            const y1 = f1 * curSpan + curSpan / 2;
            const y2 = f2 * curSpan + curSpan / 2;

            // 上一轮的两场比赛
            const m1 = curMatches[f1];
            const m2 = curMatches[f2];

            // 连线
            svgParts.push('<path d="M' + xCurRight + ',' + y1
                + ' L' + xMid + ',' + y1
                + ' L' + xMid + ',' + nxtCenterY
                + ' L' + xNxtLeft + ',' + nxtCenterY
                + '" fill="none" stroke="#c4b0d8" stroke-width="1.2" />');

            svgParts.push('<path d="M' + xCurRight + ',' + y2
                + ' L' + xMid + ',' + y2
                + ' L' + xMid + ',' + nxtCenterY
                + '" fill="none" stroke="#c4b0d8" stroke-width="1.2" />');

            // 比分文字 — 放在每条连线的中段，上下错开
            const scoreX = xMid + (xNxtLeft - xMid) * 0.45;

            if (m1 && m1.status === 'completed') {
                const s1 = (m1.guess_a_total || 0) + '-' + (m1.guess_b_total || 0);
                const r1 = m1.guess_reason || '';
                const scoreY1 = y1 + (nxtCenterY - y1) * 0.45;
                // 比分
                svgParts.push('<text x="' + scoreX + '" y="' + scoreY1 + '" text-anchor="middle" '
                    + 'font-size="10" fill="#5B2D8E" font-weight="700" style="pointer-events:none;">'
                    + s1 + '</text>');
                // 原因（换行显示）
                if (r1) {
                    svgParts.push('<text x="' + scoreX + '" y="' + (scoreY1 + 13) + '" text-anchor="middle" '
                        + 'font-size="8" fill="#7a5c9e" font-weight="500" style="pointer-events:none;">'
                        + r1 + '</text>');
                }
            }
            if (m2 && m2.status === 'completed') {
                const s2 = (m2.guess_a_total || 0) + '-' + (m2.guess_b_total || 0);
                const r2 = m2.guess_reason || '';
                const scoreY2 = y2 + (nxtCenterY - y2) * 0.55;
                // 比分
                svgParts.push('<text x="' + scoreX + '" y="' + scoreY2 + '" text-anchor="middle" '
                    + 'font-size="10" fill="#5B2D8E" font-weight="700" style="pointer-events:none;">'
                    + s2 + '</text>');
                // 原因（换行显示）
                if (r2) {
                    svgParts.push('<text x="' + scoreX + '" y="' + (scoreY2 + 13) + '" text-anchor="middle" '
                        + 'font-size="8" fill="#7a5c9e" font-weight="500" style="pointer-events:none;">'
                        + r2 + '</text>');
                }
            }
        }
    }

    // ── 输出 HTML ──
    let html = '';

    // 计算 1/8 区信息
    const sectionCount = firstCount >= 8 ? 8 : firstCount; // 最多8个区
    const matchesPerSection = firstCount / sectionCount;
    const sectionH = matchesPerSection * MATCH_HEIGHT;

    // 外层容器
    html += '<div class="bracket-wrap" style="position:relative; width:' + totalW + 'px;">';

    // 轮次标题行（含区标签列+序号列）
    html += '<div class="bracket-headers" style="display:flex; margin-bottom:6px;">';
    // 区标签列标题
    html += '<div class="bracket-round-header" style="width:' + SECTION_COL_WIDTH + 'px; flex-shrink:0; font-size:0.625rem;">区</div>';
    // 序号列标题
    html += '<div class="bracket-round-header" style="width:' + SEQ_COL_WIDTH + 'px; flex-shrink:0; margin-right:' + SEQ_COL_GAP + 'px;">序号</div>';
    for (let ri = 0; ri < roundOrder.length; ri++) {
        if (ri > 0) html += '<div style="width:' + COL_GAP + 'px; flex-shrink:0;"></div>';
        html += '<div class="bracket-round-header" style="width:' + COL_WIDTH + 'px; flex-shrink:0;">'
            + (roundLabels[roundOrder[ri]] || roundOrder[ri])
            + '</div>';
    }
    html += '</div>';

    // 主体区域（含 SVG 连线 + 比赛卡）
    html += '<div class="bracket-body" style="position:relative; width:' + totalW + 'px; height:' + totalH + 'px;">';

    // 1/8 区背景色带（交替背景色）+ 区标签
    for (let si = 0; si < sectionCount; si++) {
        const sTop = si * sectionH;
        const bgColor = si % 2 === 0 ? 'rgba(91,45,142,0.02)' : 'rgba(91,45,142,0.06)';
        // 背景覆盖区标签列到签表末尾
        html += '<div style="position:absolute; left:0; top:' + sTop + 'px; width:' + totalW
            + 'px; height:' + sectionH + 'px; background:' + bgColor + '; z-index:0;"></div>';

        // 区标签（垂直居中于各区，独立列不与序号重叠）
        const labelTop = sTop + (sectionH - 14) / 2;
        html += '<div style="position:absolute; left:0; top:' + labelTop + 'px; width:' + SECTION_COL_WIDTH
            + 'px; height:14px; line-height:14px; text-align:center; font-size:0.625rem; font-weight:700; '
            + 'color:var(--purple); z-index:3;">' + (si + 1) + '/' + sectionCount + '</div>';
    }

    // SVG 连线层
    html += '<svg class="bracket-lines" width="' + totalW + '" height="' + totalH
        + '" style="position:absolute; top:0; left:0; overflow:visible; pointer-events:none; z-index:1;">';
    html += svgParts.join('');
    html += '</svg>';

    // 序号列（按签位数显示，每场比赛2个签位）
    const firstRoundMatches = roundData[0];
    const slotCount = firstRoundMatches.length * 2; // 总签位数
    const slotH = totalH / slotCount;
    for (let si = 0; si < slotCount; si++) {
        const sTop = si * slotH + (slotH - 16) / 2;
        html += '<div style="position:absolute; left:' + SECTION_COL_WIDTH + 'px; top:' + sTop + 'px; width:' + SEQ_COL_WIDTH
            + 'px; height:16px; line-height:16px; text-align:center; font-size:0.6875rem; font-weight:600; color:var(--gray-500); z-index:3;">'
            + (si + 1) + '</div>';
    }

    // 比赛卡片层
    for (let ci = 0; ci < numCols; ci++) {
        const rm = roundData[ci];
        const mc = rm.length;
        const colX = seqOffset + ci * (COL_WIDTH + COL_GAP);
        const mSpan = totalH / mc;

        for (let mi = 0; mi < mc; mi++) {
            const m = rm[mi];
            const mTop = mi * mSpan + (mSpan - MATCH_HEIGHT) / 2;
            html += '<div class="bracket-match-wrapper" style="position:absolute; left:' + colX
                + 'px; top:' + mTop + 'px; width:' + COL_WIDTH + 'px; height:' + MATCH_HEIGHT
                + 'px; z-index:3;">';
            html += '<div class="bracket-match" style="height:100%;">' + renderMatch(m, playerMap) + '</div>';
            html += '</div>';
        }
    }

    html += '</div>'; // bracket-body

    // ── 冠亚军展示（决赛已完赛时显示）──
    const finalRoundIdx = roundOrder.indexOf('F');
    if (finalRoundIdx >= 0) {
        const finalMatch = roundData[finalRoundIdx][0];
        if (finalMatch && finalMatch.status === 'completed' && finalMatch.winner_id) {
            const isP1Win = finalMatch.winner_id === finalMatch.player1_id;
            const champName = isP1Win ? finalMatch.p1_name : finalMatch.p2_name;
            const runnerName = isP1Win ? finalMatch.p2_name : finalMatch.p1_name;
            const champId = isP1Win ? finalMatch.player1_id : finalMatch.player2_id;
            const runnerId = isP1Win ? finalMatch.player2_id : finalMatch.player1_id;

            function trophyFlag(pid) {
                if (!playerMap || !playerMap[pid]) return '';
                const p = playerMap[pid];
                return typeof countryFlag === 'function' ? countryFlag(p.country_code || '', p.country || '') : '';
            }

            html += '<div class="bracket-champion-box" style="display:flex; gap:12px; margin-top:16px; padding:16px 20px; '
                + 'background:linear-gradient(135deg, rgba(91,45,142,0.06) 0%, rgba(123,79,160,0.04) 100%); '
                + 'border-radius:12px; border:1px solid var(--purple-lighter);">';
            // 冠军
            html += '<div style="flex:1; display:flex; align-items:center; gap:10px; padding:12px 16px; '
                + 'background:linear-gradient(135deg, #fff8e1 0%, #fff3cd 100%); border-radius:10px; '
                + 'border:2px solid #C8A951; box-shadow:0 2px 12px rgba(200,169,81,0.2);">'
                + '<span style="font-size:1.75rem; line-height:1;">\uD83C\uDFC6</span>'
                + '<div><div style="font-size:0.6875rem; font-weight:700; color:#9a7b1f; letter-spacing:0.05em; text-transform:uppercase;">冠军</div>'
                + '<div style="font-size:1rem; font-weight:700; color:var(--purple-dark);">' + escapeHtml(champName || '') + trophyFlag(champId) + '</div></div></div>';
            // 亚军
            html += '<div style="flex:1; display:flex; align-items:center; gap:10px; padding:12px 16px; '
                + 'background:linear-gradient(135deg, #f5f5f5 0%, #ececec 100%); border-radius:10px; '
                + 'border:2px solid #A3A3A3; box-shadow:0 2px 8px rgba(163,163,163,0.15);">'
                + '<span style="font-size:1.5rem; line-height:1;">\uD83E\uDD48</span>'
                + '<div><div style="font-size:0.6875rem; font-weight:700; color:#525252; letter-spacing:0.05em; text-transform:uppercase;">亚军</div>'
                + '<div style="font-size:1rem; font-weight:700; color:var(--gray-700);">' + escapeHtml(runnerName || '') + trophyFlag(runnerId) + '</div></div></div>';
            html += '</div>';
        }
    }

    html += '</div>'; // bracket-wrap

    return html;
}

/**
 * 初始化签表视图的便捷函数
 * 加载赛事信息和比赛数据，然后渲染签表到指定容器
 *
 * @param {number} tid - 赛事 ID
 * @param {string} containerId - 容器 DOM 元素 ID
 * @param {Object} [options] - 配置选项
 * @param {string} [options.headerCatId='tCat'] - 赛事分类标签元素 ID
 * @param {string} [options.headerNameId='tName'] - 标题元素 ID
 * @param {string} [options.headerMetaId='tMeta'] - 元信息元素 ID
 * @param {string} [options.legendId='drawLegend'] - 图例元素 ID
 * @param {string} [options.toggleId='viewToggle'] - 视图切换按钮容器 ID
 * @param {string} [options.titleId='bracketTitle'] - 签表标题元素 ID
 * @param {string} [options.defaultView='full'] - 默认视图 ('full' 或 'compact')
 */
async function initDrawView(tid, containerId, options = {}) {
    const {
        headerCatId = 'tCat',
        headerNameId = 'tName',
        headerMetaId = 'tMeta',
        legendId = 'drawLegend',
        toggleId = 'viewToggle',
        titleId = 'bracketTitle',
        defaultView = 'full',
    } = options;

    const container = document.getElementById(containerId);
    if (!container) return;

    // 加载赛事信息
    const tournament = await getTournament(tid);
    if (tournament) {
        // 渲染赛事 Logo
        if (typeof renderTournamentLogo === 'function') {
            renderTournamentLogo(tournament);
        }
        const catEl = document.getElementById(headerCatId);
        const nameEl = document.getElementById(headerNameId);
        const metaEl = document.getElementById(headerMetaId);
        const toggleEl = document.getElementById(toggleId);

        if (catEl) catEl.textContent = tournament.category;
        if (nameEl) nameEl.textContent = '比赛签表';
        const tourNameEl = document.getElementById('tTourName');
        if (tourNameEl) tourNameEl.textContent = tournament.name_cn || tournament.name;
        if (metaEl) {
            metaEl.innerHTML =
                '<span>\u{1F4CD} ' + escapeHtml(tournament.location) + '</span>'
                + '<span><span class="surface-tag ' + surfaceClass(tournament.surface) + '">'
                + surfaceLabel(tournament.surface) + '</span></span>'
                + '<span>\u{1F4C5} ' + formatDateRange(tournament.start_date, tournament.end_date) + '</span>';
        }
        if (toggleEl && tournament.draw_size >= 64) {
            toggleEl.style.display = 'flex';
        }
    }

    // 加载比赛数据
    const allMatches = await getMatches(tid);
    if (!allMatches || allMatches.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>签表尚未生成</h3><p>暂未生成签表</p></div>';
        return;
    }

    // 加载球员数据构建 playerMap
    const players = await getTournamentPlayers(tid);
    const playerMap = {};
    if (Array.isArray(players)) {
        players.forEach(p => { playerMap[p.id] = p; });
    }

    // 渲染视图
    function renderView(view) {
        if (view === 'compact') {
            const titleEl = document.getElementById(titleId);
            if (titleEl) titleEl.textContent = '对阵签表（16强起）';
            container.innerHTML = buildBracket(allMatches, playerMap, compactStartRound);
        } else {
            const titleEl = document.getElementById(titleId);
            if (titleEl) titleEl.textContent = '对阵签表';
            container.innerHTML = buildBracket(allMatches, playerMap, null);
        }

        // 统计信息
        const realMatches = allMatches.filter(m => m.status !== 'bye');
        const done = realMatches.filter(m => m.status === 'completed').length;
        const legendEl = document.getElementById(legendId);
        if (legendEl) {
            legendEl.textContent = '共 ' + realMatches.length + ' 场比赛 | ' + done + ' 场已完成';
        }

        // 重新绑定视图切换按钮
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.onclick = function () {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                renderView(this.dataset.view);
            };
        });
    }

    renderView(defaultView);
}
