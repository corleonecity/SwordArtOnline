// ==========================================
// 1. SETTINGS & CONFIGURATION
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
let userGuildRoles = {};
let guildConfigs = {};
let currentEditingMessageId = null;
let testModeEnabled = false;
let roleNameCache = {};

// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update, push, remove } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAjo_0WEf9qBH-EcKPNEY4PtBVGwxdHsbI",
    authDomain: "cc-shop-finanzsystem.firebaseapp.com",
    databaseURL: "https://cc-shop-finanzsystem-default-rtdb.firebaseio.com",
    projectId: "cc-shop-finanzsystem",
    storageBucket: "cc-shop-finanzsystem.firebasestorage.app",
    messagingSenderId: "575918945925",
    appId: "1:575918945925:web:288a763f1bcbb5ae7e5bec"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

function getSafeDbKey(username) {
    return username ? username.replace(/[.#$\[\]]/g, '_') : 'unknown_user';
}

function playLoginMusic() {
    const guildConfig = guildConfigs[currentGuildId];
    const musicUrl = guildConfig?.system?.musicUrl || 'https://www.youtube.com/embed/BtEkzZoUCpw?autoplay=1&loop=1';
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
        showNotify('⚠️ TEST MODE ENABLED - No real changes will be made', 'warning');
    } else {
        indicator.classList.add('hidden');
        if (statusText) statusText.textContent = 'Disabled';
    }
}

// ==========================================
// 3. PERMISSION CHECKS
// ==========================================

function isPanelOwner() {
    if (!currentUser) return false;
    return currentUser.id === PANEL_OWNER_USER_ID;
}

function hasAdminPermission(guildId) {
    if (!currentUser) return false;
    if (isPanelOwner()) return true;
    const guildRoles = userGuildRoles[guildId] || [];
    const adminRoles = guildConfigs[guildId]?.adminRoles || [];
    return guildRoles.some(role => adminRoles.includes(role));
}

function hasGuildLeaderPermission(guildId) {
    if (!currentUser) return false;
    if (isPanelOwner()) return true;
    const guildRoles = userGuildRoles[guildId] || [];
    const ownerRoles = guildConfigs[guildId]?.ownerRoles || [];
    return guildRoles.some(role => ownerRoles.includes(role));
}

function hasGpSubmitPermission(guildId) {
    if (!currentUser) return false;
    if (isPanelOwner()) return true;
    const guildRoles = userGuildRoles[guildId] || [];
    const gpSubmitRole = guildConfigs[guildId]?.gpSubmitRole;
    return gpSubmitRole ? guildRoles.includes(gpSubmitRole) : false;
}

// ==========================================
// 4. DISCORD BOT INTERACTIONS
// ==========================================

async function sendDiscordMessage(channelId, content, embeds) {
    if (!channelId) {
        console.warn("No channel ID provided");
        return false;
    }
    
    try {
        const body = {};
        if (content) body.content = content;
        if (embeds && embeds.length > 0) body.embeds = embeds;
        
        const response = await fetch(`${BACKEND_URL}/send-channel-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, content, embeds })
        });
        
        if (!response.ok) {
            const error = await response.text();
            console.error(`Discord message failed:`, error);
            return false;
        }
        return true;
    } catch (e) {
        console.error(`Discord message error:`, e);
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
    } catch (e) {
        console.error("Failed to update bot status:", e);
    }
}

async function updateDiscordNickname(userId, robloxName, robloxUsername) {
    try {
        const newNickname = `${robloxName} (@${robloxUsername})`;
        
        const response = await fetch(`${BACKEND_URL}/update-nickname`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userId: userId, 
                nickname: newNickname,
                guildId: currentGuildId
            })
        });
        
        if (response.ok) {
            console.log(`Nickname updated to: ${newNickname}`);
            return true;
        } else {
            const error = await response.text();
            console.error(`Failed to update nickname: ${error}`);
            return false;
        }
    } catch (e) {
        console.error(`Nickname update error:`, e);
        return false;
    }
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
    if (tabName === 'Admin') {
        loadAdminData();
    }
}

// ==========================================
// 6. PERMISSION UI UPDATES
// ==========================================

function updatePermissions() {
    const gpSubmitCard = document.getElementById('gpSubmitCard');
    const noPermissionCard = document.getElementById('noPermissionCard');
    const tabBtnSpenden = document.getElementById('tabBtnSpenden');
    const tabBtnAdmin = document.getElementById('tabBtnAdmin');
    const tabBtnGuildLeader = document.getElementById('tabBtnGuildLeader');
    const tabBtnPanelOwner = document.getElementById('tabBtnPanelOwner');
    const spendenContent = document.getElementById('content-spenden');
    
    const canSubmit = hasGpSubmitPermission(currentGuildId);
    const canAdmin = hasAdminPermission(currentGuildId);
    const canGuildLeader = hasGuildLeaderPermission(currentGuildId);
    const panelOwner = isPanelOwner();
    
    if (canSubmit) {
        if (gpSubmitCard) gpSubmitCard.classList.remove('hidden');
        if (noPermissionCard) noPermissionCard.classList.add('hidden');
        if (tabBtnSpenden) tabBtnSpenden.style.display = 'block';
    } else {
        if (gpSubmitCard) gpSubmitCard.classList.add('hidden');
        if (noPermissionCard) noPermissionCard.classList.remove('hidden');
        if (tabBtnSpenden) tabBtnSpenden.style.display = 'none';
        if (spendenContent && !spendenContent.classList.contains('hidden')) {
            switchTab('Leaderboard');
        }
    }
    
    if (tabBtnAdmin) {
        tabBtnAdmin.style.display = (canAdmin || panelOwner) ? 'block' : 'none';
    }
    
    if (tabBtnGuildLeader) {
        tabBtnGuildLeader.style.display = (canGuildLeader || panelOwner) ? 'block' : 'none';
    }
    
    if (tabBtnPanelOwner) {
        tabBtnPanelOwner.style.display = panelOwner ? 'block' : 'none';
    }
}

// ==========================================
// 7. GUILD SELECTION
// ==========================================

async function fetchUserRoles(userId, guildId) {
    if (!userId || !guildId) {
        userGuildRoles[guildId] = [];
        return [];
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/user-roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId, guildId: guildId })
        });
        
        if (response.ok) {
            const data = await response.json();
            userGuildRoles[guildId] = data.roles || [];
            console.log(`User roles loaded for guild ${guildId}:`, userGuildRoles[guildId]);
            return userGuildRoles[guildId];
        } else {
            userGuildRoles[guildId] = [];
        }
    } catch (e) {
        console.warn("Error fetching user roles:", e);
        userGuildRoles[guildId] = [];
    }
    return userGuildRoles[guildId];
}

async function fetchRoleName(roleId) {
    if (roleNameCache[roleId]) return roleNameCache[roleId];
    
    try {
        const response = await fetch(`${BACKEND_URL}/role-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId: roleId, guildId: currentGuildId })
        });
        
        if (response.ok) {
            const data = await response.json();
            roleNameCache[roleId] = data.name || roleId;
            return roleNameCache[roleId];
        }
    } catch (e) {
        console.warn("Error fetching role name:", e);
    }
    return roleId;
}

async function loadAvailableGuilds() {
    if (!currentUser) return [];
    
    try {
        const response = await fetch(`${BACKEND_URL}/user-guilds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        
        if (response.ok) {
            const data = await response.json();
            availableGuilds = data.guilds || [];
            return availableGuilds;
        }
    } catch (e) {
        console.error("Error loading guilds:", e);
    }
    return [];
}

async function showGuildSelector() {
    const guildsContainer = document.createElement('div');
    guildsContainer.className = 'guild-selector-overlay';
    guildsContainer.innerHTML = `
        <div class="guild-selector-card">
            <i class="fas fa-server"></i>
            <h2>Select Discord Server</h2>
            <p>Choose which server you want to manage</p>
            <div id="guildList" class="guild-list"></div>
        </div>
    `;
    document.body.appendChild(guildsContainer);
    
    const guildList = document.getElementById('guildList');
    
    for (const guild of availableGuilds) {
        const guildBtn = document.createElement('button');
        guildBtn.className = 'guild-selector-btn';
        guildBtn.innerHTML = `
            ${guild.icon ? `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png" class="guild-icon">` : '<i class="fas fa-server"></i>'}
            <span>${escapeHtml(guild.name)}</span>
        `;
        guildBtn.onclick = () => selectGuild(guild.id);
        guildList.appendChild(guildBtn);
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
                embedColors: {
                    approve: '#48bb78',
                    reject: '#f56565',
                    pending: '#cd7f32',
                    info: '#5865F2',
                    leaderboard: '#ffd700'
                },
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
    if (snap.exists()) {
        testModeEnabled = snap.val().enabled === true;
        updateTestModeIndicator();
    }
}

async function loadMaintenanceStatus(guildId) {
    const maintenanceRef = ref(db, `guilds/${guildId}/config/maintenance`);
    const snap = await get(maintenanceRef);
    if (snap.exists() && snap.val().enabled) {
        document.getElementById('maintenanceOverlay').classList.remove('hidden');
        document.getElementById('maintenanceStatusText').textContent = 'Enabled';
    } else {
        document.getElementById('maintenanceOverlay').classList.add('hidden');
        document.getElementById('maintenanceStatusText').textContent = 'Disabled';
    }
}

async function loadGuildData(guildId) {
    onValue(ref(db, `guilds/${guildId}/users`), (snapshot) => {
        allUsersData = snapshot.val() || {};
        const searchValue = document.getElementById('leaderboardSearch')?.value || "";
        renderLeaderboard(searchValue);
        updateBotStatus();
    });
    
    onValue(ref(db, `guilds/${guildId}/requests`), (snapshot) => {
        const data = snapshot.val();
        updateProfileHistory(data);
        if (hasAdminPermission(guildId)) {
            updateAdminPending(data);
        }
    });
    
    if (hasGuildLeaderPermission(guildId) || isPanelOwner()) {
        onValue(ref(db, `guilds/${guildId}/logs/kicks`), (snapshot) => {
            updateKickLogs(snapshot.val());
        });
    }
}

// ==========================================
// 8. DASHBOARD & UI
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
    
    if (hasAdminPermission(currentGuildId) || isPanelOwner()) {
        loadAdminData();
    }
    
    if (isPanelOwner()) {
        loadPanelOwnerData();
    }
    
    updateBotStatus();
    setInterval(() => updateBotStatus(), 60000);
}

function loadPanelOwnerData() {
    loadAdminRolesList();
    loadChannelConfigUI();
    loadSystemConfigUI();
    loadSavedMessages();
    loadRegisteredUsersCount();
    loadKickLogs();
}

function renderLeaderboard(filterText) {
    const body = document.getElementById('leaderboardBody');
    if (!body) return;
    body.innerHTML = '';
    if (!allUsersData) return;
    
    let usersArray = Object.values(allUsersData)
        .filter(u => u.totalGP && u.totalGP > 0)
        .sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0));
    
    if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        usersArray = usersArray.filter(u => 
            (u.discordName && u.discordName.toLowerCase().includes(lowerFilter)) ||
            (u.discordUsername && u.discordUsername.toLowerCase().includes(lowerFilter)) ||
            (u.robloxName && u.robloxName.toLowerCase().includes(lowerFilter))
        );
    }
    
    usersArray.forEach((u, i) => {
        body.innerHTML += `
            <tr>
                <td>#${i + 1}</td>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.discordName || "Unknown")}</span><span class="username-handle">@${escapeHtml(u.discordUsername || "Unknown")}</span></div></td>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.robloxName || "Unknown")}</span><span class="username-handle">@${escapeHtml(u.robloxUsername || "Unknown")}</span></div></td>
                <td style="color:#48bb78; font-weight:bold; font-size:16px;">${(u.totalGP || 0).toLocaleString()} GP</td>
            </tr>
        `;
    });
    
    if (usersArray.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No users with GP yet</td></tr>';
    }
    
    const totalGP = Object.values(allUsersData).reduce((sum, u) => sum + (u.totalGP || 0), 0);
    const totalGpStat = document.getElementById('totalGpStat');
    if (totalGpStat) totalGpStat.textContent = totalGP.toLocaleString();
}

function loadLeaderboard() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/users`), (snapshot) => {
        allUsersData = snapshot.val();
        const searchValue = document.getElementById('leaderboardSearch')?.value || "";
        renderLeaderboard(searchValue);
        updateBotStatus();
    });
}

function updateProfileHistory(data) {
    const body = document.getElementById('profileHistoryBody');
    if (!body) return;
    body.innerHTML = '';
    if (!data || !currentUser) return;
    
    const userRequests = Object.values(data)
        .filter(r => r.userId === currentUser.id)
        .sort((a, b) => b.timestamp - a.timestamp);
    
    userRequests.forEach(req => {
        const dateStr = new Date(req.timestamp).toLocaleDateString('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let statusHtml = '';
        if (req.status === 'pending') statusHtml = '<span class="status-badge status-pending">Pending ⏳</span>';
        else if (req.status === 'approved') statusHtml = '<span class="status-badge status-approved">Approved ✅</span>';
        else statusHtml = '<span class="status-badge status-rejected">Rejected ❌</span>';
        
        body.innerHTML += `
            <tr>
                <td style="font-size:14px; color:#aaa;">${dateStr}</td>
                <td style="font-weight:bold;">+${req.amount.toLocaleString()} GP</td>
                <td>${statusHtml}</td>
                <td style="font-size:12px; color:#888;">${escapeHtml(req.adminComment || '-')}</td>
            </tr>
        `;
    });
    
    if (userRequests.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No requests yet</td></tr>';
    }
}

function updateAdminPending(data) {
    const body = document.getElementById('adminPendingBody');
    if (!body) return;
    
    body.innerHTML = '';
    if (!data) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No pending requests</td></tr>';
        return;
    }
    
    const pendingRequests = Object.values(data)
        .filter(r => r.status === 'pending')
        .sort((a, b) => a.timestamp - b.timestamp);
    
    if (pendingRequests.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No pending requests</td></tr>';
        return;
    }
    
    pendingRequests.forEach(req => {
        body.innerHTML += `
            <tr>
                <td>
                    <div class="user-name-cell">
                        <span class="display-name">${escapeHtml(req.discordName || "Unknown")}</span>
                        <span class="username-handle">@${escapeHtml(req.discordUsername || "Unknown")}</span>
                    </div>
                </td>
                <td>
                    <div class="user-name-cell">
                        <span class="display-name">${escapeHtml(req.robloxName || "Unknown")}</span>
                        <span class="username-handle">@${escapeHtml(req.robloxUsername || "Unknown")}</span>
                    </div>
                </td>
                <td style="color:#cd7f32; font-weight:bold;">+${req.amount.toLocaleString()} GP</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <input type="text" id="comment_${req.id}" placeholder="Admin comment (optional)" style="padding: 6px; font-size: 12px; margin-bottom: 5px;">
                        <div style="display: flex; gap: 5px;">
                            <button class="btn-small btn-approve" onclick="window.handleAdminActionWithComment('${req.id}', '${req.userId}', ${req.amount}, 'approve', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">
                                <i class="fas fa-check"></i> Approve
                            </button>
                            <button class="btn-small btn-deny" onclick="window.handleAdminActionWithComment('${req.id}', '${req.userId}', ${req.amount}, 'reject', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">
                                <i class="fas fa-times"></i> Reject
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
}

function loadAdminData() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/requests`), (snapshot) => {
        updateAdminPending(snapshot.val());
    });
}

// ==========================================
// 9. IMAGE UPLOAD & PREVIEW
// ==========================================

function updateImagePreviews() {
    const previewContainer = document.getElementById('imagePreviewContainer');
    const fileCountText = document.getElementById('fileCountText');
    const maxImages = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    
    previewContainer.innerHTML = '';
    fileCountText.textContent = `${selectedFiles.length} / ${maxImages} image(s) selected`;
    
    selectedFiles.forEach((file, index) => {
        const box = document.createElement('div');
        box.className = 'preview-box';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        const btn = document.createElement('button');
        btn.className = 'remove-img-btn';
        btn.innerHTML = '&times;';
        btn.onclick = () => {
            selectedFiles.splice(index, 1);
            updateImagePreviews();
        };
        box.appendChild(img);
        box.appendChild(btn);
        previewContainer.appendChild(box);
    });
}

// ==========================================
// 10. GP SUBMIT FUNCTION
// ==========================================

async function submitGPRequest() {
    if (!hasGpSubmitPermission(currentGuildId)) {
        showNotify("You don't have permission to submit GP requests!", "error");
        return;
    }
    
    const amount = parseInt(document.getElementById('gpAmount').value);
    const btn = document.getElementById('addGPBtn');
    const maxImages = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    
    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount!");
        return;
    }
    
    if (selectedFiles.length === 0) {
        alert("Please add at least 1 screenshot as proof!");
        return;
    }
    
    if (selectedFiles.length > maxImages) {
        alert(`Maximum ${maxImages} images allowed!`);
        return;
    }

    btn.disabled = true;
    btn.textContent = "SENDING...";

    try {
        const dbKey = getSafeDbKey(currentUser.username);
        const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
        const snap = await get(userRef);
        const userData = snap.val() || {};

        const dName = userData.discordName || currentUser.global_name || "Unknown";
        const dUser = userData.discordUsername || currentUser.username || "Unknown";
        const dId = currentUser.id || "1";
        const rName = userData.robloxName || "Unknown";
        const rUser = userData.robloxUsername || "Unknown";
        const rId = userData.robloxId || "1";

        const newReqRef = push(ref(db, `guilds/${currentGuildId}/requests`));
        const reqKey = newReqRef.key;

        await set(newReqRef, {
            id: reqKey,
            dbKey: dbKey,
            userId: dId,
            discordName: dName,
            discordUsername: dUser,
            robloxName: rName,
            robloxUsername: rUser,
            robloxId: rId,
            amount: amount,
            status: 'pending',
            timestamp: Date.now()
        });

        showNotify(`GP Request submitted successfully!`, "success");

        document.getElementById('gpAmount').value = '';
        selectedFiles = [];
        updateImagePreviews();
        
        switchTab('Profile');
        
    } catch (e) {
        console.error("Submit error:", e);
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = "SUBMIT PROOF FOR REVIEW";
    }
}

// ==========================================
// 11. ADMIN ACTIONS
// ==========================================

window.handleAdminActionWithComment = async (reqId, userId, amount, action, passedDbKey, robloxId, discordName, discordUsername, robloxName, robloxUsername) => {
    const commentInput = document.getElementById(`comment_${reqId}`);
    const adminComment = commentInput ? commentInput.value.trim() : '';
    
    if (!confirm(`Are you sure you want to ${action === 'approve' ? 'APPROVE' : 'REJECT'} this request?${adminComment ? `\n\nComment: ${adminComment}` : ''}`)) return;
    
    if (testModeEnabled) {
        showNotify(`🔬 TEST MODE: ${action === 'approve' ? 'Approved' : 'Rejected'} request ${reqId} (simulated)`, "warning");
        
        await update(ref(db, `guilds/${currentGuildId}/requests/${reqId}`), {
            status: action === 'approve' ? 'approved' : 'rejected',
            adminComment: adminComment,
            processedAt: Date.now(),
            processedBy: currentUser.id,
            testMode: true
        });
        
        showNotify(`Test: Request ${action === 'approve' ? 'approved' : 'rejected'}!`, "success");
        return;
    }
    
    try {
        const reqSnap = await get(ref(db, `guilds/${currentGuildId}/requests/${reqId}`));
        const reqData = reqSnap.val();
        if (!reqData) return alert("Request not found!");

        await update(ref(db, `guilds/${currentGuildId}/requests/${reqId}`), {
            status: action === 'approve' ? 'approved' : 'rejected',
            adminComment: adminComment,
            processedAt: Date.now(),
            processedBy: currentUser.id
        });

        const dbKey = getSafeDbKey(passedDbKey);
        let newTotal = 0;
        const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
        const snap = await get(userRef);

        if (snap.exists()) {
            newTotal = snap.val().totalGP || 0;
            if (action === 'approve') {
                newTotal += amount;
                await update(userRef, { totalGP: newTotal });
            }
        }

        const allUsersSnap = await get(ref(db, `guilds/${currentGuildId}/users`));
        let rank = "?";
        if (allUsersSnap.exists()) {
            const sorted = Object.values(allUsersSnap.val())
                .filter(u => u.totalGP && u.totalGP > 0)
                .sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0));
            const index = sorted.findIndex(u => u.id === userId);
            rank = index !== -1 ? (index + 1).toString() : "?";
        }

        const channels = guildConfigs[currentGuildId]?.channels || {};
        const processedChannel = channels.CH_GP_PROCESSED;
        
        if (processedChannel) {
            const actionText = action === 'approve' ? '✅ GP Donation Approved' : '❌ GP Donation Rejected';
            const amountText = action === 'approve' ? `+${amount.toLocaleString()} GP` : `-${amount.toLocaleString()} GP`;
            const embedColors = guildConfigs[currentGuildId]?.system?.embedColors || {};
            
            const embed = {
                title: actionText,
                url: "https://corleonecity.github.io/SwordArtOnline/",
                color: action === 'approve' ? parseInt(embedColors.approve?.replace('#', ''), 16) : parseInt(embedColors.reject?.replace('#', ''), 16),
                fields: [
                    { name: "💬 Discord", value: `**Name:** ${discordName}\n**Tag:** @${discordUsername}\n**Ping:** <@${userId}>`, inline: true },
                    { name: "🎮 Roblox", value: `**Name:** ${robloxName}\n**User:** @${robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${robloxId}/profile)`, inline: true },
                    { name: "💰 Amount", value: amountText, inline: false },
                    { name: "📊 New Total", value: `${newTotal.toLocaleString()} GP`, inline: true },
                    { name: "🏆 Rank", value: `#${rank}`, inline: true },
                    { name: "🛡️ Processed By", value: `<@${currentUser.id}>`, inline: false }
                ],
                timestamp: new Date().toISOString(),
                footer: { text: "SwordArtOnline GP System" }
            };
            
            if (adminComment) {
                embed.fields.push({ name: "💬 Admin Comment", value: adminComment, inline: false });
            }
            
            await sendDiscordMessage(processedChannel, `<@${userId}>`, [embed]);
        }

        showNotify(`Request ${action === 'approve' ? 'approved' : 'rejected'}!`, "success");
        
    } catch (e) {
        console.error("Admin action error:", e);
        alert("Error: " + e.message);
    }
};

// ==========================================
// 12. OWNER PANEL FUNCTIONS (Roles, Config, etc.)
// ==========================================

async function loadAdminRolesList() {
    const container = document.getElementById('adminRolesList');
    if (!container) return;
    
    try {
        const config = guildConfigs[currentGuildId] || {};
        const adminRoles = config.adminRoles || [];
        const ownerRoles = config.ownerRoles || [];
        
        let html = '<table class="table"><thead><tr><th>Role Name</th><th>Role ID</th><th>Type</th><th>Action</th></tr></thead><tbody>';
        
        for (const role of adminRoles) {
            const roleName = await fetchRoleName(role);
            html += `<tr><td class="role-name">${escapeHtml(roleName)}</td><td class="role-id">${escapeHtml(role)}</td><td><span class="status-badge status-approved">Admin</span></td><td><button class="btn-small btn-remove-role" onclick="removeAdminRole('${role}')">Remove</button></td></tr>`;
        }
        
        for (const role of ownerRoles) {
            const roleName = await fetchRoleName(role);
            html += `<tr><td class="role-name">${escapeHtml(roleName)}</span><td><td class="role-id">${escapeHtml(role)}</span><td><span class="status-badge status-pending">Guild Leader</span></span><td><button class="btn-small btn-remove-role" onclick="removeOwnerRole('${role}')">Remove</button></span></tr>`;
        }
        
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        console.error("Error loading roles:", e);
        container.innerHTML = '<p style="color: #f56565;">Error loading roles</p>';
    }
}

window.addAdminRole = async () => {
    const roleId = document.getElementById('newRoleId').value.trim();
    const permissionLevel = document.getElementById('rolePermissionLevel').value;
    
    if (!roleId) {
        showNotify("Please enter a role ID!", "error");
        return;
    }
    
    try {
        const config = guildConfigs[currentGuildId] || {};
        let adminRoles = config.adminRoles || [];
        let ownerRoles = config.ownerRoles || [];
        
        if (permissionLevel === 'admin') {
            if (!adminRoles.includes(roleId)) {
                adminRoles.push(roleId);
            }
        } else {
            if (!ownerRoles.includes(roleId)) {
                ownerRoles.push(roleId);
            }
        }
        
        await set(ref(db, `guilds/${currentGuildId}/config`), {
            ...config,
            adminRoles: adminRoles,
            ownerRoles: ownerRoles
        });
        
        guildConfigs[currentGuildId].adminRoles = adminRoles;
        guildConfigs[currentGuildId].ownerRoles = ownerRoles;
        
        showNotify(`Role added as ${permissionLevel === 'admin' ? 'Admin' : 'Guild Leader'}!`, "success");
        document.getElementById('newRoleId').value = '';
        await loadAdminRolesList();
        await fetchUserRoles(currentUser.id, currentGuildId);
        updatePermissions();
    } catch (e) {
        showNotify("Error saving role!", "error");
    }
};

window.removeAdminRole = async (roleId) => {
    const config = guildConfigs[currentGuildId] || {};
    let adminRoles = config.adminRoles || [];
    const index = adminRoles.indexOf(roleId);
    if (index !== -1) {
        adminRoles.splice(index, 1);
        await set(ref(db, `guilds/${currentGuildId}/config`), {
            ...config,
            adminRoles: adminRoles
        });
        guildConfigs[currentGuildId].adminRoles = adminRoles;
        showNotify(`Role removed from admin!`, "success");
        await loadAdminRolesList();
        await fetchUserRoles(currentUser.id, currentGuildId);
        updatePermissions();
    }
};

window.removeOwnerRole = async (roleId) => {
    const config = guildConfigs[currentGuildId] || {};
    let ownerRoles = config.ownerRoles || [];
    const index = ownerRoles.indexOf(roleId);
    if (index !== -1) {
        ownerRoles.splice(index, 1);
        await set(ref(db, `guilds/${currentGuildId}/config`), {
            ...config,
            ownerRoles: ownerRoles
        });
        guildConfigs[currentGuildId].ownerRoles = ownerRoles;
        showNotify(`Role removed from guild leader!`, "success");
        await loadAdminRolesList();
        await fetchUserRoles(currentUser.id, currentGuildId);
        updatePermissions();
    }
};

async function loadChannelConfigUI() {
    const container = document.getElementById('channelConfigList');
    if (!container) return;
    
    const channelConfig = guildConfigs[currentGuildId]?.channels || {};
    
    const channels = [
        { key: 'CH_LEAVE_LOGS', name: '📤 Leave Logs Channel', description: 'Channel for user leave notifications' },
        { key: 'CH_USER_INFO', name: '🛡️ User Info Board', description: 'Channel for Guild User Info board' },
        { key: 'CH_PANEL_INFO', name: '💻 Panel Info Board', description: 'Channel for Panel Registration Info board' },
        { key: 'CH_LEADERBOARD', name: '🏆 Leaderboard Channel', description: 'Channel for GP Leaderboard' },
        { key: 'CH_TRIGGER_BTN', name: '🔄 Trigger Button Channel', description: 'Channel with manual update button' },
        { key: 'CH_GP_REQUESTS', name: '💎 GP Requests Channel', description: 'Channel for new GP donation requests' },
        { key: 'CH_GP_PROCESSED', name: '✅ GP Processed Channel', description: 'Channel for approved/rejected GP requests' },
        { key: 'CH_LOGIN_LOGS', name: '🔐 Login Logs Channel', description: 'Channel for user login notifications' },
        { key: 'CH_BOT_DM_LOGS', name: '📨 Bot DM Logs Channel', description: 'Channel for /admin command messages' }
    ];
    
    container.innerHTML = channels.map(ch => `
        <div class="channel-config-item">
            <div class="channel-config-name">${ch.name}</div>
            <div class="channel-config-description">${ch.description}</div>
            <div class="channel-config-input">
                <input type="text" id="cfg_${ch.key}" value="${channelConfig[ch.key] || ''}" placeholder="Enter Discord Channel ID">
                <span>Channel ID</span>
            </div>
        </div>
    `).join('');
}

async function saveChannelConfig() {
    const channels = [
        'CH_LEAVE_LOGS', 'CH_USER_INFO', 'CH_PANEL_INFO', 'CH_LEADERBOARD',
        'CH_TRIGGER_BTN', 'CH_GP_REQUESTS', 'CH_GP_PROCESSED', 'CH_LOGIN_LOGS', 'CH_BOT_DM_LOGS'
    ];
    
    const newConfig = {};
    let hasChanges = false;
    
    for (const ch of channels) {
        const input = document.getElementById(`cfg_${ch}`);
        if (input && input.value.trim()) {
            newConfig[ch] = input.value.trim();
            hasChanges = true;
        } else if (input && input.value === '') {
            newConfig[ch] = null;
            hasChanges = true;
        }
    }
    
    if (!hasChanges) {
        showNotify("No changes to save!", "warning");
        return;
    }
    
    try {
        const configToSave = {};
        for (const [key, value] of Object.entries(newConfig)) {
            if (value !== null && value !== '') {
                configToSave[key] = value;
            }
        }
        
        const currentConfig = guildConfigs[currentGuildId] || {};
        
        if (Object.keys(configToSave).length === 0) {
            await set(ref(db, `guilds/${currentGuildId}/config/channels`), null);
            currentConfig.channels = {};
            showNotify("All channel configurations cleared!", "success");
        } else {
            await set(ref(db, `guilds/${currentGuildId}/config/channels`), configToSave);
            currentConfig.channels = configToSave;
            showNotify("Channel configuration saved!", "success");
        }
        
        guildConfigs[currentGuildId] = currentConfig;
        await loadChannelConfigUI();
    } catch (e) {
        console.error("Error saving config:", e);
        showNotify("Error saving configuration!", "error");
    }
}

function updateKickLogs(data) {
    const body = document.getElementById('kickLogsBody');
    if (!body) return;
    
    body.innerHTML = '';
    if (!data) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">No kick logs found</span></td></tr>';
        return;
    }
    
    const logs = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
    
    logs.forEach(log => {
        const dateStr = new Date(log.timestamp).toLocaleString();
        body.innerHTML += `
            <tr>
                <td style="font-size:12px;">${dateStr}</span>
                <td><code>${escapeHtml(log.kickedUserId || '?')}</code><br>${escapeHtml(log.kickedUserName || '')}</span>
                <td><code>${escapeHtml(log.kickedByUserId || '?')}</code><br>${escapeHtml(log.kickedByUserName || '')}</span>
                <td>${escapeHtml(log.reason || 'No reason')}</span>
                <td>${log.dmSent ? '✅ Yes' : '❌ No'}</span>
            </tr>
        `;
    });
}

function loadKickLogs() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/logs/kicks`), (snapshot) => {
        updateKickLogs(snapshot.val());
    });
}

async function setMaintenanceMode(enabled) {
    if (!isPanelOwner()) {
        showNotify("Only Panel Owner can change maintenance mode!", "error");
        return;
    }
    try {
        await set(ref(db, `guilds/${currentGuildId}/config/maintenance`), { enabled });
        if (enabled) {
            document.getElementById('maintenanceOverlay').classList.remove('hidden');
            document.getElementById('maintenanceStatusText').textContent = 'Enabled';
            showNotify("Maintenance mode ENABLED", "warning");
        } else {
            document.getElementById('maintenanceOverlay').classList.add('hidden');
            document.getElementById('maintenanceStatusText').textContent = 'Disabled';
            showNotify("Maintenance mode DISABLED", "success");
        }
    } catch (e) {
        showNotify("Error toggling maintenance mode!", "error");
    }
}

async function setTestMode(enabled) {
    if (!isPanelOwner()) {
        showNotify("Only Panel Owner can change test mode!", "error");
        return;
    }
    try {
        await set(ref(db, `guilds/${currentGuildId}/config/testMode`), { enabled });
        testModeEnabled = enabled;
        updateTestModeIndicator();
        showNotify(`Test mode ${enabled ? 'ENABLED' : 'DISABLED'}`, enabled ? "warning" : "success");
    } catch (e) {
        showNotify("Error toggling test mode!", "error");
    }
}

async function loadRegisteredUsersCount() {
    try {
        const usersSnap = await get(ref(db, `guilds/${currentGuildId}/users`));
        const users = usersSnap.val() || {};
        let totalUsers = 0;
        for (const [key, user] of Object.entries(users)) {
            if (user.robloxId && user.robloxId !== '1') totalUsers++;
        }
        const statTotalUsers = document.getElementById('statTotalUsers');
        if (statTotalUsers) statTotalUsers.textContent = totalUsers;
    } catch (e) {
        console.error("Error loading users count:", e);
    }
}

function loadSystemConfigUI() {
    const system = guildConfigs[currentGuildId]?.system || {};
    const embedColors = system.embedColors || {};
    const limits = system.limits || {};
    
    document.getElementById('colorApprove').value = embedColors.approve || '#48bb78';
    document.getElementById('colorReject').value = embedColors.reject || '#f56565';
    document.getElementById('colorPending').value = embedColors.pending || '#cd7f32';
    document.getElementById('colorInfo').value = embedColors.info || '#5865F2';
    document.getElementById('colorLeaderboard').value = embedColors.leaderboard || '#ffd700';
    document.getElementById('maxImagesPerRequest').value = limits.maxImagesPerRequest || 1;
    document.getElementById('loginMusicUrl').value = system.musicUrl || '';
    document.getElementById('updateInterval').value = system.updateInterval || 60;
    document.getElementById('gpSubmitRoleId').value = guildConfigs[currentGuildId]?.gpSubmitRole || '';
}

async function saveSystemConfig() {
    const newConfig = {
        embedColors: {
            approve: document.getElementById('colorApprove').value,
            reject: document.getElementById('colorReject').value,
            pending: document.getElementById('colorPending').value,
            info: document.getElementById('colorInfo').value,
            leaderboard: document.getElementById('colorLeaderboard').value
        },
        limits: {
            maxImagesPerRequest: parseInt(document.getElementById('maxImagesPerRequest').value)
        },
        musicUrl: document.getElementById('loginMusicUrl').value,
        updateInterval: parseInt(document.getElementById('updateInterval').value)
    };
    
    try {
        const currentConfig = guildConfigs[currentGuildId] || {};
        await set(ref(db, `guilds/${currentGuildId}/config/system`), newConfig);
        currentConfig.system = newConfig;
        guildConfigs[currentGuildId] = currentConfig;
        showNotify("System configuration saved!", "success");
    } catch (e) {
        showNotify("Error saving configuration!", "error");
    }
}

async function saveGpSubmitRole() {
    const newRoleId = document.getElementById('gpSubmitRoleId').value.trim();
    if (!newRoleId) {
        showNotify("Please enter a role ID!", "error");
        return;
    }
    
    try {
        const currentConfig = guildConfigs[currentGuildId] || {};
        await set(ref(db, `guilds/${currentGuildId}/config/gpSubmitRole`), newRoleId);
        currentConfig.gpSubmitRole = newRoleId;
        guildConfigs[currentGuildId] = currentConfig;
        showNotify(`GP Submit Role updated to ${newRoleId}!`, "success");
        updatePermissions();
    } catch (e) {
        showNotify("Error saving GP Submit Role!", "error");
    }
}

// ==========================================
// 13. SAVED MESSAGES FUNCTIONS
// ==========================================

async function loadSavedMessages() {
    const messagesRef = ref(db, `guilds/${currentGuildId}/saved_messages`);
    onValue(messagesRef, (snapshot) => {
        const data = snapshot.val();
        const container = document.getElementById('savedMessagesList');
        
        if (!container) return;
        
        if (!data || Object.keys(data).length === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center;">No saved messages yet. Create one above!</p>';
            return;
        }
        
        container.innerHTML = '';
        Object.entries(data).forEach(([id, msg]) => {
            const previewContent = msg.content ? (msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')) : 'No content';
            const messageIdDisplay = msg.discordMessageId ? `✅ Message ID: ${msg.discordMessageId.substring(0, 8)}...` : '⚠️ Not sent yet';
            
            container.innerHTML += `
                <div class="saved-message-item" data-id="${id}">
                    <div class="message-name">📝 ${escapeHtml(msg.name)}</div>
                    <div class="message-channel">📡 Channel ID: ${escapeHtml(msg.channelId || 'Not set')}</div>
                    <div class="message-id" style="font-size: 11px; color: ${msg.discordMessageId ? '#48bb78' : '#f56565'}; margin-bottom: 5px;">
                        ${messageIdDisplay}
                    </div>
                    <div class="message-preview">
                        <strong>Message:</strong> ${escapeHtml(previewContent)}
                        ${msg.embedTitle ? `<br><strong>Embed:</strong> ${escapeHtml(msg.embedTitle)}` : ''}
                    </div>
                    <div class="message-actions">
                        <button class="btn-edit-message" onclick="window.editSavedMessage('${id}')">✏️ Edit</button>
                        <button class="btn-send-message" onclick="window.sendSavedMessage('${id}')">📤 Send / Update</button>
                        <button class="btn-delete-message" onclick="window.deleteSavedMessage('${id}')">🗑️ Delete</button>
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
    if (msg.embedColor) document.getElementById('messageEmbedColor').value = msg.embedColor;
    
    const saveBtn = document.getElementById('saveMessageBtn');
    saveBtn.textContent = '✏️ Update Message';
    saveBtn.style.background = '#ffd700';
    
    showNotify(`Editing "${msg.name}" - Click Update to save changes`, "success");
};

async function saveMessage() {
    const name = document.getElementById('messageName').value.trim();
    const channelId = document.getElementById('messageChannelId').value.trim();
    const content = document.getElementById('messageContent').value;
    const embedTitle = document.getElementById('messageEmbedTitle').value;
    const embedDesc = document.getElementById('messageEmbedDesc').value;
    const embedColor = document.getElementById('messageEmbedColor').value;
    
    if (!name) {
        showNotify("Please enter a message name!", "error");
        return;
    }
    
    if (!channelId) {
        showNotify("Please enter a channel ID!", "error");
        return;
    }
    
    const messageData = {
        name: name,
        channelId: channelId,
        content: content,
        embedTitle: embedTitle,
        embedDesc: embedDesc,
        embedColor: embedColor,
        updatedAt: Date.now(),
        updatedBy: currentUser?.id
    };
    
    try {
        if (currentEditingMessageId) {
            const existingSnap = await get(ref(db, `guilds/${currentGuildId}/saved_messages/${currentEditingMessageId}`));
            const existing = existingSnap.val();
            if (existing && existing.discordMessageId) {
                messageData.discordMessageId = existing.discordMessageId;
            }
            await update(ref(db, `guilds/${currentGuildId}/saved_messages/${currentEditingMessageId}`), messageData);
            showNotify(`Message "${name}" updated successfully!`, "success");
            currentEditingMessageId = null;
            
            const saveBtn = document.getElementById('saveMessageBtn');
            saveBtn.textContent = '💾 Save Message';
            saveBtn.style.background = '#48bb78';
        } else {
            const newRef = push(ref(db, `guilds/${currentGuildId}/saved_messages`));
            await set(newRef, { ...messageData, createdAt: Date.now(), createdBy: currentUser?.id });
            showNotify(`Message "${name}" saved successfully!`, "success");
        }
        
        document.getElementById('messageName').value = '';
        document.getElementById('messageChannelId').value = '';
        document.getElementById('messageContent').value = '';
        document.getElementById('messageEmbedTitle').value = '';
        document.getElementById('messageEmbedDesc').value = '';
        document.getElementById('messageEmbedColor').value = '#5865F2';
        
        loadSavedMessages();
    } catch (e) {
        showNotify("Error saving message!", "error");
    }
}

window.sendSavedMessage = async (id) => {
    const snap = await get(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`));
    const msg = snap.val();
    if (!msg) return;
    
    if (!msg.channelId) {
        showNotify("No channel ID configured for this message!", "error");
        return;
    }
    
    let embeds = null;
    if (msg.embedTitle || msg.embedDesc) {
        embeds = [{
            title: msg.embedTitle || undefined,
            description: msg.embedDesc || undefined,
            color: msg.embedColor ? parseInt(msg.embedColor.replace('#', ''), 16) : 0x5865F2,
            timestamp: new Date().toISOString()
        }];
    }
    
    showNotify(`Sending "${msg.name}"...`, "warning");
    
    let storedMessageId = msg.discordMessageId;
    let success = false;
    
    if (storedMessageId) {
        try {
            const response = await fetch(`${BACKEND_URL}/update-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    channelId: msg.channelId, 
                    messageId: storedMessageId, 
                    content: msg.content, 
                    embeds: embeds 
                })
            });
            
            if (response.ok) {
                success = true;
                showNotify(`Message "${msg.name}" updated successfully!`, "success");
            } else if (response.status === 404) {
                console.log("Message not found, sending new one");
                storedMessageId = null;
            } else {
                storedMessageId = null;
            }
        } catch (e) {
            console.error("Update failed, sending new message:", e);
            storedMessageId = null;
        }
    }
    
    if (!storedMessageId) {
        const newMsgResponse = await fetch(`${BACKEND_URL}/send-channel-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: msg.channelId, content: msg.content, embeds: embeds })
        });
        
        if (newMsgResponse.ok) {
            const newMsgData = await newMsgResponse.json();
            success = true;
            
            if (newMsgData.messageId) {
                await update(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`), { 
                    discordMessageId: newMsgData.messageId,
                    lastSentAt: Date.now()
                });
                showNotify(`Message "${msg.name}" sent successfully! Message ID saved.`, "success");
            } else {
                showNotify(`Message "${msg.name}" sent successfully!`, "success");
            }
        } else {
            success = false;
        }
    }
    
    if (!success) {
        showNotify(`Failed to send "${msg.name}"!`, "error");
    }
    
    loadSavedMessages();
};

window.deleteSavedMessage = async (id) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
        await remove(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`));
        showNotify("Message deleted!", "success");
        loadSavedMessages();
    } catch (e) {
        showNotify("Error deleting message!", "error");
    }
};

function clearMessageForm() {
    currentEditingMessageId = null;
    document.getElementById('messageName').value = '';
    document.getElementById('messageChannelId').value = '';
    document.getElementById('messageContent').value = '';
    document.getElementById('messageEmbedTitle').value = '';
    document.getElementById('messageEmbedDesc').value = '';
    document.getElementById('messageEmbedColor').value = '#5865F2';
    
    const saveBtn = document.getElementById('saveMessageBtn');
    saveBtn.textContent = '💾 Save Message';
    saveBtn.style.background = '#48bb78';
    
    showNotify("Form cleared!", "success");
}

// ==========================================
// 14. DISCORD & ROBLOX AUTHENTIFICATION
// ==========================================

async function doLiveCheck() {
    if (!currentUser) return false;
    try {
        const res = await fetch(`${BACKEND_URL}/check-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, guildId: currentGuildId })
        });
        if (!res.ok) {
            forceKickUser();
            return false;
        }
        const data = await res.json();
        if (data.isMember === false) {
            forceKickUser();
            return false;
        }
        return true;
    } catch (e) {
        forceKickUser();
        return false;
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
            if (!data.isMember) {
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('noPermissionPage').classList.remove('hidden');
                stopMusic();
                return;
            }
            currentUser = data.user;
            sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
            window.history.replaceState({}, '', REDIRECT_URI);
            await loadAvailableGuilds();
            if (availableGuilds.length === 1) {
                await selectGuild(availableGuilds[0].id);
            } else if (availableGuilds.length > 1) {
                showGuildSelector();
            } else {
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('noPermissionPage').classList.remove('hidden');
            }
        }
    } catch (e) {
        alert("Login Error!");
        console.error(e);
    }
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
            const rDisplayName = data.robloxUser.nickname || data.robloxUser.name;
            const rUsername = data.robloxUser.preferred_username || data.robloxUser.name;
            const rId = data.robloxUser.sub;
            const dDisplayName = currentUser.global_name || currentUser.username || "Unknown";
            
            const dbKey = getSafeDbKey(currentUser.username);
            const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
            const snap = await get(userRef);
            let currentGP = snap.exists() && snap.val().totalGP ? snap.val().totalGP : 0;
            
            await update(userRef, {
                discordName: dDisplayName || "Unknown",
                discordUsername: currentUser.username || "Unknown",
                robloxName: rDisplayName || "Unknown",
                robloxUsername: rUsername || "Unknown",
                robloxId: rId || "1",
                totalGP: currentGP,
                id: currentUser.id || "1",
                hasLeftServer: false
            });

            await updateDiscordNickname(currentUser.id, rDisplayName, rUsername);
            window.location.href = REDIRECT_URI;
        }
    } catch (e) {
        alert("Linking Error!");
        console.error(e);
    }
}

// ==========================================
// 15. EVENT LISTENERS
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
    if (!confirm("Disconnect Roblox?")) return;
    try {
        const dbKey = getSafeDbKey(currentUser.username);
        await update(ref(db, `guilds/${currentGuildId}/users/${dbKey}`), {
            robloxId: null,
            robloxName: null,
            robloxUsername: null
        });
        window.location.reload();
    } catch (e) {
        showNotify("Error!", "error");
    }
});

document.getElementById('leaderboardSearch')?.addEventListener('input', (e) => {
    renderLeaderboard(e.target.value);
});

document.getElementById('proofImage')?.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    const maxImages = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    if (selectedFiles.length + newFiles.length > maxImages) {
        alert(`Only ${maxImages} screenshot(s) are allowed!`);
        return;
    }
    selectedFiles = selectedFiles.concat(newFiles);
    updateImagePreviews();
    e.target.value = '';
});

document.getElementById('addGPBtn')?.addEventListener('click', submitGPRequest);

document.getElementById('tabBtnSpenden')?.addEventListener('click', () => switchTab('Spenden'));
document.getElementById('tabBtnLeaderboard')?.addEventListener('click', () => switchTab('Leaderboard'));
document.getElementById('tabBtnProfile')?.addEventListener('click', () => switchTab('Profile'));
document.getElementById('tabBtnAdmin')?.addEventListener('click', () => {
    if (hasAdminPermission(currentGuildId) || isPanelOwner()) {
        switchTab('Admin');
        loadAdminData();
    } else {
        showNotify("You don't have permission to access Admin Panel!", "error");
    }
});
document.getElementById('tabBtnGuildLeader')?.addEventListener('click', () => {
    if (hasGuildLeaderPermission(currentGuildId) || isPanelOwner()) {
        switchTab('GuildLeader');
        loadRegisteredUsersCount();
        loadKickLogs();
    } else {
        showNotify("You don't have permission to access Guild Leader Panel!", "error");
    }
});
document.getElementById('tabBtnPanelOwner')?.addEventListener('click', () => {
    if (isPanelOwner()) {
        switchTab('PanelOwner');
        loadPanelOwnerData();
    } else {
        showNotify("You don't have permission to access Panel Owner Panel!", "error");
    }
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
    if (currentEditingMessageId) {
        window.sendSavedMessage(currentEditingMessageId);
    } else {
        const name = document.getElementById('messageName').value.trim();
        if (!name) {
            showNotify("Please save the message first or load an existing one!", "error");
            return;
        }
        saveMessage();
    }
});
document.getElementById('clearMessageFormBtn')?.addEventListener('click', clearMessageForm);
document.getElementById('enableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(true));
document.getElementById('disableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(false));

// ==========================================
// 16. APP START
// ==========================================

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

if (code) {
    if (state === 'discord') {
        handleDiscordLogin(code);
    } else if (state === 'roblox') {
        handleRobloxLogin(code);
    }
} else {
    const saved = sessionStorage.getItem('pn_session');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            if (!currentUser.id) throw new Error("Broken session");
            (async () => {
                await loadAvailableGuilds();
                if (availableGuilds.length === 1) {
                    await selectGuild(availableGuilds[0].id);
                } else if (availableGuilds.length > 1) {
                    showGuildSelector();
                } else {
                    document.getElementById('loginPage').classList.add('hidden');
                    document.getElementById('noPermissionPage').classList.remove('hidden');
                }
            })();
        } catch (e) {
            sessionStorage.removeItem('pn_session');
            playLoginMusic();
        }
    } else {
        playLoginMusic();
    }
}
