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

// ── 国家名称映射到国家代码 ──────────────────────────────
const COUNTRY_CODE_MAP = {
    '中国': 'CN', '中华人民共和国': 'CN', 'China': 'CN', 'CHN': 'CN',
    '美国': 'US', 'USA': 'US', 'United States': 'US', 'America': 'US',
    '俄罗斯': 'RU', 'Russia': 'RU', 'RUS': 'RU',
    '白俄罗斯': 'BY', 'Belarus': 'BY', 'BLR': 'BY',
    '乌克兰': 'UA', 'Ukraine': 'UA', 'UKR': 'UA',
    '波兰': 'PL', 'Poland': 'PL', 'POL': 'POL',
    '捷克': 'CZ', 'Czech': 'CZ', 'Czech Republic': 'CZ', 'CZE': 'CZ',
    '斯洛伐克': 'SK', 'Slovakia': 'SK', 'SVK': 'SK',
    '斯洛文尼亚': 'SI', 'Slovenia': 'SI', 'SLO': 'SI',
    '克罗地亚': 'HR', 'Croatia': 'HR', 'CRO': 'HR',
    '塞尔维亚': 'RS', 'Serbia': 'RS', 'SRB': 'RS',
    '罗马尼亚': 'RO', 'Romania': 'RO', 'ROU': 'RO',
    '匈牙利': 'HU', 'Hungary': 'HU', 'HUN': 'HU',
    '奥地利': 'AT', 'Austria': 'AT', 'AUT': 'AT',
    '瑞士': 'CH', 'Switzerland': 'CH', 'SUI': 'CH',
    '德国': 'DE', 'Germany': 'DE', 'GER': 'DE',
    '法国': 'FR', 'France': 'FR', 'FRA': 'FR',
    '西班牙': 'ES', 'Spain': 'ES', 'ESP': 'ES',
    '意大利': 'IT', 'Italy': 'IT', 'ITA': 'IT',
    '葡萄牙': 'PT', 'Portugal': 'PT', 'POR': 'PT',
    '荷兰': 'NL', 'Netherlands': 'NL', 'NED': 'NL',
    '比利时': 'BE', 'Belgium': 'BE', 'BEL': 'BE',
    '瑞典': 'SE', 'Sweden': 'SE', 'SWE': 'SE',
    '挪威': 'NO', 'Norway': 'NO', 'NOR': 'NO',
    '丹麦': 'DK', 'Denmark': 'DK', 'DEN': 'DK',
    '芬兰': 'FI', 'Finland': 'FI', 'FIN': 'FI',
    '英国': 'GB', 'United Kingdom': 'GB', 'UK': 'GB', 'England': 'GB', 'Britain': 'GB',
    '爱尔兰': 'IE', 'Ireland': 'IE', 'IRL': 'IE',
    '希腊': 'GR', 'Greece': 'GR', 'GRE': 'GR',
    '土耳其': 'TR', 'Turkey': 'TR', 'TUR': 'TR',
    '以色列': 'IL', 'Israel': 'IL', 'ISR': 'IL',
    '日本': 'JP', 'Japan': 'JP', 'JPN': 'JP',
    '韩国': 'KR', 'South Korea': 'KR', 'Korea': 'KR', 'KOR': 'KR',
    '朝鲜': 'KP', 'North Korea': 'KP', 'PRK': 'KP',
    '印度': 'IN', 'India': 'IN', 'IND': 'IN',
    '泰国': 'TH', 'Thailand': 'TH', 'THA': 'TH',
    '越南': 'VN', 'Vietnam': 'VN', 'VIE': 'VN',
    '马来西亚': 'MY', 'Malaysia': 'MY', 'MAS': 'MY',
    '新加坡': 'SG', 'Singapore': 'SG', 'SIN': 'SG',
    '菲律宾': 'PH', 'Philippines': 'PH', 'PHI': 'PH',
    '印度尼西亚': 'ID', 'Indonesia': 'ID', 'INA': 'ID',
    '哈萨克斯坦': 'KZ', 'Kazakhstan': 'KZ', 'KAZ': 'KZ',
    '乌兹别克斯坦': 'UZ', 'Uzbekistan': 'UZ', 'UZB': 'UZ',
    '吉尔吉斯斯坦': 'KG', 'Kyrgyzstan': 'KG', 'KGZ': 'KG',
    '塔吉克斯坦': 'TJ', 'Tajikistan': 'TJ', 'TJK': 'TJ',
    '土库曼斯坦': 'TM', 'Turkmenistan': 'TM', 'TKM': 'TM',
    '阿塞拜疆': 'AZ', 'Azerbaijan': 'AZ', 'AZE': 'AZ',
    '亚美尼亚': 'AM', 'Armenia': 'AM', 'ARM': 'AM',
    '格鲁吉亚': 'GE', 'Georgia': 'GE', 'GEO': 'GE',
    '澳大利亚': 'AU', 'Australia': 'AU', 'AUS': 'AU',
    '新西兰': 'NZ', 'New Zealand': 'NZ', 'NZL': 'NZ',
    '加拿大': 'CA', 'Canada': 'CA', 'CAN': 'CA',
    '墨西哥': 'MX', 'Mexico': 'MX', 'MEX': 'MX',
    '巴西': 'BR', 'Brazil': 'BR', 'BRA': 'BR',
    '阿根廷': 'AR', 'Argentina': 'AR', 'ARG': 'AR',
    '智利': 'CL', 'Chile': 'CL', 'CHI': 'CL',
    '哥伦比亚': 'CO', 'Colombia': 'CO', 'COL': 'CO',
    '秘鲁': 'PE', 'Peru': 'PE', 'PER': 'PE',
    '乌拉圭': 'UY', 'Uruguay': 'UY', 'URU': 'UY',
    '巴拉圭': 'PY', 'Paraguay': 'PY', 'PAR': 'PY',
    '玻利维亚': 'BO', 'Bolivia': 'BO', 'BOL': 'BO',
    '厄瓜多尔': 'EC', 'Ecuador': 'EC', 'ECU': 'EC',
    '委内瑞拉': 'VE', 'Venezuela': 'VE', 'VEN': 'VE',
    '南非': 'ZA', 'South Africa': 'ZA', 'RSA': 'ZA',
    '埃及': 'EG', 'Egypt': 'EG', 'EGY': 'EG',
    '摩洛哥': 'MA', 'Morocco': 'MA', 'MAR': 'MA',
    '突尼斯': 'TN', 'Tunisia': 'TN', 'TUN': 'TN',
    '阿尔及利亚': 'DZ', 'Algeria': 'DZ', 'ALG': 'DZ',
    '尼日利亚': 'NG', 'Nigeria': 'NG', 'NGR': 'NG',
    '肯尼亚': 'KE', 'Kenya': 'KE', 'KEN': 'KE',
    '埃塞俄比亚': 'ET', 'Ethiopia': 'ET', 'ETH': 'ET',
    '加纳': 'GH', 'Ghana': 'GH', 'GHA': 'GH',
    '津巴布韦': 'ZW', 'Zimbabwe': 'ZW', 'ZIM': 'ZW',
    '博茨瓦纳': 'BW', 'Botswana': 'BW', 'BOT': 'BW',
    '纳米比亚': 'NA', 'Namibia': 'NA', 'NAM': 'NA',
    '拉脱维亚': 'LV', 'Latvia': 'LV', 'LAT': 'LV',
    '爱沙尼亚': 'EE', 'Estonia': 'EE', 'EST': 'EE',
    '立陶宛': 'LT', 'Lithuania': 'LT', 'LTU': 'LT',
    '保加利亚': 'BG', 'Bulgaria': 'BG', 'BUL': 'BG',
    '黑山': 'ME', 'Montenegro': 'ME', 'MNE': 'ME',
    '波黑': 'BA', 'Bosnia': 'BA', 'BIH': 'BA',
    '北马其顿': 'MK', 'Macedonia': 'MK', 'MKD': 'MK',
    '阿尔巴尼亚': 'AL', 'Albania': 'AL', 'ALB': 'AL',
    '摩尔多瓦': 'MD', 'Moldova': 'MD', 'MDA': 'MD',
    '冰岛': 'IS', 'Iceland': 'IS', 'ISL': 'IS',
    '卢森堡': 'LU', 'Luxembourg': 'LU', 'LUX': 'LU',
    '摩纳哥': 'MC', 'Monaco': 'MC', 'MON': 'MC',
    '安道尔': 'AD', 'Andorra': 'AD', 'AND': 'AD',
    '马耳他': 'MT', 'Malta': 'MT', 'MLT': 'MT',
    '塞浦路斯': 'CY', 'Cyprus': 'CY', 'CYP': 'CY',
    '黎巴嫩': 'LB', 'Lebanon': 'LB', 'LIB': 'LB',
    '约旦': 'JO', 'Jordan': 'JO', 'JOR': 'JO',
    '叙利亚': 'SY', 'Syria': 'SY', 'SYR': 'SY',
    '伊朗': 'IR', 'Iran': 'IR', 'IRI': 'IR',
    '伊拉克': 'IQ', 'Iraq': 'IQ', 'IRQ': 'IQ',
    '沙特阿拉伯': 'SA', 'Saudi Arabia': 'SA', 'KSA': 'SA',
    '阿联酋': 'AE', 'United Arab Emirates': 'AE', 'UAE': 'AE',
    '卡塔尔': 'QA', 'Qatar': 'QA', 'QAT': 'QA',
    '科威特': 'KW', 'Kuwait': 'KW', 'KUW': 'KW',
    '巴林': 'BH', 'Bahrain': 'BH', 'BHR': 'BH',
    '阿曼': 'OM', 'Oman': 'OM', 'OMA': 'OM',
    '巴基斯坦': 'PK', 'Pakistan': 'PK', 'PAK': 'PK',
    '孟加拉国': 'BD', 'Bangladesh': 'BD', 'BAN': 'BD',
    '斯里兰卡': 'LK', 'Sri Lanka': 'LK', 'SRI': 'LK',
    '尼泊尔': 'NP', 'Nepal': 'NP', 'NEP': 'NP',
    '不丹': 'BT', 'Bhutan': 'BT', 'BHU': 'BT',
    '柬埔寨': 'KH', 'Cambodia': 'KH', 'CAM': 'KH',
    '老挝': 'LA', 'Laos': 'LA', 'LAO': 'LA',
    '缅甸': 'MM', 'Myanmar': 'MM', 'Burma': 'MM', 'MYA': 'MM',
    '蒙古': 'MN', 'Mongolia': 'MN', 'MGL': 'MN',
    '文莱': 'BN', 'Brunei': 'BN', 'BRU': 'BN',
    '东帝汶': 'TL', 'Timor-Leste': 'TL', 'TLS': 'TL',
    '巴布亚新几内亚': 'PG', 'Papua New Guinea': 'PG', 'PNG': 'PG',
    '斐济': 'FJ', 'Fiji': 'FJ', 'FIJ': 'FJ',
    '萨摩亚': 'WS', 'Samoa': 'WS', 'SAM': 'WS',
    '汤加': 'TO', 'Tonga': 'TO', 'TGA': 'TO',
    '哥斯达黎加': 'CR', 'Costa Rica': 'CR', 'CRC': 'CR',
    '巴拿马': 'PA', 'Panama': 'PA', 'PAN': 'PA',
    '危地马拉': 'GT', 'Guatemala': 'GT', 'GUA': 'GT',
    '洪都拉斯': 'HN', 'Honduras': 'HN', 'HON': 'HN',
    '萨尔瓦多': 'SV', 'El Salvador': 'SV', 'ESA': 'SV',
    '尼加拉瓜': 'NI', 'Nicaragua': 'NI', 'NCA': 'NI',
    '海地': 'HT', 'Haiti': 'HT', 'HAI': 'HT',
    '多米尼加': 'DO', 'Dominican Republic': 'DO', 'DOM': 'DO',
    '古巴': 'CU', 'Cuba': 'CU', 'CUB': 'CU',
    '牙买加': 'JM', 'Jamaica': 'JM', 'JAM': 'JM',
    '特立尼达和多巴哥': 'TT', 'Trinidad': 'TT', 'TTO': 'TT',
    '巴巴多斯': 'BB', 'Barbados': 'BB', 'BAR': 'BB',
    '巴哈马': 'BS', 'Bahamas': 'BS', 'BAH': 'BS',
};

function getCountryCodeByName(name) {
    if (!name) return '';
    const key = String(name).trim();
    if (COUNTRY_CODE_MAP[key]) return COUNTRY_CODE_MAP[key];
    for (const k in COUNTRY_CODE_MAP) {
        if (k.toLowerCase() === key.toLowerCase()) return COUNTRY_CODE_MAP[k];
    }
    return '';
}

// ── 国旗图片 ──────────────────────────────
// 使用 flagcdn.com 提供 PNG 国旗图片（需要小写国家代码）
function countryFlag(code, name) {
    var cc = (code || '').trim().toLowerCase();
    if (!cc && name) {
        cc = (getCountryCodeByName(name) || '').toLowerCase();
    }
    if (!cc) return '';
    return `<img src="https://flagcdn.com/20x15/${cc}.png" alt="${escapeHtml(name || code)}" title="${escapeHtml(name || code)}" style="width:20px;height:15px;vertical-align:middle;margin-right:4px;border:1px solid var(--gray-200);border-radius:2px;" loading="lazy" onerror="this.onerror=null;this.src='https://flagpedia.net/data/flags/icon/36x27/${cc}.png';this.style.width='20px';this.style.height='15px';">`;
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
