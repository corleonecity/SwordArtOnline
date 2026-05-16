// ==========================================
// SWORD ART ONLINE - APP.JS
// MULTI-GUILD SUPPORT
// ==========================================

// ==========================================
// 1. KONFIGURATION
// ==========================================

const PANEL_OWNER_USER_ID = '917426398120005653';
const DISCORD_CLIENT_ID = '1503179151073345678';
const ROBLOX_CLIENT_ID = '1529843549493669743';
const BACKEND_URL = 'https://gentle-queen-63f0.keulecolin2005.workers.dev';
const REDIRECT_URI = 'https://corleonecity.github.io/SwordArtOnline/';

// Globale Variablen
let currentUser = null;
let currentGuildId = null;
let availableGuilds = [];
let selectedFiles = [];
let allUsersData = {};
let liveCheckInterval = null;
let userGuildRoles = {}; // { guildId: [roleIds] }
let guildConfigs = {};   // { guildId: config }
let currentEditingMessageId = null;
let testModeEnabled = false;
let roleNameCache = {};

// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update, push, remove } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyAjo_0WEf9qBH-EcKPNEY4PtBVGwxdHsbI",
    authDomain: "cc-shop-finanzsystem.firebaseapp.com",
    databaseURL: "https://cc-shop-finanzsystem-default-rtdb.firebaseio.com",
    projectId: "cc-shop-finanzsystem",
    storageBucket: "cc-shop-finanzsystem.firebasestorage.app",
    messagingSenderId: "575918945925",
    appId: "1:575918945925:web:288a763f1bcbb5ae7e5bec"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 2. HELPER
// ==========================================

function getSafeDbKey(username) {
    return username ? username.replace(/[.#$\[\]]/g, '_') : 'unknown_user';
}

function playLoginMusic() {
    const musicUrl = guildConfigs[currentGuildId]?.system?.musicUrl || 'https://www.youtube.com/embed/BtEkzZoUCpw?autoplay=1&loop=1';
    const ac = document.getElementById('audioPlayerContainer');
    if (ac.innerHTML === '') {
        ac.innerHTML = `<iframe width="0" height="0" src="${musicUrl}" frameborder="0" allow="autoplay"></iframe>`;
    }
}

function stopMusic() {
    document.getElementById('audioPlayerContainer').innerHTML = '';
}

function showNotify(msg, type) {
    const n = document.getElementById('notification');
    n.textContent = msg;
    n.className = `notification show ${type === 'success' ? 'bg-success' : (type === 'warning' ? 'bg-warning' : 'bg-error')}`;
    setTimeout(() => n.classList.remove('show'), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateTestModeIndicator() {
    const indicator = document.getElementById('testModeIndicator');
    const statusText = document.getElementById('testModeStatusText');
    if (testModeEnabled) {
        indicator.classList.remove('hidden');
        if (statusText) statusText.textContent = 'Enabled';
        showNotify('⚠️ TEST MODE ACTIVE - No real changes', 'warning');
    } else {
        indicator.classList.add('hidden');
        if (statusText) statusText.textContent = 'Disabled';
    }
}

// ==========================================
// 3. PERMISSIONS (guild-spezifisch)
// ==========================================

function isPanelOwner() {
    return currentUser?.id === PANEL_OWNER_USER_ID;
}

function hasAdminPermission(guildId) {
    if (isPanelOwner()) return true;
    const guildRoles = userGuildRoles[guildId] || [];
    const adminRoles = guildConfigs[guildId]?.adminRoles || [];
    return guildRoles.some(role => adminRoles.includes(role));
}

function hasGuildLeaderPermission(guildId) {
    if (isPanelOwner()) return true;
    const guildRoles = userGuildRoles[guildId] || [];
    const ownerRoles = guildConfigs[guildId]?.ownerRoles || [];
    return guildRoles.some(role => ownerRoles.includes(role));
}

function hasGpSubmitPermission(guildId) {
    if (isPanelOwner()) return true;
    const guildRoles = userGuildRoles[guildId] || [];
    const gpSubmitRole = guildConfigs[guildId]?.gpSubmitRole;
    return gpSubmitRole ? guildRoles.includes(gpSubmitRole) : false;
}

// ==========================================
// 4. DISCORD BOT INTERAKTIONEN
// ==========================================

async function sendDiscordMessage(channelId, content, embeds) {
    if (!channelId) return false;
    try {
        const response = await fetch(`${BACKEND_URL}/send-channel-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, content, embeds })
        });
        return response.ok;
    } catch (e) {
        console.error(e);
        return false;
    }
}

async function updateBotStatus() {
    try {
        const totalGP = Object.values(allUsersData).reduce((sum, u) => sum + (u.totalGP || 0), 0);
        await fetch(`${BACKEND_URL}/update-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: `🎮 Total GP: ${totalGP.toLocaleString()}` })
        });
    } catch (e) {}
}

async function updateDiscordNickname(userId, robloxName, robloxUsername) {
    try {
        const nickname = `${robloxName} (@${robloxUsername})`;
        const res = await fetch(`${BACKEND_URL}/update-nickname`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, nickname, guildId: currentGuildId })
        });
        return res.ok;
    } catch (e) { return false; }
}

// ==========================================
// 5. TAB SWITCHING
// ==========================================

function switchTab(tabName) {
    const tabs = ['Spenden', 'Leaderboard', 'Profile', 'Admin', 'GuildLeader', 'PanelOwner'];
    tabs.forEach(name => {
        const btn = document.getElementById(`tabBtn${name}`);
        const content = document.getElementById(`content-${name.toLowerCase()}`);
        if (btn && content) {
            if (name === tabName) {
                btn.classList.add('active');
                content.classList.remove('hidden');
            } else {
                btn.classList.remove('active');
                content.classList.add('hidden');
            }
        }
    });
    if (tabName === 'GuildLeader') {
        loadRegisteredUsersCount();
        loadKickLogs();
    }
    if (tabName === 'PanelOwner') {
        loadAdminRolesList();
        loadChannelConfigUI();
        loadSystemConfigUI();
        loadSavedMessages();
        loadRegisteredUsersCount();
        loadKickLogs();
    }
    if (tabName === 'Admin') loadAdminData();
}

// ==========================================
// 6. PERMISSION UI
// ==========================================

function updatePermissions() {
    const gpSubmitCard = document.getElementById('gpSubmitCard');
    const noPermCard = document.getElementById('noPermissionCard');
    const tabSpenden = document.getElementById('tabBtnSpenden');
    const tabAdmin = document.getElementById('tabBtnAdmin');
    const tabGuildLeader = document.getElementById('tabBtnGuildLeader');
    const tabPanelOwner = document.getElementById('tabBtnPanelOwner');
    const spendenContent = document.getElementById('content-spenden');
    
    const canSubmit = hasGpSubmitPermission(currentGuildId);
    const canAdmin = hasAdminPermission(currentGuildId);
    const canGuildLeader = hasGuildLeaderPermission(currentGuildId);
    const panelOwner = isPanelOwner();
    
    if (canSubmit) {
        gpSubmitCard?.classList.remove('hidden');
        noPermCard?.classList.add('hidden');
        if (tabSpenden) tabSpenden.style.display = 'block';
    } else {
        gpSubmitCard?.classList.add('hidden');
        noPermCard?.classList.remove('hidden');
        if (tabSpenden) tabSpenden.style.display = 'none';
        if (spendenContent && !spendenContent.classList.contains('hidden')) switchTab('Leaderboard');
    }
    if (tabAdmin) tabAdmin.style.display = (canAdmin || panelOwner) ? 'block' : 'none';
    if (tabGuildLeader) tabGuildLeader.style.display = (canGuildLeader || panelOwner) ? 'block' : 'none';
    if (tabPanelOwner) tabPanelOwner.style.display = panelOwner ? 'block' : 'none';
}

// ==========================================
// 7. GUILD SELECTION (KORREKTUR)
// ==========================================

async function fetchUserRoles(userId, guildId) {
    try {
        const res = await fetch(`${BACKEND_URL}/user-roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, guildId })
        });
        const data = await res.json();
        userGuildRoles[guildId] = data.roles || [];
        return userGuildRoles[guildId];
    } catch (e) {
        userGuildRoles[guildId] = [];
        return [];
    }
}

async function fetchRoleName(roleId) {
    if (roleNameCache[roleId]) return roleNameCache[roleId];
    try {
        const res = await fetch(`${BACKEND_URL}/role-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId, guildId: currentGuildId })
        });
        const data = await res.json();
        roleNameCache[roleId] = data.name || roleId;
        return roleNameCache[roleId];
    } catch (e) { return roleId; }
}

async function loadAvailableGuilds() {
    if (!currentUser) return [];
    try {
        const res = await fetch(`${BACKEND_URL}/user-guilds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const data = await res.json();
        availableGuilds = data.guilds || [];
        return availableGuilds;
    } catch (e) {
        console.error("loadAvailableGuilds error", e);
        return [];
    }
}

function showGuildSelector() {
    const overlay = document.createElement('div');
    overlay.className = 'guild-selector-overlay';
    overlay.innerHTML = `
        <div class="guild-selector-card">
            <i class="fas fa-server"></i>
            <h2>Select Discord Server</h2>
            <p>Choose which server you want to manage</p>
            <div id="guildList" class="guild-list"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    const guildList = document.getElementById('guildList');
    for (const guild of availableGuilds) {
        const btn = document.createElement('button');
        btn.className = 'guild-selector-btn';
        btn.innerHTML = `
            ${guild.icon ? `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png" class="guild-icon">` : '<i class="fas fa-server"></i>'}
            <span>${escapeHtml(guild.name)}</span>
        `;
        btn.onclick = () => selectGuild(guild.id);
        guildList.appendChild(btn);
    }
}

async function selectGuild(guildId) {
    currentGuildId = guildId;
    document.querySelector('.guild-selector-overlay')?.remove();
    document.getElementById('currentGuildDisplay').textContent = `📡 Server: ${guildId.substring(0, 8)}...`;
    await loadGuildConfig(guildId);
    await loadTestMode(guildId);
    await loadMaintenanceStatus(guildId);
    await fetchUserRoles(currentUser.id, guildId);
    await loadGuildData(guildId);
    updatePermissions();
    showDashboard();
    startLiveMemberCheck();
    playLoginMusic(); // Musik nur wenn gewünscht
}

async function loadGuildConfig(guildId) {
    const configRef = ref(db, `guilds/${guildId}/config`);
    const snap = await get(configRef);
    if (snap.exists()) {
        guildConfigs[guildId] = snap.val();
    } else {
        const defaultConfig = {
            adminRoles: [],
            ownerRoles: [],
            gpSubmitRole: '',
            channels: {},
            system: {
                embedColors: { approve: '#48bb78', reject: '#f56565', pending: '#cd7f32', info: '#5865F2', leaderboard: '#ffd700' },
                limits: { maxImagesPerRequest: 1 },
                musicUrl: 'https://www.youtube.com/embed/BtEkzZoUCpw?autoplay=1&loop=1',
                updateInterval: 60
            },
            maintenance: { enabled: false },
            testMode: { enabled: false }
        };
        guildConfigs[guildId] = defaultConfig;
        await set(ref(db, `guilds/${guildId}/config`), defaultConfig);
    }
}

async function loadTestMode(guildId) {
    const testRef = ref(db, `guilds/${guildId}/config/testMode`);
    const snap = await get(testRef);
    testModeEnabled = snap.val()?.enabled === true;
    updateTestModeIndicator();
}

async function loadMaintenanceStatus(guildId) {
    const maintRef = ref(db, `guilds/${guildId}/config/maintenance`);
    const snap = await get(maintRef);
    const enabled = snap.val()?.enabled === true;
    const overlay = document.getElementById('maintenanceOverlay');
    const statusSpan = document.getElementById('maintenanceStatusText');
    if (enabled) {
        overlay?.classList.remove('hidden');
        if (statusSpan) statusSpan.textContent = 'Enabled';
    } else {
        overlay?.classList.add('hidden');
        if (statusSpan) statusSpan.textContent = 'Disabled';
    }
}

async function loadGuildData(guildId) {
    onValue(ref(db, `guilds/${guildId}/users`), (snapshot) => {
        allUsersData = snapshot.val() || {};
        const search = document.getElementById('leaderboardSearch')?.value || '';
        renderLeaderboard(search);
        updateBotStatus();
    });
    onValue(ref(db, `guilds/${guildId}/requests`), (snapshot) => {
        const data = snapshot.val();
        updateProfileHistory(data);
        if (hasAdminPermission(guildId)) updateAdminPending(data);
    });
    if (hasGuildLeaderPermission(guildId) || isPanelOwner()) {
        onValue(ref(db, `guilds/${guildId}/logs/kicks`), (snapshot) => updateKickLogs(snapshot.val()));
    }
}

// ==========================================
// 8. DASHBOARD
// ==========================================

function showDashboard() {
    stopMusic();
    document.getElementById('robloxPage').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('userWelcome').textContent = `Hi, ${currentUser.global_name || currentUser.username}`;
    if (currentUser.avatar) {
        document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
    }
    updatePermissions();
    loadLeaderboard();
    if (hasAdminPermission(currentGuildId) || isPanelOwner()) loadAdminData();
    if (isPanelOwner()) loadPanelOwnerData();
    updateBotStatus();
    setInterval(updateBotStatus, 60000);
}

function loadPanelOwnerData() {
    loadAdminRolesList();
    loadChannelConfigUI();
    loadSystemConfigUI();
    loadSavedMessages();
    loadRegisteredUsersCount();
    loadKickLogs();
}

// ==========================================
// 9. LEADERBOARD
// ==========================================

function renderLeaderboard(filter) {
    const body = document.getElementById('leaderboardBody');
    if (!body) return;
    body.innerHTML = '';
    let users = Object.values(allUsersData).filter(u => u.totalGP > 0).sort((a,b) => b.totalGP - a.totalGP);
    if (filter) {
        const f = filter.toLowerCase();
        users = users.filter(u => (u.discordName?.toLowerCase().includes(f) || u.discordUsername?.toLowerCase().includes(f) || u.robloxName?.toLowerCase().includes(f)));
    }
    users.forEach((u, i) => {
        body.innerHTML += `<tr><td>#${i+1}</td><td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.discordName)}</span><span class="username-handle">@${escapeHtml(u.discordUsername)}</span></div></td><td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.robloxName)}</span><span class="username-handle">@${escapeHtml(u.robloxUsername)}</span></div></td><td style="color:#48bb78;font-weight:bold;">${(u.totalGP || 0).toLocaleString()} GP</td></tr>`;
    });
    if (users.length === 0) body.innerHTML = '<tr><td colspan="4" style="text-align:center;">No users with GP</td></tr>';
    const total = Object.values(allUsersData).reduce((s,u) => s + (u.totalGP||0),0);
    document.getElementById('totalGpStat').textContent = total.toLocaleString();
}

function loadLeaderboard() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/users`), (snapshot) => {
        allUsersData = snapshot.val() || {};
        renderLeaderboard(document.getElementById('leaderboardSearch')?.value || '');
    });
}

// ==========================================
// 10. PROFILE HISTORY
// ==========================================

function updateProfileHistory(data) {
    const body = document.getElementById('profileHistoryBody');
    if (!body) return;
    body.innerHTML = '';
    if (!data || !currentUser) return;
    const requests = Object.values(data).filter(r => r.userId === currentUser.id).sort((a,b) => b.timestamp - a.timestamp);
    requests.forEach(req => {
        const date = new Date(req.timestamp).toLocaleString();
        let statusHtml = req.status === 'pending' ? '<span class="status-badge status-pending">Pending</span>' : (req.status === 'approved' ? '<span class="status-badge status-approved">Approved</span>' : '<span class="status-badge status-rejected">Rejected</span>');
        body.innerHTML += `<tr><td>${date}</td><td>+${req.amount.toLocaleString()} GP</td><td>${statusHtml}</td><td>${escapeHtml(req.adminComment || '-')}</td></tr>`;
    });
    if (requests.length === 0) body.innerHTML = '<tr><td colspan="4">No requests</td></tr>';
}

// ==========================================
// 11. ADMIN PENDING
// ==========================================

function updateAdminPending(data) {
    const body = document.getElementById('adminPendingBody');
    if (!body) return;
    body.innerHTML = '';
    if (!data) { body.innerHTML = '<tr><td colspan="4">No pending requests</td></tr>'; return; }
    const pending = Object.values(data).filter(r => r.status === 'pending').sort((a,b) => a.timestamp - b.timestamp);
    if (pending.length === 0) { body.innerHTML = '<tr><td colspan="4">No pending requests</td></tr>'; return; }
    pending.forEach(req => {
        body.innerHTML += `
            <tr>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(req.discordName)}</span><span class="username-handle">@${escapeHtml(req.discordUsername)}</span></div></td>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(req.robloxName)}</span><span class="username-handle">@${escapeHtml(req.robloxUsername)}</span></div></td>
                <td style="color:#cd7f32;">+${req.amount.toLocaleString()} GP</td>
                <td>
                    <input type="text" id="comment_${req.id}" placeholder="Comment" style="width:100%; margin-bottom:5px;">
                    <button class="btn-small btn-approve" onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'approve', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">Approve</button>
                    <button class="btn-small btn-deny" onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'reject', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">Reject</button>
                </td>
            </tr>
        `;
    });
}

function loadAdminData() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/requests`), (snapshot) => updateAdminPending(snapshot.val()));
}

// ==========================================
// 12. ADMIN ACTIONS (MIT COMMENT)
// ==========================================

window.handleAdminAction = async (reqId, userId, amount, action, dbKey, robloxId, discordName, discordUsername, robloxName, robloxUsername) => {
    const commentInput = document.getElementById(`comment_${reqId}`);
    const adminComment = commentInput?.value.trim() || '';
    if (!confirm(`${action === 'approve' ? 'APPROVE' : 'REJECT'} request? ${adminComment ? `\nComment: ${adminComment}` : ''}`)) return;
    
    if (testModeEnabled) {
        showNotify(`🔬 TEST MODE: ${action} simulated`, 'warning');
        await update(ref(db, `guilds/${currentGuildId}/requests/${reqId}`), { status: action === 'approve' ? 'approved' : 'rejected', adminComment, processedAt: Date.now(), processedBy: currentUser.id, testMode: true });
        showNotify(`Test: ${action}ed`, 'success');
        return;
    }
    
    try {
        await update(ref(db, `guilds/${currentGuildId}/requests/${reqId}`), { status: action === 'approve' ? 'approved' : 'rejected', adminComment, processedAt: Date.now(), processedBy: currentUser.id });
        let newTotal = 0;
        if (action === 'approve') {
            const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
            const snap = await get(userRef);
            newTotal = (snap.val()?.totalGP || 0) + amount;
            await update(userRef, { totalGP: newTotal });
        }
        // Optionale Discord-Benachrichtigung
        showNotify(`Request ${action}ed`, 'success');
    } catch(e) { alert('Error: '+e.message); }
};

// ==========================================
// 13. GUILD LEADER & PANEL OWNER FUNKTIONEN
// ==========================================

async function loadAdminRolesList() {
    const container = document.getElementById('adminRolesList');
    if (!container) return;
    const cfg = guildConfigs[currentGuildId] || {};
    const adminRoles = cfg.adminRoles || [];
    const ownerRoles = cfg.ownerRoles || [];
    let html = '<table class="table"><thead><tr><th>Role Name</th><th>Role ID</th><th>Type</th><th>Action</th></tr></thead><tbody>';
    for (const role of adminRoles) {
        const name = await fetchRoleName(role);
        html += `<tr><td class="role-name">${escapeHtml(name)}</td><td class="role-id">${escapeHtml(role)}</td><td><span class="status-badge status-approved">Admin</span></td><td><button class="btn-small btn-remove-role" onclick="removeAdminRole('${role}')">Remove</button></td></tr>`;
    }
    for (const role of ownerRoles) {
        const name = await fetchRoleName(role);
        html += `<tr><td class="role-name">${escapeHtml(name)}</td><td class="role-id">${escapeHtml(role)}</td><td><span class="status-badge status-pending">Guild Leader</span></td><td><button class="btn-small btn-remove-role" onclick="removeOwnerRole('${role}')">Remove</button></td></tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

window.addAdminRole = async () => {
    const roleId = document.getElementById('newRoleId').value.trim();
    const level = document.getElementById('rolePermissionLevel').value;
    if (!roleId) { showNotify('Enter role ID','error'); return; }
    const cfg = guildConfigs[currentGuildId] || {};
    let admin = cfg.adminRoles || [];
    let owner = cfg.ownerRoles || [];
    if (level === 'admin') { if (!admin.includes(roleId)) admin.push(roleId); }
    else { if (!owner.includes(roleId)) owner.push(roleId); }
    await set(ref(db, `guilds/${currentGuildId}/config`), { ...cfg, adminRoles: admin, ownerRoles: owner });
    guildConfigs[currentGuildId].adminRoles = admin;
    guildConfigs[currentGuildId].ownerRoles = owner;
    showNotify(`Role added as ${level === 'admin' ? 'Admin' : 'Guild Leader'}`, 'success');
    document.getElementById('newRoleId').value = '';
    await loadAdminRolesList();
    await fetchUserRoles(currentUser.id, currentGuildId);
    updatePermissions();
};

window.removeAdminRole = async (roleId) => {
    const cfg = guildConfigs[currentGuildId] || {};
    let admin = (cfg.adminRoles || []).filter(r => r !== roleId);
    await set(ref(db, `guilds/${currentGuildId}/config`), { ...cfg, adminRoles: admin });
    guildConfigs[currentGuildId].adminRoles = admin;
    showNotify('Role removed', 'success');
    await loadAdminRolesList();
    await fetchUserRoles(currentUser.id, currentGuildId);
    updatePermissions();
};

window.removeOwnerRole = async (roleId) => {
    const cfg = guildConfigs[currentGuildId] || {};
    let owner = (cfg.ownerRoles || []).filter(r => r !== roleId);
    await set(ref(db, `guilds/${currentGuildId}/config`), { ...cfg, ownerRoles: owner });
    guildConfigs[currentGuildId].ownerRoles = owner;
    showNotify('Role removed', 'success');
    await loadAdminRolesList();
    await fetchUserRoles(currentUser.id, currentGuildId);
    updatePermissions();
};

async function loadChannelConfigUI() {
    const container = document.getElementById('channelConfigList');
    if (!container) return;
    const channels = guildConfigs[currentGuildId]?.channels || {};
    const items = [
        { key: 'CH_LEAVE_LOGS', name: '📤 Leave Logs', desc: 'User leave notifications' },
        { key: 'CH_USER_INFO', name: '🛡️ User Info Board', desc: 'Member info board' },
        { key: 'CH_PANEL_INFO', name: '💻 Panel Info Board', desc: 'Registration board' },
        { key: 'CH_LEADERBOARD', name: '🏆 Leaderboard', desc: 'GP leaderboard channel' },
        { key: 'CH_GP_REQUESTS', name: '💎 GP Requests', desc: 'New GP requests channel' },
        { key: 'CH_GP_PROCESSED', name: '✅ GP Processed', desc: 'Approved/rejected channel' },
        { key: 'CH_LOGIN_LOGS', name: '🔐 Login Logs', desc: 'User login notifications' },
        { key: 'CH_BOT_DM_LOGS', name: '📨 Bot DM Logs', desc: '/admin command logs' }
    ];
    container.innerHTML = items.map(i => `
        <div class="channel-config-item">
            <div class="channel-config-name">${i.name}</div>
            <div class="channel-config-description">${i.desc}</div>
            <div class="channel-config-input">
                <input type="text" id="cfg_${i.key}" value="${channels[i.key] || ''}" placeholder="Channel ID">
            </div>
        </div>
    `).join('');
}

async function saveChannelConfig() {
    const keys = ['CH_LEAVE_LOGS', 'CH_USER_INFO', 'CH_PANEL_INFO', 'CH_LEADERBOARD', 'CH_GP_REQUESTS', 'CH_GP_PROCESSED', 'CH_LOGIN_LOGS', 'CH_BOT_DM_LOGS'];
    const newChannels = {};
    for (const k of keys) {
        const val = document.getElementById(`cfg_${k}`)?.value.trim();
        if (val) newChannels[k] = val;
    }
    const cfg = guildConfigs[currentGuildId] || {};
    cfg.channels = newChannels;
    await set(ref(db, `guilds/${currentGuildId}/config/channels`), newChannels);
    guildConfigs[currentGuildId] = cfg;
    showNotify('Channel config saved', 'success');
}

function updateKickLogs(data) {
    const body = document.getElementById('kickLogsBody');
    if (!body) return;
    body.innerHTML = '';
    if (!data) { body.innerHTML = '<tr><td colspan="5">No kick logs</td></tr>'; return; }
    const logs = Object.values(data).sort((a,b) => b.timestamp - a.timestamp);
    logs.forEach(log => {
        body.innerHTML += `<tr><td>${new Date(log.timestamp).toLocaleString()}</td><td>${escapeHtml(log.kickedUserName)} (${log.kickedUserId})</td><td>${escapeHtml(log.kickedByUserName)}</td><td>${escapeHtml(log.reason)}</td><td>${log.dmSent ? '✅' : '❌'}</td></tr>`;
    });
}

function loadKickLogs() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/logs/kicks`), (snap) => updateKickLogs(snap.val()));
}

async function loadRegisteredUsersCount() {
    const snap = await get(ref(db, `guilds/${currentGuildId}/users`));
    const users = snap.val() || {};
    let total = Object.values(users).filter(u => u.robloxId && u.robloxId !== '1').length;
    document.getElementById('statTotalUsers').textContent = total;
}

function loadSystemConfigUI() {
    const sys = guildConfigs[currentGuildId]?.system || {};
    const ec = sys.embedColors || {};
    document.getElementById('colorApprove').value = ec.approve || '#48bb78';
    document.getElementById('colorReject').value = ec.reject || '#f56565';
    document.getElementById('colorPending').value = ec.pending || '#cd7f32';
    document.getElementById('colorInfo').value = ec.info || '#5865F2';
    document.getElementById('colorLeaderboard').value = ec.leaderboard || '#ffd700';
    document.getElementById('maxImagesPerRequest').value = sys.limits?.maxImagesPerRequest || 1;
    document.getElementById('loginMusicUrl').value = sys.musicUrl || '';
    document.getElementById('updateInterval').value = sys.updateInterval || 60;
    document.getElementById('gpSubmitRoleId').value = guildConfigs[currentGuildId]?.gpSubmitRole || '';
}

async function saveSystemConfig() {
    const newSys = {
        embedColors: {
            approve: document.getElementById('colorApprove').value,
            reject: document.getElementById('colorReject').value,
            pending: document.getElementById('colorPending').value,
            info: document.getElementById('colorInfo').value,
            leaderboard: document.getElementById('colorLeaderboard').value
        },
        limits: { maxImagesPerRequest: parseInt(document.getElementById('maxImagesPerRequest').value) },
        musicUrl: document.getElementById('loginMusicUrl').value,
        updateInterval: parseInt(document.getElementById('updateInterval').value)
    };
    const cfg = guildConfigs[currentGuildId] || {};
    cfg.system = newSys;
    await set(ref(db, `guilds/${currentGuildId}/config/system`), newSys);
    guildConfigs[currentGuildId] = cfg;
    showNotify('System config saved', 'success');
}

async function saveGpSubmitRole() {
    const roleId = document.getElementById('gpSubmitRoleId').value.trim();
    if (!roleId) { showNotify('Enter role ID', 'error'); return; }
    const cfg = guildConfigs[currentGuildId] || {};
    cfg.gpSubmitRole = roleId;
    await set(ref(db, `guilds/${currentGuildId}/config/gpSubmitRole`), roleId);
    guildConfigs[currentGuildId] = cfg;
    showNotify('GP Submit role saved', 'success');
    updatePermissions();
}

// ==========================================
// 14. SAVED MESSAGES (guild-spezifisch)
// ==========================================

async function loadSavedMessages() {
    const container = document.getElementById('savedMessagesList');
    if (!container) return;
    onValue(ref(db, `guilds/${currentGuildId}/saved_messages`), (snap) => {
        const data = snap.val();
        if (!data) { container.innerHTML = '<p style="color:#666;">No saved messages</p>'; return; }
        container.innerHTML = '';
        Object.entries(data).forEach(([id, msg]) => {
            container.innerHTML += `
                <div class="saved-message-item" data-id="${id}">
                    <div class="message-name">📝 ${escapeHtml(msg.name)}</div>
                    <div class="message-channel">📡 Channel: ${escapeHtml(msg.channelId)}</div>
                    <div class="message-preview">${escapeHtml(msg.content?.substring(0,100))}</div>
                    <div class="message-actions">
                        <button class="btn-edit-message" onclick="editSavedMessage('${id}')">Edit</button>
                        <button class="btn-send-message" onclick="sendSavedMessage('${id}')">Send</button>
                        <button class="btn-delete-message" onclick="deleteSavedMessage('${id}')">Delete</button>
                    </div>
                </div>
            `;
        });
    });
}

window.editSavedMessage = async (id) => {
    const snap = await get(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`));
    const msg = snap.val();
    if (!msg) return;
    currentEditingMessageId = id;
    document.getElementById('messageName').value = msg.name || '';
    document.getElementById('messageChannelId').value = msg.channelId || '';
    document.getElementById('messageContent').value = msg.content || '';
    document.getElementById('messageEmbedTitle').value = msg.embedTitle || '';
    document.getElementById('messageEmbedDesc').value = msg.embedDesc || '';
    document.getElementById('messageEmbedColor').value = msg.embedColor || '#5865F2';
    document.getElementById('saveMessageBtn').textContent = '✏️ Update';
    showNotify(`Editing "${msg.name}"`, 'success');
};

async function saveMessage() {
    const name = document.getElementById('messageName').value.trim();
    const channelId = document.getElementById('messageChannelId').value.trim();
    const content = document.getElementById('messageContent').value;
    const embedTitle = document.getElementById('messageEmbedTitle').value;
    const embedDesc = document.getElementById('messageEmbedDesc').value;
    const embedColor = document.getElementById('messageEmbedColor').value;
    if (!name || !channelId) { showNotify('Name and Channel ID required', 'error'); return; }
    const msgData = { name, channelId, content, embedTitle, embedDesc, embedColor, updatedAt: Date.now(), updatedBy: currentUser.id };
    try {
        if (currentEditingMessageId) {
            await update(ref(db, `guilds/${currentGuildId}/saved_messages/${currentEditingMessageId}`), msgData);
            showNotify('Message updated', 'success');
            currentEditingMessageId = null;
            document.getElementById('saveMessageBtn').textContent = '💾 Save';
        } else {
            await push(ref(db, `guilds/${currentGuildId}/saved_messages`), { ...msgData, createdAt: Date.now() });
            showNotify('Message saved', 'success');
        }
        clearMessageForm();
        loadSavedMessages();
    } catch(e) { showNotify('Error saving', 'error'); }
}

window.sendSavedMessage = async (id) => {
    const snap = await get(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`));
    const msg = snap.val();
    if (!msg || !msg.channelId) { showNotify('No channel ID', 'error'); return; }
    let embeds = null;
    if (msg.embedTitle || msg.embedDesc) {
        embeds = [{ title: msg.embedTitle, description: msg.embedDesc, color: parseInt(msg.embedColor?.replace('#',''),16) || 0x5865F2 }];
    }
    const res = await fetch(`${BACKEND_URL}/send-channel-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: msg.channelId, content: msg.content, embeds })
    });
    if (res.ok) showNotify('Message sent', 'success');
    else showNotify('Failed to send', 'error');
};

window.deleteSavedMessage = async (id) => {
    if (!confirm('Delete this message?')) return;
    await remove(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`));
    showNotify('Deleted', 'success');
    loadSavedMessages();
};

function clearMessageForm() {
    currentEditingMessageId = null;
    document.getElementById('messageName').value = '';
    document.getElementById('messageChannelId').value = '';
    document.getElementById('messageContent').value = '';
    document.getElementById('messageEmbedTitle').value = '';
    document.getElementById('messageEmbedDesc').value = '';
    document.getElementById('messageEmbedColor').value = '#5865F2';
    document.getElementById('saveMessageBtn').textContent = '💾 Save';
}

// ==========================================
// 15. MAINTENANCE & TEST MODE (NUR PANEL OWNER)
// ==========================================

async function setMaintenanceMode(enabled) {
    if (!isPanelOwner()) { showNotify('Only Panel Owner', 'error'); return; }
    await set(ref(db, `guilds/${currentGuildId}/config/maintenance`), { enabled });
    loadMaintenanceStatus(currentGuildId);
    showNotify(`Maintenance ${enabled ? 'ON' : 'OFF'}`, enabled ? 'warning' : 'success');
}

async function setTestMode(enabled) {
    if (!isPanelOwner()) { showNotify('Only Panel Owner', 'error'); return; }
    await set(ref(db, `guilds/${currentGuildId}/config/testMode`), { enabled });
    testModeEnabled = enabled;
    updateTestModeIndicator();
    showNotify(`Test mode ${enabled ? 'ON' : 'OFF'}`, enabled ? 'warning' : 'success');
}

// ==========================================
// 16. IMAGE UPLOAD & GP SUBMIT
// ==========================================

function updateImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    const countSpan = document.getElementById('fileCountText');
    const max = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    countSpan.textContent = `${selectedFiles.length} / ${max} selected`;
    container.innerHTML = '';
    selectedFiles.forEach((f, idx) => {
        const div = document.createElement('div');
        div.className = 'preview-box';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        const btn = document.createElement('button');
        btn.className = 'remove-img-btn';
        btn.innerHTML = '&times;';
        btn.onclick = () => { selectedFiles.splice(idx,1); updateImagePreviews(); };
        div.appendChild(img); div.appendChild(btn);
        container.appendChild(div);
    });
}

async function submitGPRequest() {
    if (!hasGpSubmitPermission(currentGuildId)) { showNotify('No permission', 'error'); return; }
    const amount = parseInt(document.getElementById('gpAmount').value);
    const maxImages = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    if (isNaN(amount) || amount <= 0) { alert('Valid amount'); return; }
    if (selectedFiles.length === 0) { alert('At least one screenshot'); return; }
    if (selectedFiles.length > maxImages) { alert(`Max ${maxImages} images`); return; }
    const btn = document.getElementById('addGPBtn');
    btn.disabled = true; btn.textContent = 'SENDING...';
    try {
        const dbKey = getSafeDbKey(currentUser.username);
        const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
        const snap = await get(userRef);
        const user = snap.val() || {};
        const reqRef = push(ref(db, `guilds/${currentGuildId}/requests`));
        await set(reqRef, {
            id: reqRef.key, dbKey, userId: currentUser.id,
            discordName: user.discordName || currentUser.global_name,
            discordUsername: user.discordUsername || currentUser.username,
            robloxName: user.robloxName || 'Unknown',
            robloxUsername: user.robloxUsername || 'Unknown',
            robloxId: user.robloxId || '1',
            amount, status: 'pending', timestamp: Date.now()
        });
        showNotify('Request submitted', 'success');
        document.getElementById('gpAmount').value = '';
        selectedFiles = [];
        updateImagePreviews();
        switchTab('Profile');
    } catch(e) { alert('Error: '+e.message); }
    finally { btn.disabled = false; btn.textContent = 'SUBMIT PROOF FOR REVIEW'; }
}

// ==========================================
// 17. LOGIN & AUTH
// ==========================================

async function doLiveCheck() {
    if (!currentUser || !currentGuildId) return false;
    try {
        const res = await fetch(`${BACKEND_URL}/check-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, guildId: currentGuildId })
        });
        const data = await res.json();
        if (!data.isMember) forceKickUser();
        return data.isMember;
    } catch(e) { forceKickUser(); return false; }
}

function startLiveMemberCheck() {
    if (liveCheckInterval) clearInterval(liveCheckInterval);
    liveCheckInterval = setInterval(doLiveCheck, 30000);
}

function forceKickUser() {
    if (liveCheckInterval) clearInterval(liveCheckInterval);
    sessionStorage.removeItem('pn_session');
    currentUser = null;
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('robloxPage').classList.add('hidden');
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('noPermissionPage').classList.remove('hidden');
    stopMusic();
}

async function handleDiscordLogin(code) {
    try {
        const res = await fetch(`${BACKEND_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
        });
        const data = await res.json();
        if (data.isAuthorized) {
            currentUser = data.user;
            sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
            window.history.replaceState({}, '', REDIRECT_URI);
            // Guilds laden und Auswahl anzeigen
            await loadAvailableGuilds();
            if (availableGuilds.length === 0) {
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('noPermissionPage').classList.remove('hidden');
            } else if (availableGuilds.length === 1) {
                await selectGuild(availableGuilds[0].id);
            } else {
                document.getElementById('loginPage').classList.add('hidden');
                showGuildSelector();
            }
        } else {
            alert('Login failed');
        }
    } catch(e) { alert('Error'); console.error(e); }
}

async function handleRobloxLogin(code) {
    try {
        currentUser = JSON.parse(sessionStorage.getItem('pn_session'));
        const res = await fetch(`${BACKEND_URL}/roblox-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
        });
        const data = await res.json();
        if (data.success && data.robloxUser) {
            const rName = data.robloxUser.nickname || data.robloxUser.name;
            const rUsername = data.robloxUser.preferred_username || data.robloxUser.name;
            const rId = data.robloxUser.sub;
            const dbKey = getSafeDbKey(currentUser.username);
            const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
            const snap = await get(userRef);
            const currentGP = snap.val()?.totalGP || 0;
            await set(userRef, {
                discordName: currentUser.global_name || currentUser.username,
                discordUsername: currentUser.username,
                robloxName: rName,
                robloxUsername: rUsername,
                robloxId: rId,
                totalGP: currentGP,
                id: currentUser.id
            });
            await updateDiscordNickname(currentUser.id, rName, rUsername);
            window.location.href = REDIRECT_URI;
        }
    } catch(e) { alert('Roblox link error'); }
}

// ==========================================
// 18. EVENT LISTENERS & INIT
// ==========================================

document.getElementById('discordLoginBtn')?.addEventListener('click', () => {
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds&state=discord`;
});
document.getElementById('robloxLoginBtn')?.addEventListener('click', () => {
    window.location.href = `https://apis.roblox.com/oauth/v1/authorize?client_id=${ROBLOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=roblox`;
});
document.getElementById('dcLogoutBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem('pn_session');
    window.location.href = REDIRECT_URI;
});
document.getElementById('changeGuildBtn')?.addEventListener('click', async () => {
    await loadAvailableGuilds();
    showGuildSelector();
});
document.getElementById('rbxLogoutBtn')?.addEventListener('click', async () => {
    if (!confirm('Disconnect Roblox?')) return;
    const dbKey = getSafeDbKey(currentUser.username);
    await update(ref(db, `guilds/${currentGuildId}/users/${dbKey}`), { robloxId: null, robloxName: null, robloxUsername: null });
    window.location.reload();
});
document.getElementById('leaderboardSearch')?.addEventListener('input', (e) => renderLeaderboard(e.target.value));
document.getElementById('proofImage')?.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    const max = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    if (selectedFiles.length + newFiles.length > max) { alert(`Max ${max} images`); return; }
    selectedFiles = selectedFiles.concat(newFiles);
    updateImagePreviews();
    e.target.value = '';
});
document.getElementById('addGPBtn')?.addEventListener('click', submitGPRequest);
document.getElementById('tabBtnSpenden')?.addEventListener('click', () => switchTab('Spenden'));
document.getElementById('tabBtnLeaderboard')?.addEventListener('click', () => switchTab('Leaderboard'));
document.getElementById('tabBtnProfile')?.addEventListener('click', () => switchTab('Profile'));
document.getElementById('tabBtnAdmin')?.addEventListener('click', () => {
    if (hasAdminPermission(currentGuildId) || isPanelOwner()) switchTab('Admin');
    else showNotify('No permission', 'error');
});
document.getElementById('tabBtnGuildLeader')?.addEventListener('click', () => {
    if (hasGuildLeaderPermission(currentGuildId) || isPanelOwner()) switchTab('GuildLeader');
    else showNotify('No permission', 'error');
});
document.getElementById('tabBtnPanelOwner')?.addEventListener('click', () => {
    if (isPanelOwner()) switchTab('PanelOwner');
    else showNotify('No permission', 'error');
});
document.getElementById('addRoleBtn')?.addEventListener('click', window.addAdminRole);
document.getElementById('saveChannelConfigBtn')?.addEventListener('click', saveChannelConfig);
document.getElementById('saveSystemConfigBtn')?.addEventListener('click', saveSystemConfig);
document.getElementById('saveGpSubmitRoleBtn')?.addEventListener('click', saveGpSubmitRole);
document.getElementById('refreshUsersBtn')?.addEventListener('click', loadRegisteredUsersCount);
document.getElementById('enableTestModeBtn')?.addEventListener('click', () => setTestMode(true));
document.getElementById('disableTestModeBtn')?.addEventListener('click', () => setTestMode(false));
document.getElementById('saveMessageBtn')?.addEventListener('click', saveMessage);
document.getElementById('sendMessageBtn')?.addEventListener('click', () => {
    if (currentEditingMessageId) sendSavedMessage(currentEditingMessageId);
    else saveMessage();
});
document.getElementById('clearMessageFormBtn')?.addEventListener('click', clearMessageForm);
document.getElementById('enableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(true));
document.getElementById('disableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(false));

// APP START
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');
if (code) {
    if (state === 'discord') handleDiscordLogin(code);
    else if (state === 'roblox') handleRobloxLogin(code);
} else {
    const saved = sessionStorage.getItem('pn_session');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            (async () => {
                await loadAvailableGuilds();
                if (availableGuilds.length === 1) await selectGuild(availableGuilds[0].id);
                else if (availableGuilds.length > 1) showGuildSelector();
                else { document.getElementById('loginPage').classList.add('hidden'); document.getElementById('noPermissionPage').classList.remove('hidden'); }
            })();
        } catch(e) { sessionStorage.removeItem('pn_session'); playLoginMusic(); }
    } else {
        playLoginMusic();
    }
}
