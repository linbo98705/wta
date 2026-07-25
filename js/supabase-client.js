/**
 * ═══════════════════════════════════════════
 * WTA 赛事模拟网站 - Supabase 客户端初始化与认证
 * ═══════════════════════════════════════════
 *
 * 使用方式：在 HTML 中先加载 Supabase CDN，再加载本文件
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 * <script src="js/supabase-client.js"></script>
 */

// ── Supabase 配置 ──────────────────────────
const SUPABASE_URL = 'https://opyihggmivpsexcyqlzn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_k5myUaoogQpT7IsSLs6k1g_In4NU5Zs';

// ── 初始化客户端（CDN 加载的 supabase 是库对象，createClient 才是实例）────────────────
// CDN 的 window.supabase = { createClient, ... }，不能用 const 再次声明
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 认证状态管理 ────────────────────────────
// 管理员登录状态持久化到 sessionStorage
const AUTH_SESSION_KEY = 'wta_admin_session';

/**
 * 获取当前认证会话
 * @returns {Object|null} 当前会话对象，未登录返回 null
 */
async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('获取会话失败:', error.message);
        return null;
    }
    return session;
}

/**
 * 获取当前登录用户
 * @returns {Object|null} 当前用户对象，未登录返回 null
 */
async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('获取用户失败:', error.message);
        return null;
    }
    return user;
}

/**
 * 管理员登录（邮箱 + 密码）
 * @param {string} email - 管理员邮箱
 * @param {string} password - 管理员密码
 * @returns {Object} { success, user, error }
 */
async function adminLogin(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            return { success: false, user: null, error: error.message };
        }

        if (data.session) {
            sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
            return { success: true, user: data.user, error: null };
        }

        return { success: false, user: null, error: '登录返回数据异常' };
    } catch (err) {
        console.error('登录异常:', err);
        return { success: false, user: null, error: err.message };
    }
}

/**
 * 管理员登出
 * @returns {Object} { success, error }
 */
async function adminLogout() {
    try {
        const { error } = await supabase.auth.signOut();
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true, error: null };
    } catch (err) {
        console.error('登出异常:', err);
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        return { success: false, error: err.message };
    }
}

/**
 * 检查是否已登录（管理员）
 * @returns {Promise<boolean>}
 */
async function isAdminLoggedIn() {
    const session = await getSession();
    return session !== null;
}

/**
 * 监听认证状态变化
 * @param {Function} callback - 状态变化回调 (event, session) => void
 * @returns {Object} 订阅对象，可调用 .unsubscribe() 取消
 */
function onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
    return subscription;
}

/**
 * 需要管理员权限的请求包装器
 * 如果用户未登录，自动跳转到登录页或显示提示
 * @param {Function} action - 需要执行的操作（async function）
 * @param {Object} options - 配置选项
 * @param {string} options.loginUrl - 未登录时跳转的 URL（默认 #login）
 * @param {boolean} options.showToast - 未登录时是否显示提示（默认 true）
 * @returns {Promise<*>} action 的执行结果
 */
async function requireAdmin(action, options = {}) {
    const { loginUrl = '#login', showToast: showTip = true } = options;

    const loggedIn = await isAdminLoggedIn();
    if (!loggedIn) {
        if (showTip && typeof showToast === 'function') {
            showToast('请先登录管理员账号', 'error');
        }
        if (loginUrl) {
            window.location.hash = loginUrl;
        }
        return null;
    }

    return action();
}

// ── 初始化：恢复会话 ───────────────────────
// Supabase v2 客户端创建时自动恢复本地存储的会话
// 无需手动调用 initialize
