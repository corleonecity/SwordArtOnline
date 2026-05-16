// ==========================================
// SWORD ART ONLINE - MULTI-GUILD GP PANEL
// ==========================================

// ==========================================
// 1. KONSTANTEN & GLOBALE VARIABLEN
// ==========================================

const PANEL_OWNER_USER_ID = '917426398120005653';
const DISCORD_CLIENT_ID = '1503179151073345678';
const ROBLOX_CLIENT_ID = '1529843549493669743';
const BACKEND_URL = 'https://gentle-queen-63f0.keulecolin2005.workers.dev';
const REDIRECT_URI = 'https://corleonecity.github.io/SwordArtOnline/';

let currentUser = null;           // Discord User Objekt
let currentGuildId = null;        // Ausgewählte Guild-ID
let availableGuilds = [];         // Liste der Guilds, in denen der User ist
let selectedFiles = [];
let allUsersData = {};
let liveCheckInterval = null;
let userGuildRoles = {};           // { guildId: [roleIds] }
let guildConfigs = {};             // { guildId: config }
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
// 2. HELFER-FUNKTIONEN
// ==========================================

function getSafeDbKey(username) {
    return username ? username.replace(/[.#$\[\]]/g, '_') : 'unknown';
}

function showNotify(msg, type) {
    const n = document.getElementById('notification');
    n.textContent = msg;
    n.className = `notification show ${type === 'success' ? 'bg-success' : (type === 'warning' ? 'bg-warning' : 'bg-error')}`;
    setTimeout(() => n.classList.remove('show'), 4000);
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
        indicator?.classList.remove('hidden');
        if (statusText) statusText.textContent = 'Enabled';
    } else {
        indicator?.classList.add('hidden');
        if (statusText) statusText.textContent = 'Disabled';
    }
}

function playLoginMusic() {
    // Wird später mit guildConfig abgespielt
}

function stopMusic() {
    const ac = document.getElementById('audioPlayerContainer');
    if (ac) ac.innerHTML = '';
}

// ==========================================
// 3. PERMISSIONS (guild-spezifisch)
// ==========================================

function isPanelOwner() {
    return currentUser && currentUser.id === PANEL_OWNER_USER_ID;
}

function hasAdminPermission(guildId) {
    if (!currentUser) return false;
    if (isPanelOwner()) return true;
    const roles = userGuildRoles[guildId] || [];
    const adminRoles = guildConfigs[guildId]?.adminRoles || [];
    return roles.some(r => adminRoles.includes(r));
}

function hasGuildLeaderPermission(guildId) {
    if (!currentUser) return false;
    if (isPanelOwner()) return true;
    const roles = userGuildRoles[guildId] || [];
    const ownerRoles = guildConfigs[guildId]?.ownerRoles || [];
    return roles.some(r => ownerRoles.includes(r));
}

function hasGpSubmitPermission(guildId) {
    if (!currentUser) return false;
    if (isPanelOwner()) return true;
    const roles = userGuildRoles[guildId] || [];
    const gpRole = guildConfigs[guildId]?.gpSubmitRole;
    return gpRole ? roles.includes(gpRole) : false;
}

// ==========================================
// 4. GUILD-AUSWAHL & KONFIGURATION LADEN
// ==========================================

async function loadAvailableGuilds() {
    if (!currentUser) return [];
    try {
        const res = await fetch(`${BACKEND_URL}/user-guilds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        if (res.ok) {
            const data = await res.json();
            availableGuilds = data.guilds || [];
            return availableGuilds;
        }
    } catch(e) { console.error(e); }
    return [];
}

async function loadGuildConfig(guildId) {
    const configRef = ref(db, `guilds/${guildId}/config`);
    const snap = await get(configRef);
    if (snap.exists()) {
        guildConfigs[guildId] = snap.val();
    } else {
        // Standardkonfiguration erstellen
        const defaultConfig = {
            adminRoles: [],
            ownerRoles: [],
            gpSubmitRole: '',
            channels: {},
            system: {
                embedColors: { approve: '#48bb78', reject: '#f56565', pending: '#cd7f32', info: '#5865F2', leaderboard: '#ffd700' },
                limits: { maxImagesPerRequest: 1 },
                musicUrl: 'https://www.youtube.com/embed/BtEkzZoUCpw?autoplay=1',
                updateInterval: 60
            },
            maintenance: { enabled: false },
            testMode: { enabled: false }
        };
        guildConfigs[guildId] = defaultConfig;
        await set(configRef, defaultConfig);
    }
}

async function loadTestMode(guildId) {
    const testRef = ref(db, `guilds/${guildId}/config/testMode`);
    const snap = await get(testRef);
    testModeEnabled = snap.exists() && snap.val().enabled === true;
    updateTestModeIndicator();
}

async function loadMaintenanceStatus(guildId) {
    const maintRef = ref(db, `guilds/${guildId}/config/maintenance`);
    const snap = await get(maintRef);
    if (snap.exists() && snap.val().enabled) {
        document.getElementById('maintenanceOverlay')?.classList.remove('hidden');
        document.getElementById('maintenanceStatusText').textContent = 'Enabled';
    } else {
        document.getElementById('maintenanceOverlay')?.classList.add('hidden');
        document.getElementById('maintenanceStatusText').textContent = 'Disabled';
    }
}

async function fetchUserRolesForGuild(guildId) {
    if (!currentUser) return [];
    try {
        const res = await fetch(`${BACKEND_URL}/user-roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, guildId })
        });
        if (res.ok) {
            const data = await res.json();
            userGuildRoles[guildId] = data.roles || [];
            return userGuildRoles[guildId];
        }
    } catch(e) { console.error(e); }
    return [];
}

async function selectGuild(guildId) {
    currentGuildId = guildId;
    document.getElementById('currentGuildDisplay').textContent = `📡 Server: ${guildId.substring(0,8)}...`;
    
    await loadGuildConfig(guildId);
    await loadTestMode(guildId);
    await loadMaintenanceStatus(guildId);
    await fetchUserRolesForGuild(guildId);
    
    // Daten laden
    loadLeaderboard();
    loadProfileHistory();
    if (hasAdminPermission(guildId)) loadAdminData();
    if (hasGuildLeaderPermission(guildId)) loadGuildLeaderData();
    
    updatePermissions();
    showDashboard();
    startLiveMemberCheck();
}

async function showGuildSelector() {
    // Entferne alte Overlays
    const old = document.querySelector('.guild-selector-overlay');
    if (old) old.remove();
    
    const container = document.createElement('div');
    container.className = 'guild-selector-overlay';
    container.innerHTML = `
        <div class="guild-selector-card">
            <i class="fas fa-server"></i>
            <h2>Select Discord Server</h2>
            <p>Choose which server you want to manage</p>
            <div id="guildList" class="guild-list"></div>
        </div>
    `;
    document.body.appendChild(container);
    
    const guildList = document.getElementById('guildList');
    guildList.innerHTML = '';
    for (const guild of availableGuilds) {
        const btn = document.createElement('button');
        btn.className = 'guild-selector-btn';
        btn.innerHTML = `
            ${guild.icon ? `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png" class="guild-icon">` : '<i class="fas fa-server"></i>'}
            <span>${escapeHtml(guild.name)}</span>
        `;
        btn.onclick = () => {
            container.remove();
            selectGuild(guild.id);
        };
        guildList.appendChild(btn);
    }
}

// ==========================================
// 5. PERMISSION UI UPDATES
// ==========================================

function updatePermissions() {
    const canSubmit = hasGpSubmitPermission(currentGuildId);
    const canAdmin = hasAdminPermission(currentGuildId);
    const canGuildLeader = hasGuildLeaderPermission(currentGuildId);
    const panelOwner = isPanelOwner();
    
    // GP Submit Card
    const gpCard = document.getElementById('gpSubmitCard');
    const noPermCard = document.getElementById('noPermissionCard');
    const spendenBtn = document.getElementById('tabBtnSpenden');
    if (canSubmit || panelOwner) {
        if (gpCard) gpCard.classList.remove('hidden');
        if (noPermCard) noPermCard.classList.add('hidden');
        if (spendenBtn) spendenBtn.style.display = 'block';
    } else {
        if (gpCard) gpCard.classList.add('hidden');
        if (noPermCard) noPermCard.classList.remove('hidden');
        if (spendenBtn) spendenBtn.style.display = 'none';
    }
    
    // Admin Tab
    const adminBtn = document.getElementById('tabBtnAdmin');
    if (adminBtn) adminBtn.style.display = (canAdmin || panelOwner) ? 'block' : 'none';
    
    // Guild Leader Tab (alle Konfigurationen)
    const guildLeaderBtn = document.getElementById('tabBtnGuildLeader');
    if (guildLeaderBtn) guildLeaderBtn.style.display = (canGuildLeader || panelOwner) ? 'block' : 'none';
    
    // Panel Owner Tab (nur für feste ID)
    const panelOwnerBtn = document.getElementById('tabBtnPanelOwner');
    if (panelOwnerBtn) panelOwnerBtn.style.display = panelOwner ? 'block' : 'none';
}

// ==========================================
// 6. DASHBOARD & DATEN LADEN
// ==========================================

function showDashboard() {
    stopMusic();
    document.getElementById('robloxPage')?.classList.add('hidden');
    document.getElementById('mainContent')?.classList.remove('hidden');
    document.getElementById('userWelcome').textContent = `Hi, ${currentUser?.global_name || currentUser?.username}`;
    if (currentUser?.avatar) {
        document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
    }
    updatePermissions();
}

function loadLeaderboard() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/users`), (snapshot) => {
        allUsersData = snapshot.val() || {};
        renderLeaderboard(document.getElementById('leaderboardSearch')?.value || '');
        updateTotalGP();
    });
}

function renderLeaderboard(filter) {
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;
    let users = Object.values(allUsersData).filter(u => u.totalGP > 0).sort((a,b) => (b.totalGP||0) - (a.totalGP||0));
    if (filter) {
        const f = filter.toLowerCase();
        users = users.filter(u => (u.discordName?.toLowerCase().includes(f) || u.discordUsername?.toLowerCase().includes(f) || u.robloxName?.toLowerCase().includes(f)));
    }
    tbody.innerHTML = '';
    users.forEach((u, i) => {
        tbody.innerHTML += `
            <tr>
                <td>#${i+1}</td>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.discordName||'?')}</span><span class="username-handle">@${escapeHtml(u.discordUsername||'?')}</span></div></td>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.robloxName||'?')}</span><span class="username-handle">@${escapeHtml(u.robloxUsername||'?')}</span></div></td>
                <td style="color:#48bb78; font-weight:bold;">${(u.totalGP||0).toLocaleString()} GP</td>
            </tr>
        `;
    });
    if (users.length === 0) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No GP yet</td></tr>';
}

function updateTotalGP() {
    const total = Object.values(allUsersData).reduce((s,u) => s + (u.totalGP||0), 0);
    const el = document.getElementById('totalGpStat');
    if (el) el.textContent = total.toLocaleString();
}

function loadProfileHistory() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/requests`), (snapshot) => {
        const data = snapshot.val();
        const tbody = document.getElementById('profileHistoryBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!data) return;
        const myReqs = Object.values(data).filter(r => r.userId === currentUser?.id).sort((a,b)=>b.timestamp - a.timestamp);
        myReqs.forEach(req => {
            const date = new Date(req.timestamp).toLocaleString();
            let statusHtml = req.status === 'pending' ? '<span class="status-badge status-pending">Pending</span>' : (req.status === 'approved' ? '<span class="status-badge status-approved">Approved</span>' : '<span class="status-badge status-rejected">Rejected</span>');
            tbody.innerHTML += `<tr><td>${date}</td><td>+${req.amount.toLocaleString()} GP</td><td>${statusHtml}</td><td>${escapeHtml(req.adminComment||'-')}</td></tr>`;
        });
        if (myReqs.length === 0) tbody.innerHTML = '<tr><td colspan="4">No requests</td></tr>';
    });
}

function loadAdminData() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/requests`), (snapshot) => {
        const data = snapshot.val();
        const tbody = document.getElementById('adminPendingBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!data) { tbody.innerHTML = '<tr><td colspan="4">No pending</td></tr>'; return; }
        const pending = Object.values(data).filter(r => r.status === 'pending').sort((a,b)=>a.timestamp - b.timestamp);
        pending.forEach(req => {
            tbody.innerHTML += `
                <tr>
                    <td><div class="user-name-cell"><span class="display-name">${escapeHtml(req.discordName||'?')}</span><span class="username-handle">@${escapeHtml(req.discordUsername||'?')}</span></div></td>
                    <td><div class="user-name-cell"><span class="display-name">${escapeHtml(req.robloxName||'?')}</span><span class="username-handle">@${escapeHtml(req.robloxUsername||'?')}</span></div></td>
                    <td>+${req.amount.toLocaleString()} GP</td>
                    <td>
                        <input type="text" id="comment_${req.id}" placeholder="Comment" style="width:100%; margin-bottom:5px;">
                        <div style="display:flex; gap:5px;">
                            <button class="btn-small btn-approve" onclick="window.handleAdminAction('${req.id}', 'approve', '${req.dbKey}', ${req.amount}, '${req.userId}')">Approve</button>
                            <button class="btn-small btn-deny" onclick="window.handleAdminAction('${req.id}', 'reject', '${req.dbKey}', ${req.amount}, '${req.userId}')">Reject</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        if (pending.length === 0) tbody.innerHTML = '<tr><td colspan="4">No pending</td></tr>';
    });
}

window.handleAdminAction = async (reqId, action, dbKey, amount, userId) => {
    const comment = document.getElementById(`comment_${reqId}`)?.value || '';
    if (!confirm(`${action === 'approve' ? 'Approve' : 'Reject'} request?`)) return;
    if (testModeEnabled) {
        showNotify(`TEST MODE: ${action} simulated`, 'warning');
        await update(ref(db, `guilds/${currentGuildId}/requests/${reqId}`), { status: action === 'approve' ? 'approved' : 'rejected', adminComment: comment, processedAt: Date.now(), testMode: true });
        return;
    }
    try {
        await update(ref(db, `guilds/${currentGuildId}/requests/${reqId}`), { status: action === 'approve' ? 'approved' : 'rejected', adminComment: comment, processedAt: Date.now() });
        if (action === 'approve') {
            const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
            const snap = await get(userRef);
            const currentGP = snap.val()?.totalGP || 0;
            await update(userRef, { totalGP: currentGP + amount });
        }
        showNotify(`Request ${action}d!`, 'success');
    } catch(e) { showNotify('Error', 'error'); }
};

function loadGuildLeaderData() {
    loadAdminRolesList();
    loadChannelConfigUI();
    loadSystemConfigUI();
    loadSavedMessages();
    loadRegisteredUsersCount();
    loadKickLogs();
}

// ==========================================
// 7. KONFIGURATIONS-FUNKTIONEN (Guild Leader)
// ==========================================

async function fetchRoleName(roleId) {
    if (roleNameCache[roleId]) return roleNameCache[roleId];
    try {
        const res = await fetch(`${BACKEND_URL}/role-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId, guildId: currentGuildId })
        });
        if (res.ok) {
            const data = await res.json();
            roleNameCache[roleId] = data.name || roleId;
            return roleNameCache[roleId];
        }
    } catch(e) {}
    return roleId;
}

async function loadAdminRolesList() {
    const container = document.getElementById('adminRolesList');
    if (!container) return;
    const config = guildConfigs[currentGuildId] || {};
    const adminRoles = config.adminRoles || [];
    const ownerRoles = config.ownerRoles || [];
    let html = '<table class="table"><thead><tr><th>Role Name</th><th>ID</th><th>Type</th><th></th></tr></thead><tbody>';
    for (const r of adminRoles) {
        const name = await fetchRoleName(r);
        html += `<tr><td class="role-name">${escapeHtml(name)}</td><td class="role-id">${r}</td><td>Admin</td><td><button class="btn-small btn-remove-role" onclick="removeAdminRole('${r}')">Remove</button></td></tr>`;
    }
    for (const r of ownerRoles) {
        const name = await fetchRoleName(r);
        html += `<tr><td class="role-name">${escapeHtml(name)}</td><td class="role-id">${r}</td><td>Guild Leader</td><td><button class="btn-small btn-remove-role" onclick="removeOwnerRole('${r}')">Remove</button></td></tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

window.addAdminRole = async () => {
    const roleId = document.getElementById('newRoleId').value.trim();
    const level = document.getElementById('rolePermissionLevel').value;
    if (!roleId) return showNotify('Enter role ID', 'error');
    const config = guildConfigs[currentGuildId] || {};
    if (level === 'admin') {
        if (!config.adminRoles) config.adminRoles = [];
        if (!config.adminRoles.includes(roleId)) config.adminRoles.push(roleId);
    } else {
        if (!config.ownerRoles) config.ownerRoles = [];
        if (!config.ownerRoles.includes(roleId)) config.ownerRoles.push(roleId);
    }
    await set(ref(db, `guilds/${currentGuildId}/config`), config);
    guildConfigs[currentGuildId] = config;
    showNotify('Role added', 'success');
    loadAdminRolesList();
    await fetchUserRolesForGuild(currentGuildId);
    updatePermissions();
};

window.removeAdminRole = async (roleId) => {
    const config = guildConfigs[currentGuildId];
    config.adminRoles = config.adminRoles.filter(r => r !== roleId);
    await set(ref(db, `guilds/${currentGuildId}/config`), config);
    guildConfigs[currentGuildId] = config;
    showNotify('Role removed', 'success');
    loadAdminRolesList();
    await fetchUserRolesForGuild(currentGuildId);
    updatePermissions();
};

window.removeOwnerRole = async (roleId) => {
    const config = guildConfigs[currentGuildId];
    config.ownerRoles = config.ownerRoles.filter(r => r !== roleId);
    await set(ref(db, `guilds/${currentGuildId}/config`), config);
    guildConfigs[currentGuildId] = config;
    showNotify('Role removed', 'success');
    loadAdminRolesList();
    await fetchUserRolesForGuild(currentGuildId);
    updatePermissions();
};

async function loadChannelConfigUI() {
    const container = document.getElementById('channelConfigList');
    if (!container) return;
    const channels = guildConfigs[currentGuildId]?.channels || {};
    const channelList = [
        { key: 'CH_LEAVE_LOGS', name: 'Leave Logs' },
        { key: 'CH_USER_INFO', name: 'User Info Board' },
        { key: 'CH_PANEL_INFO', name: 'Panel Info Board' },
        { key: 'CH_LEADERBOARD', name: 'Leaderboard Channel' },
        { key: 'CH_GP_REQUESTS', name: 'GP Requests Channel' },
        { key: 'CH_GP_PROCESSED', name: 'GP Processed Channel' },
        { key: 'CH_LOGIN_LOGS', name: 'Login Logs' },
        { key: 'CH_BOT_DM_LOGS', name: 'Bot DM Logs' },
        { key: 'ADMIN_PING_ROLE', name: 'Admin Ping Role ID' }
    ];
    container.innerHTML = channelList.map(ch => `
        <div class="channel-config-item">
            <div class="channel-config-name">${ch.name}</div>
            <div class="channel-config-input">
                <input type="text" id="cfg_${ch.key}" value="${channels[ch.key] || ''}" placeholder="Channel / Role ID">
            </div>
        </div>
    `).join('');
}

async function saveChannelConfig() {
    const channelList = ['CH_LEAVE_LOGS','CH_USER_INFO','CH_PANEL_INFO','CH_LEADERBOARD','CH_GP_REQUESTS','CH_GP_PROCESSED','CH_LOGIN_LOGS','CH_BOT_DM_LOGS','ADMIN_PING_ROLE'];
    const newChannels = {};
    for (const key of channelList) {
        const val = document.getElementById(`cfg_${key}`)?.value.trim();
        if (val) newChannels[key] = val;
    }
    const config = guildConfigs[currentGuildId];
    config.channels = newChannels;
    await set(ref(db, `guilds/${currentGuildId}/config/channels`), newChannels);
    guildConfigs[currentGuildId] = config;
    showNotify('Channel config saved', 'success');
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
    const config = guildConfigs[currentGuildId];
    config.system = newSys;
    await set(ref(db, `guilds/${currentGuildId}/config/system`), newSys);
    guildConfigs[currentGuildId] = config;
    showNotify('System config saved', 'success');
}

async function saveGpSubmitRole() {
    const roleId = document.getElementById('gpSubmitRoleId').value.trim();
    if (!roleId) return showNotify('Enter role ID', 'error');
    const config = guildConfigs[currentGuildId];
    config.gpSubmitRole = roleId;
    await set(ref(db, `guilds/${currentGuildId}/config/gpSubmitRole`), roleId);
    guildConfigs[currentGuildId] = config;
    showNotify('GP Submit role saved', 'success');
    updatePermissions();
}

async function loadRegisteredUsersCount() {
    const snap = await get(ref(db, `guilds/${currentGuildId}/users`));
    const users = snap.val() || {};
    let count = 0;
    for (const u of Object.values(users)) if (u.robloxId && u.robloxId !== '1') count++;
    document.getElementById('statTotalUsers').textContent = count;
}

function loadKickLogs() {
    onValue(ref(db, `guilds/${currentGuildId}/logs/kicks`), (snap) => {
        const tbody = document.getElementById('kickLogsBody');
        if (!tbody) return;
        const logs = snap.val();
        tbody.innerHTML = '';
        if (!logs) { tbody.innerHTML = '<tr><td colspan="5">No logs</td></tr>'; return; }
        Object.values(logs).sort((a,b)=>b.timestamp - a.timestamp).forEach(log => {
            tbody.innerHTML += `<tr><td>${new Date(log.timestamp).toLocaleString()}</td><td>${escapeHtml(log.kickedUserName||log.kickedUserId)}</td><td>${escapeHtml(log.kickedByUserName||log.kickedByUserId)}</td><td>${escapeHtml(log.reason)}</td><td>${log.dmSent ? '✅' : '❌'}</td></tr>`;
        });
    });
}

async function setMaintenanceMode(enabled) {
    if (!hasGuildLeaderPermission(currentGuildId) && !isPanelOwner()) return showNotify('No permission', 'error');
    await set(ref(db, `guilds/${currentGuildId}/config/maintenance`), { enabled });
    loadMaintenanceStatus(currentGuildId);
    showNotify(`Maintenance ${enabled ? 'ON' : 'OFF'}`, enabled ? 'warning' : 'success');
}

async function setTestMode(enabled) {
    if (!hasGuildLeaderPermission(currentGuildId) && !isPanelOwner()) return showNotify('No permission', 'error');
    await set(ref(db, `guilds/${currentGuildId}/config/testMode`), { enabled });
    testModeEnabled = enabled;
    updateTestModeIndicator();
    showNotify(`Test mode ${enabled ? 'ON' : 'OFF'}`, enabled ? 'warning' : 'success');
}

// ==========================================
// 8. SAVED MESSAGES
// ==========================================

async function loadSavedMessages() {
    const container = document.getElementById('savedMessagesList');
    if (!container) return;
    onValue(ref(db, `guilds/${currentGuildId}/saved_messages`), (snap) => {
        const msgs = snap.val();
        if (!msgs) { container.innerHTML = '<p>No saved messages</p>'; return; }
        container.innerHTML = '';
        Object.entries(msgs).forEach(([id, msg]) => {
            container.innerHTML += `
                <div class="saved-message-item">
                    <div class="message-name">${escapeHtml(msg.name)}</div>
                    <div class="message-channel">Channel: ${msg.channelId}</div>
                    <div class="message-preview">${escapeHtml(msg.content?.substring(0,100))}</div>
                    <div class="message-actions">
                        <button onclick="editSavedMessage('${id}')">Edit</button>
                        <button onclick="sendSavedMessage('${id}')">Send</button>
                        <button onclick="deleteSavedMessage('${id}')">Delete</button>
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
    document.getElementById('messageName').value = msg.name;
    document.getElementById('messageChannelId').value = msg.channelId;
    document.getElementById('messageContent').value = msg.content;
    document.getElementById('messageEmbedTitle').value = msg.embedTitle || '';
    document.getElementById('messageEmbedDesc').value = msg.embedDesc || '';
    document.getElementById('messageEmbedColor').value = msg.embedColor || '#5865F2';
    document.getElementById('saveMessageBtn').textContent = 'Update';
};

async function saveMessage() {
    const name = document.getElementById('messageName').value.trim();
    const channelId = document.getElementById('messageChannelId').value.trim();
    const content = document.getElementById('messageContent').value;
    const embedTitle = document.getElementById('messageEmbedTitle').value;
    const embedDesc = document.getElementById('messageEmbedDesc').value;
    const embedColor = document.getElementById('messageEmbedColor').value;
    if (!name || !channelId) return showNotify('Name and Channel ID required', 'error');
    const data = { name, channelId, content, embedTitle, embedDesc, embedColor, updatedAt: Date.now() };
    if (currentEditingMessageId) {
        await update(ref(db, `guilds/${currentGuildId}/saved_messages/${currentEditingMessageId}`), data);
        showNotify('Updated', 'success');
        currentEditingMessageId = null;
        document.getElementById('saveMessageBtn').textContent = 'Save';
    } else {
        await push(ref(db, `guilds/${currentGuildId}/saved_messages`), data);
        showNotify('Saved', 'success');
    }
    clearMessageForm();
}

window.sendSavedMessage = async (id) => {
    const snap = await get(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`));
    const msg = snap.val();
    if (!msg || !msg.channelId) return showNotify('Invalid message', 'error');
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
    else showNotify('Failed', 'error');
};

window.deleteSavedMessage = async (id) => {
    if (!confirm('Delete?')) return;
    await remove(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`));
    showNotify('Deleted', 'success');
};

function clearMessageForm() {
    currentEditingMessageId = null;
    document.getElementById('messageName').value = '';
    document.getElementById('messageChannelId').value = '';
    document.getElementById('messageContent').value = '';
    document.getElementById('messageEmbedTitle').value = '';
    document.getElementById('messageEmbedDesc').value = '';
    document.getElementById('messageEmbedColor').value = '#5865F2';
    document.getElementById('saveMessageBtn').textContent = 'Save';
}

// ==========================================
// 9. GP SUBMIT
// ==========================================

function updateImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    const countSpan = document.getElementById('fileCountText');
    const max = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    container.innerHTML = '';
    countSpan.textContent = `${selectedFiles.length}/${max}`;
    selectedFiles.forEach((f, i) => {
        const div = document.createElement('div');
        div.className = 'preview-box';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        const btn = document.createElement('button');
        btn.className = 'remove-img-btn';
        btn.innerHTML = '×';
        btn.onclick = () => { selectedFiles.splice(i,1); updateImagePreviews(); };
        div.appendChild(img);
        div.appendChild(btn);
        container.appendChild(div);
    });
}

async function submitGPRequest() {
    if (!hasGpSubmitPermission(currentGuildId) && !isPanelOwner()) return showNotify('No permission', 'error');
    const amount = parseInt(document.getElementById('gpAmount').value);
    if (isNaN(amount) || amount <= 0) return alert('Enter valid amount');
    const maxImages = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    if (selectedFiles.length === 0 || selectedFiles.length > maxImages) return alert(`Need 1-${maxImages} images`);
    const btn = document.getElementById('addGPBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        const dbKey = getSafeDbKey(currentUser.username);
        const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
        const snap = await get(userRef);
        const user = snap.val() || {};
        const reqRef = push(ref(db, `guilds/${currentGuildId}/requests`));
        const reqId = reqRef.key;
        await set(reqRef, {
            id: reqId,
            dbKey,
            userId: currentUser.id,
            discordName: user.discordName || currentUser.global_name,
            discordUsername: user.discordUsername || currentUser.username,
            robloxName: user.robloxName || 'Unknown',
            robloxUsername: user.robloxUsername || 'Unknown',
            robloxId: user.robloxId || '1',
            amount,
            status: 'pending',
            timestamp: Date.now()
        });
        showNotify('Request submitted', 'success');
        document.getElementById('gpAmount').value = '';
        selectedFiles = [];
        updateImagePreviews();
        switchTab('Profile');
    } catch(e) { showNotify('Error', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'SUBMIT PROOF'; }
}

// ==========================================
// 10. LOGIN & AUTH
// ==========================================

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
            const guilds = await loadAvailableGuilds();
            if (guilds.length === 0) {
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('noPermissionPage').classList.remove('hidden');
            } else {
                document.getElementById('loginPage').classList.add('hidden');
                if (guilds.length === 1) {
                    await selectGuild(guilds[0].id);
                } else {
                    showGuildSelector();
                }
            }
        } else {
            alert('Login failed');
        }
    } catch(e) { console.error(e); alert('Error'); }
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
            await set(userRef, {
                discordName: currentUser.global_name || currentUser.username,
                discordUsername: currentUser.username,
                robloxName: rName,
                robloxUsername: rUsername,
                robloxId: rId,
                totalGP: 0,
                id: currentUser.id
            });
            await updateDiscordNickname(currentUser.id, rName, rUsername);
            window.location.href = REDIRECT_URI;
        }
    } catch(e) { alert('Roblox link error'); }
}

async function updateDiscordNickname(userId, robloxName, robloxUsername) {
    try {
        await fetch(`${BACKEND_URL}/update-nickname`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, nickname: `${robloxName} (@${robloxUsername})`, guildId: currentGuildId })
        });
    } catch(e) {}
}

async function doLiveCheck() {
    if (!currentUser || !currentGuildId) return;
    const res = await fetch(`${BACKEND_URL}/check-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, guildId: currentGuildId })
    });
    if (!res.ok) forceKickUser();
    else {
        const data = await res.json();
        if (!data.isMember) forceKickUser();
    }
}

function startLiveMemberCheck() {
    if (liveCheckInterval) clearInterval(liveCheckInterval);
    liveCheckInterval = setInterval(doLiveCheck, 30000);
}

function forceKickUser() {
    if (liveCheckInterval) clearInterval(liveCheckInterval);
    sessionStorage.removeItem('pn_session');
    currentUser = null;
    currentGuildId = null;
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('robloxPage').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('noPermissionPage').classList.add('hidden');
    stopMusic();
}

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
    if (tabName === 'GuildLeader') loadGuildLeaderData();
    if (tabName === 'Admin') loadAdminData();
}

// ==========================================
// 11. EVENT LISTENER
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
    const max = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    const newFiles = Array.from(e.target.files);
    if (selectedFiles.length + newFiles.length > max) { alert(`Max ${max} images`); return; }
    selectedFiles = selectedFiles.concat(newFiles);
    updateImagePreviews();
    e.target.value = '';
});
document.getElementById('addGPBtn')?.addEventListener('click', submitGPRequest);
document.getElementById('tabBtnSpenden')?.addEventListener('click', () => switchTab('Spenden'));
document.getElementById('tabBtnLeaderboard')?.addEventListener('click', () => switchTab('Leaderboard'));
document.getElementById('tabBtnProfile')?.addEventListener('click', () => switchTab('Profile'));
document.getElementById('tabBtnAdmin')?.addEventListener('click', () => { if (hasAdminPermission(currentGuildId) || isPanelOwner()) switchTab('Admin'); else showNotify('No permission', 'error'); });
document.getElementById('tabBtnGuildLeader')?.addEventListener('click', () => { if (hasGuildLeaderPermission(currentGuildId) || isPanelOwner()) switchTab('GuildLeader'); else showNotify('No permission', 'error'); });
document.getElementById('tabBtnPanelOwner')?.addEventListener('click', () => { if (isPanelOwner()) switchTab('PanelOwner'); else showNotify('No permission', 'error'); });
document.getElementById('addRoleBtn')?.addEventListener('click', window.addAdminRole);
document.getElementById('saveChannelConfigBtn')?.addEventListener('click', saveChannelConfig);
document.getElementById('saveSystemConfigBtn')?.addEventListener('click', saveSystemConfig);
document.getElementById('saveGpSubmitRoleBtn')?.addEventListener('click', saveGpSubmitRole);
document.getElementById('refreshUsersBtn')?.addEventListener('click', loadRegisteredUsersCount);
document.getElementById('enableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(true));
document.getElementById('disableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(false));
document.getElementById('enableTestModeBtn')?.addEventListener('click', () => setTestMode(true));
document.getElementById('disableTestModeBtn')?.addEventListener('click', () => setTestMode(false));
document.getElementById('saveMessageBtn')?.addEventListener('click', saveMessage);
document.getElementById('sendMessageBtn')?.addEventListener('click', () => { if (currentEditingMessageId) sendSavedMessage(currentEditingMessageId); else showNotify('Select a message first', 'error'); });
document.getElementById('clearMessageFormBtn')?.addEventListener('click', clearMessageForm);

// ==========================================
// 12. INIT
// ==========================================

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
            if (!currentUser.id) throw new Error();
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
