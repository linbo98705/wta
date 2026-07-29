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

// ═══════════════════════════════════════════════════════════════
// 百度账号 OAuth 登录（前端用户系统）
// ═══════════════════════════════════════════════════════════════

// ── 百度开放平台配置（需在 https://developer.baidu.com/ 注册应用）──
const BAIDU_OAUTH_CONFIG = {
    clientId: 'YOUR_BAIDU_CLIENT_ID',
    redirectUri: window.location.origin + window.location.pathname,
    scope: 'basic',
};

const USER_SESSION_KEY = 'wta_user_session';

function getBaiduLoginUrl(state) {
    const params = new URLSearchParams({
        response_type: 'token',
        client_id: BAIDU_OAUTH_CONFIG.clientId,
        redirect_uri: BAIDU_OAUTH_CONFIG.redirectUri,
        scope: BAIDU_OAUTH_CONFIG.scope,
        state: state || ('wta_' + Date.now()),
        display: 'page',
    });
    return 'https://openapi.baidu.com/oauth/2.0/authorize?' + params.toString();
}

function parseBaiduRedirectHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    if (accessToken) {
        return {
            accessToken: accessToken,
            expiresIn: params.get('expires_in'),
            scope: params.get('scope'),
            sessionKey: params.get('session_key'),
            sessionSecret: params.get('session_secret'),
        };
    }
    return null;
}

async function fetchBaiduUserInfo(accessToken) {
    try {
        const url = 'https://openapi.baidu.com/rest/2.0/passport/users/getInfo?access_token=' + accessToken;
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        return await response.json();
    } catch (err) {
        console.error('获取百度用户信息失败:', err);
        return null;
    }
}

async function upsertBaiduUser(baiduUser, accessToken) {
    try {
        const userData = {
            baidu_uid: String(baiduUser.userid || baiduUser.uid || ''),
            username: baiduUser.username || baiduUser.uname || '百度用户',
            avatar_url: baiduUser.portrait ? 'https://himg.bdimg.com/sys/portraitn/item/' + baiduUser.portrait : '',
            sex: baiduUser.sex || '',
            birthday: baiduUser.birthday || '',
            location: baiduUser.location || '',
            access_token: accessToken,
            last_login_at: new Date().toISOString(),
        };

        const { data: existing, error: fetchError } = await supabase
            .from('baidu_users')
            .select('id')
            .eq('baidu_uid', userData.baidu_uid)
            .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.warn('查询百度用户失败:', fetchError.message);
        }

        if (existing) {
            const { error: updateError } = await supabase
                .from('baidu_users')
                .update({
                    username: userData.username,
                    avatar_url: userData.avatar_url,
                    access_token: userData.access_token,
                    last_login_at: userData.last_login_at,
                })
                .eq('id', existing.id);
            if (updateError) console.warn('更新百度用户失败:', updateError.message);
            return { id: existing.id, ...userData };
        } else {
            const { data: inserted, error: insertError } = await supabase
                .from('baidu_users')
                .insert(userData)
                .select()
                .maybeSingle();
            if (insertError) {
                console.warn('创建百度用户失败:', insertError.message);
                return null;
            }
            return inserted;
        }
    } catch (err) {
        console.error('同步百度用户信息异常:', err);
        return null;
    }
}

async function handleBaiduRedirect() {
    const tokenData = parseBaiduRedirectHash();
    if (!tokenData) return false;

    history.replaceState(null, '', window.location.pathname + window.location.search);

    const baiduUser = await fetchBaiduUserInfo(tokenData.accessToken);
    if (!baiduUser) {
        showToast('获取百度账号信息失败', 'error');
        return false;
    }

    const user = await upsertBaiduUser(baiduUser, tokenData.accessToken);
    if (user) {
        const sessionData = {
            id: user.id,
            baidu_uid: user.baidu_uid,
            username: user.username,
            avatar_url: user.avatar_url,
            login_at: new Date().toISOString(),
        };
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionData));
        showToast('登录成功，欢迎 ' + user.username, 'success');
        return true;
    }
    return false;
}

function getCurrentFrontUser() {
    try {
        const raw = localStorage.getItem(USER_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function isFrontUserLoggedIn() {
    return getCurrentFrontUser() !== null;
}

function frontUserLogout() {
    localStorage.removeItem(USER_SESSION_KEY);
    showToast('已退出登录', 'success');
}

function openBaiduLogin() {
    if (BAIDU_OAUTH_CONFIG.clientId === 'YOUR_BAIDU_CLIENT_ID') {
        showToast('请先在百度开放平台注册应用并配置 clientId', 'error');
        return;
    }
    window.location.href = getBaiduLoginUrl();
}
