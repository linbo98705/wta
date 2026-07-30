// ═══════════════════════════════════════════
// WTA模拟赛事 - 主JS文件
// ═══════════════════════════════════════════

// ── Mobile Menu ──────────────────────────
function toggleMenu() {
    document.getElementById('navLinks').classList.toggle('show');
}

// ── API Helper ───────────────────────────
async function api(url, options = {}) {
    try {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        return { error: err.message };
    }
}

// ── Toast ────────────────────────────────
function showToast(msg, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Modal ────────────────────────────────
function openModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('show');
    }
});

// ── Format Helpers ───────────────────────
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

// ── Country Flag Helper ──────────────────
function countryFlag(code, name) {
    if (!code) {
        return `<span class="player-flag">🌐</span>`;
    }
    // Use flag emoji from country code
    try {
        const flag = code.toUpperCase()
            .split('')
            .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
            .join('');
        return `<span title="${name || code}" style="font-size:1.1em">${flag}</span>`;
    } catch {
        return `<span class="player-flag">${code}</span>`;
    }
}

// ── Current Tournament Context ───────────
function getTournamentId() {
    const match = window.location.pathname.match(/\/tournament\/(\d+)/);
    return match ? parseInt(match[1]) : null;
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Render Tournament Logo ────────────────
function renderTournamentLogo(tournament) {
    if (!tournament || !tournament.logo_url) return;
    const headerContent = document.querySelector('.tournament-header-content');
    if (!headerContent) return;
    if (headerContent.querySelector('.tournament-logo')) return;
    const logoDiv = document.createElement('div');
    logoDiv.className = 'tournament-logo';
    logoDiv.innerHTML = `<img src="${escapeHtml(tournament.logo_url)}" alt="${escapeHtml(tournament.name_cn || tournament.name || '')}" style="max-height:80px; margin-bottom:16px; border-radius:8px; background:#fff; padding:8px;">`;
    headerContent.insertBefore(logoDiv, headerContent.firstChild);
}
