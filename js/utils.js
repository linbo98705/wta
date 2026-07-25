/**
 * ═══════════════════════════════════════════
 * WTA 赛事模拟网站 - 工具函数
 * 从 static/js/main.js 迁移，适配 SPA hash 路由
 * ═══════════════════════════════════════════
 */

// ── Mobile Menu ────────────────────────────
function toggleMenu() {
    const navLinks = document.getElementById('navLinks');
    if (navLinks) {
        navLinks.classList.toggle('show');
    }
}

// ── Toast ───────────────────────────────────
function showToast(msg, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Modal ───────────────────────────────────
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
}

// 点击遮罩层关闭模态框
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('show');
    }
});

// ── 日期格式化 ───────────────────────────────
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

function formatDateRange(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const opts = { month: 'long', day: 'numeric' };
    if (s.getFullYear() === e.getFullYear()) {
        if (s.getMonth() === e.getMonth()) {
            return `${s.toLocaleDateString('zh-CN', { month: 'long' })} ${s.getDate()} - ${e.getDate()}, ${s.getFullYear()}`;
        }
        return `${s.toLocaleDateString('zh-CN', opts)} - ${e.toLocaleDateString('zh-CN', opts)}, ${s.getFullYear()}`;
    }
    return `${s.toLocaleDateString('zh-CN', { ...opts, year: 'numeric' })} - ${e.toLocaleDateString('zh-CN', { ...opts, year: 'numeric' })}`;
}

// ── 场地/分类 ───────────────────────────────
function surfaceLabel(surface) {
    const map = { 'Hard': '硬地', 'Clay': '红土', 'Grass': '草地' };
    return map[surface] || surface;
}

function surfaceClass(surface) {
    const map = { 'Hard': 'surface-hard', 'Clay': 'surface-clay', 'Grass': 'surface-grass' };
    return map[surface] || '';
}

function categoryClass(category) {
    if (category.includes('1000')) return 'wta-1000';
    if (category.includes('500')) return 'wta-500';
    if (category.includes('250')) return 'wta-250';
    if (category.includes('125')) return 'wta-125';
    return '';
}

// ── 国旗图片 ──────────────────────────────
// 使用 flagcdn.com 提供 PNG 国旗图片（Windows 不支持国旗 emoji）
function countryFlag(code, name) {
    if (!code) return '';
    const cc = code.toUpperCase();
    return `<img src="https://flagcdn.com/20x15/${cc}.png" alt="${escapeHtml(name || code)}" title="${escapeHtml(name || code)}" style="width:20px;height:15px;vertical-align:middle;margin-right:4px;border:1px solid var(--gray-200);border-radius:2px;" loading="lazy" onerror="this.style.display='none'">`;
}

// ── HTML 转义 ───────────────────────────────
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── SPA Hash 路由 ────────────────────────────

/**
 * 从 URL hash 解析赛事 ID
 * 支持格式：#tournament/1  或  #tournament/1/draw
 * @returns {number|null} 赛事 ID
 */
function getTournamentId() {
    const hash = window.location.hash;
    const match = hash.match(/#tournament\/(\d+)/);
    return match ? parseInt(match[1]) : null;
}

/**
 * 从 URL hash 解析子页面路径
 * @returns {string} 子路径，如 '' / 'draw' / 'players' / 'schedule' / 'guesses'
 */
function getSubPage() {
    const hash = window.location.hash;
    const match = hash.match(/#tournament\/\d+\/?(.*)/);
    return match ? match[1] || '' : '';
}

/**
 * 解析 hash 路由路径
 * @returns {Object} { route: string, params: Object }
 *   例如 #tournament/1/draw → { route: 'tournament', params: { id: '1', sub: 'draw' } }
 *   例如 #admin → { route: 'admin', params: {} }
 *   例如 # → { route: 'home', params: {} }
 */
function parseHashRoute() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (!hash) return { route: 'home', params: {} };

    const parts = hash.split('/');
    const route = parts[0];
    const params = {};

    if (route === 'tournament' && parts.length >= 2) {
        params.id = parts[1];
        if (parts.length >= 3) {
            params.sub = parts[2];
        }
    }

    return { route, params };
}

/**
 * 注册 Hash 路由器
 * 监听 hashchange 事件，根据路由加载对应的页面内容
 *
 * @param {Object} routes - 路由映射表
 *   键为路由名称，值为加载函数 (params) => Promise<void> 或 (params) => void
 *   例如:
 *   {
 *     home: () => loadIndexPage(),
 *     tournament: (params) => loadTournamentPage(params.id, params.sub),
 *     admin: () => loadAdminPage(),
 *     login: () => loadLoginPage(),
 *   }
 * @param {Function} [onNotFound] - 未匹配路由时的回调 (route) => void
 * @returns {Function} unlisten 函数，调用可移除 hashchange 监听
 */
function addHashRouter(routes, onNotFound) {
    const handler = async () => {
        const { route, params } = parseHashRoute();
        const loader = routes[route];
        if (loader) {
            try {
                await loader(params);
            } catch (err) {
                console.error(`路由 ${route} 加载失败:`, err);
            }
        } else if (onNotFound) {
            onNotFound(route);
        }
    };

    window.addEventListener('hashchange', handler);

    // 首次加载时也触发一次
    handler();

    // 返回取消监听函数
    return () => window.removeEventListener('hashchange', handler);
}

/**
 * 导航到指定 hash 路由
 * @param {string} hash - 要导航的 hash，如 '#tournament/1/draw'
 */
function navigateTo(hash) {
    window.location.hash = hash;
}
