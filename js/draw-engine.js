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
const SEQ_COL_WIDTH = 40;  // 序号列宽度（px）

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

    // Bye（轮空）比赛：一个有效球员 + 空位
    if (m.status === 'bye') {
        const topName = m.p1_name || '';
        const bottomName = m.p2_name || '';
        const topHtml = m.player1_id
            ? '<div class="bracket-player seed-bye"><div class="bracket-player-name" title="' + topName + '">' + (p1Seed > 0 ? '<span class="seed-badge">' + p1Seed + '</span>' : '') + '<span>' + topName + '</span></div></div>'
            : '<div class="bracket-player bye-label"><div class="bracket-player-name"><span>Bye</span></div></div>';
        const bottomHtml = m.player2_id
            ? '<div class="bracket-player seed-bye"><div class="bracket-player-name" title="' + bottomName + '">' + (p2Seed > 0 ? '<span class="seed-badge">' + p2Seed + '</span>' : '') + '<span>' + bottomName + '</span></div></div>'
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
        + '<span>' + p1Full + '</span>'
        + '</div></div>'
        + '<div class="bracket-player ' + p2Class + '">'
        + '<div class="bracket-player-name" title="' + p2Full + '">'
        + (p2Seed > 0 ? '<span class="seed-badge">' + p2Seed + '</span>' : '')
        + '<span>' + p2Full + '</span>'
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
    const seqOffset = SEQ_COL_WIDTH + COL_GAP; // 序号列偏移量
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

    // 外层容器
    html += '<div class="bracket-wrap" style="position:relative; width:' + totalW + 'px;">';

    // 轮次标题行（含序号列）
    html += '<div class="bracket-headers" style="display:flex; gap:' + COL_GAP + 'px; margin-bottom:6px;">';
    // 序号列标题
    html += '<div class="bracket-round-header" style="width:' + SEQ_COL_WIDTH + 'px; flex-shrink:0;">序号</div>';
    for (let ri = 0; ri < roundOrder.length; ri++) {
        html += '<div class="bracket-round-header" style="width:' + COL_WIDTH + 'px; flex-shrink:0;">'
            + (roundLabels[roundOrder[ri]] || roundOrder[ri])
            + '</div>';
    }
    html += '</div>';

    // 主体区域（含 SVG 连线 + 比赛卡）
    html += '<div class="bracket-body" style="position:relative; width:' + totalW + 'px; height:' + totalH + 'px;">';

    // SVG 连线层
    html += '<svg class="bracket-lines" width="' + totalW + '" height="' + totalH
        + '" style="position:absolute; top:0; left:0; overflow:visible; pointer-events:none; z-index:0;">';
    html += svgParts.join('');
    html += '</svg>';

    // 序号列（仅第一轮每场比赛显示序号）
    const firstRoundMatches = roundData[0];
    const firstSpan = totalH / firstRoundMatches.length;
    for (let si = 0; si < firstRoundMatches.length; si++) {
        const sTop = si * firstSpan + (firstSpan - 20) / 2;
        html += '<div style="position:absolute; left:0; top:' + sTop + 'px; width:' + SEQ_COL_WIDTH
            + 'px; height:20px; line-height:20px; text-align:center; font-size:0.75rem; font-weight:600; color:var(--gray-500); z-index:1;">'
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
                + 'px; z-index:1;">';
            html += '<div class="bracket-match" style="height:100%;">' + renderMatch(m, playerMap) + '</div>';
            html += '</div>';
        }
    }

    html += '</div>'; // bracket-body
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
