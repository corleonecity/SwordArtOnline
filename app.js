// ==========================================
// SWORD ART ONLINE - MULTI-GUILD PANEL (FRONTEND)
// KONFIGURATION NUN IM PANEL OWNER TAB
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// HELPER FUNCTIONS
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
// PERMISSION CHECKS
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
// DISCORD BOT INTERACTIONS
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
        const newNickname = `${robloxName} (@${robloxUsername})`;
        await fetch(`${BACKEND_URL}/update-nickname`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, nickname: newNickname, guildId: currentGuildId })
        });
    } catch (e) {}
}

// ==========================================
// TAB SWITCHING
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
    // Daten aktualisieren bei Bedarf
    if (tabName === 'PanelOwner' && isPanelOwner()) {
        loadPanelOwnerData();
    }
    if (tabName === 'Admin' && hasAdminPermission(currentGuildId)) {
        loadAdminData();
    }
}

// ==========================================
// PERMISSION UI UPDATES
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
        if (spendenContent && !spendenContent.classList.contains('hidden')) switchTab('Leaderboard');
    }
    
    if (tabBtnAdmin) tabBtnAdmin.style.display = (canAdmin || panelOwner) ? 'block' : 'none';
    if (tabBtnGuildLeader) tabBtnGuildLeader.style.display = (canGuildLeader || panelOwner) ? 'block' : 'none';
    if (tabBtnPanelOwner) tabBtnPanelOwner.style.display = panelOwner ? 'block' : 'none';
}

// ==========================================
// GUILD SELECTION & LOADING
// ==========================================

async function fetchUserRoles(userId, guildId) {
    if (!userId || !guildId) return [];
    try {
        const response = await fetch(`${BACKEND_URL}/user-roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, guildId })
        });
        if (response.ok) {
            const data = await response.json();
            userGuildRoles[guildId] = data.roles || [];
            return userGuildRoles[guildId];
        }
    } catch (e) { console.warn(e); }
    return [];
}

async function fetchRoleName(roleId) {
    if (roleNameCache[roleId]) return roleNameCache[roleId];
    if (!currentGuildId) return roleId;
    try {
        const response = await fetch(`${BACKEND_URL}/role-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId, guildId: currentGuildId })
        });
        if (response.ok) {
            const data = await response.json();
            roleNameCache[roleId] = data.name || roleId;
            return roleNameCache[roleId];
        }
    } catch (e) {}
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
    } catch (e) { console.error(e); }
    return [];
}

async function showGuildSelector() {
    const container = document.getElementById('guildSelectorContainer');
    container.innerHTML = `
        <div class="guild-selector-overlay">
            <div class="guild-selector-card">
                <i class="fas fa-server"></i>
                <h2>Select Discord Server</h2>
                <p>Choose which server you want to manage</p>
                <div id="guildList" class="guild-list"></div>
            </div>
        </div>
    `;
    const guildList = document.getElementById('guildList');
    for (const guild of availableGuilds) {
        const btn = document.createElement('button');
        btn.className = 'guild-selector-btn';
        btn.innerHTML = `
            ${guild.icon ? `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png" class="guild-icon">` : '<i class="fas fa-server"></i>'}
            <span>${escapeHtml(guild.name)}</span>
        `;
        btn.onclick = () => selectGuild(guild.id, guild.name);
        guildList.appendChild(btn);
    }
}

async function selectGuild(guildId, guildName) {
    currentGuildId = guildId;
    document.getElementById('guildSelectorContainer').innerHTML = '';
    // Zeige vollen Servernamen an
    document.getElementById('currentGuildDisplay').textContent = `📡 Server: ${escapeHtml(guildName)}`;
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
            roles: {
                adminPingRole: '',
                modPingRole: '',
                panelPingRole: ''
            },
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
    testModeEnabled = snap.exists() && snap.val().enabled === true;
    updateTestModeIndicator();
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
        updateProfileHistory(snapshot.val());
        if (hasAdminPermission(guildId)) updateAdminPending(snapshot.val());
    });
    if (isPanelOwner()) {
        onValue(ref(db, `guilds/${guildId}/logs/kicks`), (snapshot) => updateKickLogs(snapshot.val()));
    }
}

// ==========================================
// DASHBOARD & UI
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
    setInterval(() => updateBotStatus(), 60000);
}

function loadPanelOwnerData() {
    loadAdminRolesList();
    loadChannelConfigUI();
    loadRoleConfigUI();
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
    let usersArray = Object.values(allUsersData).filter(u => u.totalGP > 0).sort((a,b) => b.totalGP - a.totalGP);
    if (filterText) {
        const lower = filterText.toLowerCase();
        usersArray = usersArray.filter(u => (u.discordName?.toLowerCase().includes(lower)) || (u.robloxName?.toLowerCase().includes(lower)));
    }
    usersArray.forEach((u, i) => {
        body.innerHTML += `<tr><td>#${i+1}</td><td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.discordName||'Unknown')}</span><span class="username-handle">@${escapeHtml(u.discordUsername||'Unknown')}</span></div></td><td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.robloxName||'Unknown')}</span><span class="username-handle">@${escapeHtml(u.robloxUsername||'Unknown')}</span></div></td><td style="color:#48bb78;font-weight:bold;">${(u.totalGP||0).toLocaleString()} GP</td></tr>`;
    });
    if (usersArray.length === 0) body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;">No GP yet</td></tr>';
    const total = Object.values(allUsersData).reduce((s,u)=>s+(u.totalGP||0),0);
    const totalEl = document.getElementById('totalGpStat');
    if (totalEl) totalEl.textContent = total.toLocaleString();
}

function loadLeaderboard() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/users`), (snapshot) => {
        allUsersData = snapshot.val();
        const search = document.getElementById('leaderboardSearch')?.value || "";
        renderLeaderboard(search);
    });
}

function updateProfileHistory(data) {
    const body = document.getElementById('profileHistoryBody');
    if (!body) return;
    body.innerHTML = '';
    if (!data || !currentUser) return;
    const userReqs = Object.values(data).filter(r => r.userId === currentUser.id).sort((a,b)=>b.timestamp - a.timestamp);
    userReqs.forEach(req => {
        const date = new Date(req.timestamp).toLocaleString();
        let statusClass = '';
        if (req.status === 'pending') statusClass = 'status-pending';
        else if (req.status === 'approved') statusClass = 'status-approved';
        else statusClass = 'status-rejected';
        let statusText = req.status === 'pending' ? 'Pending ⏳' : (req.status === 'approved' ? 'Approved ✅' : 'Rejected ❌');
        body.innerHTML += `<tr><td>${date}</td><td>+${req.amount.toLocaleString()} GP</td><td><span class="status-badge ${statusClass}">${statusText}</span></td><td>${escapeHtml(req.adminComment || '-')}</td></tr>`;
    });
    if (userReqs.length === 0) body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;">No requests</td></tr>';
}

function updateAdminPending(data) {
    const body = document.getElementById('adminPendingBody');
    if (!body) return;
    body.innerHTML = '';
    if (!data) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;">No pending</td></tr>'; return; }
    const pending = Object.values(data).filter(r => r.status === 'pending').sort((a,b)=>a.timestamp - b.timestamp);
    if (pending.length === 0) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;">No pending</td></tr>'; return; }
    pending.forEach(req => {
        body.innerHTML += `
            <tr>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(req.discordName||'Unknown')}</span><span class="username-handle">@${escapeHtml(req.discordUsername||'Unknown')}</span></div></td>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(req.robloxName||'Unknown')}</span><span class="username-handle">@${escapeHtml(req.robloxUsername||'Unknown')}</span></div></td>
                <td style="color:#cd7f32;font-weight:bold;">+${req.amount.toLocaleString()} GP</td>
                <td>
                    <input type="text" id="comment_${req.id}" placeholder="Comment" style="padding:6px;font-size:12px;margin-bottom:5px;">
                    <div style="display:flex;gap:5px;">
                        <button class="btn-small btn-approve" onclick="window.handleAdminActionWithComment('${req.id}','${req.userId}',${req.amount},'approve','${req.dbKey}','${req.robloxId}','${escapeHtml(req.discordName)}','${escapeHtml(req.discordUsername)}','${escapeHtml(req.robloxName)}','${escapeHtml(req.robloxUsername)}')">Approve</button>
                        <button class="btn-small btn-deny" onclick="window.handleAdminActionWithComment('${req.id}','${req.userId}',${req.amount},'reject','${req.dbKey}','${req.robloxId}','${escapeHtml(req.discordName)}','${escapeHtml(req.discordUsername)}','${escapeHtml(req.robloxName)}','${escapeHtml(req.robloxUsername)}')">Reject</button>
                    </div>
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
// ADMIN ACTIONS (GP approve/reject)
// ==========================================

window.handleAdminActionWithComment = async (reqId, userId, amount, action, dbKey, robloxId, discordName, discordUsername, robloxName, robloxUsername) => {
    const commentInput = document.getElementById(`comment_${reqId}`);
    const adminComment = commentInput ? commentInput.value.trim() : '';
    if (!confirm(`${action === 'approve' ? 'APPROVE' : 'REJECT'}?${adminComment ? '\nComment: '+adminComment : ''}`)) return;
    if (testModeEnabled) {
        await update(ref(db, `guilds/${currentGuildId}/requests/${reqId}`), { status: action==='approve'?'approved':'rejected', adminComment, processedAt:Date.now(), processedBy:currentUser.id, testMode:true });
        showNotify(`Test: ${action==='approve'?'Approved':'Rejected'}`, 'warning');
        return;
    }
    try {
        await update(ref(db, `guilds/${currentGuildId}/requests/${reqId}`), { status: action==='approve'?'approved':'rejected', adminComment, processedAt:Date.now(), processedBy:currentUser.id });
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
        // Weiterleitung in den processed channel (optional)
        const channels = guildConfigs[currentGuildId]?.channels || {};
        const processedChannel = channels.CH_GP_PROCESSED;
        if (processedChannel) {
            const embed = {
                title: action==='approve'?'✅ GP Donation Approved':'❌ GP Donation Rejected',
                color: action==='approve'?0x48bb78:0xf56565,
                fields: [
                    { name: "Discord", value: `${discordName} (@${discordUsername})`, inline: true },
                    { name: "Roblox", value: `${robloxName} (@${robloxUsername})`, inline: true },
                    { name: "Amount", value: action==='approve'?`+${amount.toLocaleString()} GP`:`-${amount.toLocaleString()} GP`, inline: false },
                    { name: "New Total", value: `${newTotal.toLocaleString()} GP`, inline: true }
                ],
                timestamp: new Date().toISOString()
            };
            if (adminComment) embed.fields.push({ name: "Comment", value: adminComment, inline: false });
            await sendDiscordMessage(processedChannel, `<@${userId}>`, [embed]);
        }
        showNotify(`${action==='approve'?'Approved':'Rejected'}!`, 'success');
    } catch(e) { alert(e.message); }
};

// ==========================================
// IMAGE UPLOAD
// ==========================================

function updateImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    const countSpan = document.getElementById('fileCountText');
    const max = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    container.innerHTML = '';
    countSpan.textContent = `${selectedFiles.length} / ${max} selected`;
    selectedFiles.forEach((file, idx) => {
        const box = document.createElement('div');
        box.className = 'preview-box';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        const rm = document.createElement('button');
        rm.className = 'remove-img-btn';
        rm.innerHTML = '&times;';
        rm.onclick = () => { selectedFiles.splice(idx,1); updateImagePreviews(); };
        box.appendChild(img); box.appendChild(rm);
        container.appendChild(box);
    });
}

async function submitGPRequest() {
    if (!hasGpSubmitPermission(currentGuildId)) return showNotify("No permission!", "error");
    const amount = parseInt(document.getElementById('gpAmount').value);
    if (isNaN(amount) || amount <= 0) return alert("Valid amount required");
    if (selectedFiles.length === 0) return alert("At least one screenshot required");
    const max = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    if (selectedFiles.length > max) return alert(`Max ${max} images`);
    const btn = document.getElementById('addGPBtn');
    btn.disabled = true;
    btn.textContent = "SENDING...";
    try {
        const dbKey = getSafeDbKey(currentUser.username);
        const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
        const snap = await get(userRef);
        const userData = snap.val() || {};
        const dName = userData.discordName || currentUser.global_name || "Unknown";
        const dUser = userData.discordUsername || currentUser.username || "Unknown";
        const dId = currentUser.id;
        const rName = userData.robloxName || "Unknown";
        const rUser = userData.robloxUsername || "Unknown";
        const rId = userData.robloxId || "1";
        const newReqRef = push(ref(db, `guilds/${currentGuildId}/requests`));
        const reqKey = newReqRef.key;
        await set(newReqRef, {
            id: reqKey, dbKey, userId: dId, discordName: dName, discordUsername: dUser,
            robloxName: rName, robloxUsername: rUser, robloxId: rId,
            amount, status: 'pending', timestamp: Date.now()
        });
        showNotify("GP Request submitted!", "success");
        document.getElementById('gpAmount').value = '';
        selectedFiles = [];
        updateImagePreviews();
        switchTab('Profile');
    } catch(e) { alert(e.message); } finally { btn.disabled = false; btn.textContent = "SUBMIT PROOF"; }
}

// ==========================================
// PANEL OWNER CONFIGURATION UI
// ==========================================

async function loadAdminRolesList() {
    const container = document.getElementById('adminRolesList');
    if (!container) return;
    const config = guildConfigs[currentGuildId] || {};
    const adminRoles = config.adminRoles || [];
    const ownerRoles = config.ownerRoles || [];
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
    if (!roleId) return showNotify("Enter role ID", "error");
    const config = guildConfigs[currentGuildId] || {};
    let admin = config.adminRoles || [];
    let owner = config.ownerRoles || [];
    if (level === 'admin') { if (!admin.includes(roleId)) admin.push(roleId); }
    else { if (!owner.includes(roleId)) owner.push(roleId); }
    await set(ref(db, `guilds/${currentGuildId}/config`), { ...config, adminRoles: admin, ownerRoles: owner });
    guildConfigs[currentGuildId].adminRoles = admin;
    guildConfigs[currentGuildId].ownerRoles = owner;
    showNotify(`Role added as ${level==='admin'?'Admin':'Guild Leader'}`, "success");
    document.getElementById('newRoleId').value = '';
    await loadAdminRolesList();
    await fetchUserRoles(currentUser.id, currentGuildId);
    updatePermissions();
};

window.removeAdminRole = async (roleId) => {
    const config = guildConfigs[currentGuildId] || {};
    let admin = config.adminRoles || [];
    if (admin.includes(roleId)) admin = admin.filter(r => r !== roleId);
    await set(ref(db, `guilds/${currentGuildId}/config`), { ...config, adminRoles: admin });
    guildConfigs[currentGuildId].adminRoles = admin;
    showNotify("Role removed", "success");
    await loadAdminRolesList();
    await fetchUserRoles(currentUser.id, currentGuildId);
    updatePermissions();
};

window.removeOwnerRole = async (roleId) => {
    const config = guildConfigs[currentGuildId] || {};
    let owner = config.ownerRoles || [];
    if (owner.includes(roleId)) owner = owner.filter(r => r !== roleId);
    await set(ref(db, `guilds/${currentGuildId}/config`), { ...config, ownerRoles: owner });
    guildConfigs[currentGuildId].ownerRoles = owner;
    showNotify("Role removed", "success");
    await loadAdminRolesList();
    await fetchUserRoles(currentUser.id, currentGuildId);
    updatePermissions();
};

async function loadChannelConfigUI() {
    const container = document.getElementById('channelConfigList');
    if (!container) return;
    const channels = guildConfigs[currentGuildId]?.channels || {};
    const channelList = [
        { key: 'CH_LEAVE_LOGS', name: '📤 Leave Logs', desc: 'User leave notifications' },
        { key: 'CH_USER_INFO', name: '🛡️ User Info Board', desc: 'Guild member list board' },
        { key: 'CH_PANEL_INFO', name: '💻 Panel Info Board', desc: 'Registration info board' },
        { key: 'CH_LEADERBOARD', name: '🏆 Leaderboard Channel', desc: 'GP leaderboard' },
        { key: 'CH_GP_REQUESTS', name: '💎 GP Requests', desc: 'New GP requests' },
        { key: 'CH_GP_PROCESSED', name: '✅ GP Processed', desc: 'Approved/rejected' },
        { key: 'CH_LOGIN_LOGS', name: '🔐 Login Logs', desc: 'User login notifications' },
        { key: 'CH_BOT_DM_LOGS', name: '📨 Bot DM Logs', desc: '/admin command messages' }
    ];
    container.innerHTML = channelList.map(ch => `
        <div class="channel-config-item">
            <div class="channel-config-name">${ch.name}</div>
            <div class="channel-config-description">${ch.desc}</div>
            <div class="channel-config-input">
                <input type="text" id="cfg_${ch.key}" value="${channels[ch.key] || ''}" placeholder="Channel ID">
                <span>Channel ID</span>
            </div>
        </div>
    `).join('');
}

async function saveChannelConfig() {
    const keys = ['CH_LEAVE_LOGS','CH_USER_INFO','CH_PANEL_INFO','CH_LEADERBOARD','CH_GP_REQUESTS','CH_GP_PROCESSED','CH_LOGIN_LOGS','CH_BOT_DM_LOGS'];
    const newChannels = {};
    for (const k of keys) {
        const val = document.getElementById(`cfg_${k}`)?.value.trim();
        if (val) newChannels[k] = val;
    }
    const config = guildConfigs[currentGuildId] || {};
    await set(ref(db, `guilds/${currentGuildId}/config/channels`), newChannels);
    config.channels = newChannels;
    guildConfigs[currentGuildId] = config;
    showNotify("Channel config saved", "success");
}

async function loadRoleConfigUI() {
    const roles = guildConfigs[currentGuildId]?.roles || {};
    document.getElementById('roleAdminPing').value = roles.adminPingRole || '';
    document.getElementById('roleModPing').value = roles.modPingRole || '';
    document.getElementById('rolePanelPing').value = roles.panelPingRole || '';
}

async function saveRolesConfig() {
    const newRoles = {
        adminPingRole: document.getElementById('roleAdminPing').value.trim(),
        modPingRole: document.getElementById('roleModPing').value.trim(),
        panelPingRole: document.getElementById('rolePanelPing').value.trim()
    };
    const config = guildConfigs[currentGuildId] || {};
    config.roles = newRoles;
    await set(ref(db, `guilds/${currentGuildId}/config/roles`), newRoles);
    guildConfigs[currentGuildId] = config;
    showNotify("Role config saved", "success");
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
    const newSystem = {
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
    const config = guildConfigs[currentGuildId] || {};
    config.system = newSystem;
    await set(ref(db, `guilds/${currentGuildId}/config/system`), newSystem);
    guildConfigs[currentGuildId] = config;
    showNotify("System config saved", "success");
}

async function saveGpSubmitRole() {
    const roleId = document.getElementById('gpSubmitRoleId').value.trim();
    if (!roleId) return showNotify("Enter role ID", "error");
    const config = guildConfigs[currentGuildId] || {};
    config.gpSubmitRole = roleId;
    await set(ref(db, `guilds/${currentGuildId}/config/gpSubmitRole`), roleId);
    guildConfigs[currentGuildId] = config;
    showNotify("GP Submit role saved", "success");
    updatePermissions();
}

function updateKickLogs(data) {
    const body = document.getElementById('kickLogsBody');
    if (!body) return;
    body.innerHTML = '';
    if (!data) { body.innerHTML = '<tr><td colspan="5">No logs</td></tr>'; return; }
    const logs = Object.values(data).sort((a,b)=>b.timestamp - a.timestamp);
    logs.forEach(log => {
        body.innerHTML += `<tr><td>${new Date(log.timestamp).toLocaleString()}</td><td>${escapeHtml(log.kickedUserName||log.kickedUserId)}</td><td>${escapeHtml(log.kickedByUserName||log.kickedByUserId)}</td><td>${escapeHtml(log.reason||'-')}</td><td>${log.dmSent?'✅':'❌'}</td></tr>`;
    });
}

function loadKickLogs() {
    if (!currentGuildId) return;
    onValue(ref(db, `guilds/${currentGuildId}/logs/kicks`), (snap) => updateKickLogs(snap.val()));
}

async function loadRegisteredUsersCount() {
    const snap = await get(ref(db, `guilds/${currentGuildId}/users`));
    const users = snap.val() || {};
    let count = 0;
    for (const u of Object.values(users)) if (u.robloxId && u.robloxId !== '1') count++;
    document.getElementById('statTotalUsers').textContent = count;
}

async function setMaintenanceMode(enabled) {
    if (!isPanelOwner()) return showNotify("Only Panel Owner", "error");
    await set(ref(db, `guilds/${currentGuildId}/config/maintenance`), { enabled });
    document.getElementById('maintenanceOverlay').classList.toggle('hidden', !enabled);
    document.getElementById('maintenanceStatusText').textContent = enabled ? 'Enabled' : 'Disabled';
    showNotify(`Maintenance ${enabled?'ENABLED':'DISABLED'}`, enabled?'warning':'success');
}

async function setTestMode(enabled) {
    if (!isPanelOwner()) return showNotify("Only Panel Owner", "error");
    await set(ref(db, `guilds/${currentGuildId}/config/testMode`), { enabled });
    testModeEnabled = enabled;
    updateTestModeIndicator();
    showNotify(`Test mode ${enabled?'ENABLED':'DISABLED'}`, enabled?'warning':'success');
}

// ==========================================
// SAVED MESSAGES (identisch zu vorher, aber mit guilds/{guildId}/saved_messages)
// ==========================================

async function loadSavedMessages() {
    const messagesRef = ref(db, `guilds/${currentGuildId}/saved_messages`);
    onValue(messagesRef, (snapshot) => {
        const data = snapshot.val();
        const container = document.getElementById('savedMessagesList');
        if (!container) return;
        if (!data || Object.keys(data).length === 0) {
            container.innerHTML = '<p style="color:#666;">No saved messages</p>';
            return;
        }
        container.innerHTML = '';
        Object.entries(data).forEach(([id, msg]) => {
            container.innerHTML += `
                <div class="saved-message-item" data-id="${id}">
                    <div class="message-name">📝 ${escapeHtml(msg.name)}</div>
                    <div class="message-channel">📡 Channel: ${escapeHtml(msg.channelId||'Not set')}</div>
                    <div class="message-id">${msg.discordMessageId ? `✅ ID: ${msg.discordMessageId.substring(0,8)}...` : '⚠️ Not sent'}</div>
                    <div class="message-preview"><strong>Message:</strong> ${escapeHtml(msg.content?.substring(0,100))}${msg.embedTitle?`<br><strong>Embed:</strong> ${escapeHtml(msg.embedTitle)}`:''}</div>
                    <div class="message-actions">
                        <button class="btn-edit-message" onclick="window.editSavedMessage('${id}')">✏️ Edit</button>
                        <button class="btn-send-message" onclick="window.sendSavedMessage('${id}')">📤 Send/Update</button>
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
    saveBtn.textContent = '✏️ Update';
    saveBtn.style.background = '#ffd700';
    showNotify(`Editing "${msg.name}"`, "success");
};

async function saveMessage() {
    const name = document.getElementById('messageName').value.trim();
    const channelId = document.getElementById('messageChannelId').value.trim();
    const content = document.getElementById('messageContent').value;
    const embedTitle = document.getElementById('messageEmbedTitle').value;
    const embedDesc = document.getElementById('messageEmbedDesc').value;
    const embedColor = document.getElementById('messageEmbedColor').value;
    if (!name || !channelId) return showNotify("Name and Channel ID required", "error");
    const msgData = { name, channelId, content, embedTitle, embedDesc, embedColor, updatedAt: Date.now(), updatedBy: currentUser?.id };
    try {
        if (currentEditingMessageId) {
            const existing = await get(ref(db, `guilds/${currentGuildId}/saved_messages/${currentEditingMessageId}`));
            if (existing.exists() && existing.val().discordMessageId) msgData.discordMessageId = existing.val().discordMessageId;
            await update(ref(db, `guilds/${currentGuildId}/saved_messages/${currentEditingMessageId}`), msgData);
            showNotify(`Updated "${name}"`, "success");
            currentEditingMessageId = null;
            const saveBtn = document.getElementById('saveMessageBtn');
            saveBtn.textContent = '💾 Save';
            saveBtn.style.background = '#48bb78';
        } else {
            await push(ref(db, `guilds/${currentGuildId}/saved_messages`), { ...msgData, createdAt: Date.now(), createdBy: currentUser?.id });
            showNotify(`Saved "${name}"`, "success");
        }
        document.getElementById('messageName').value = '';
        document.getElementById('messageChannelId').value = '';
        document.getElementById('messageContent').value = '';
        document.getElementById('messageEmbedTitle').value = '';
        document.getElementById('messageEmbedDesc').value = '';
        document.getElementById('messageEmbedColor').value = '#5865F2';
        loadSavedMessages();
    } catch(e) { showNotify("Error saving", "error"); }
}

window.sendSavedMessage = async (id) => {
    const snap = await get(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`));
    const msg = snap.val();
    if (!msg || !msg.channelId) return showNotify("No channel ID", "error");
    let embeds = null;
    if (msg.embedTitle || msg.embedDesc) {
        embeds = [{
            title: msg.embedTitle || undefined,
            description: msg.embedDesc || undefined,
            color: msg.embedColor ? parseInt(msg.embedColor.replace('#',''),16) : 0x5865F2,
            timestamp: new Date().toISOString()
        }];
    }
    let storedId = msg.discordMessageId;
    let success = false;
    if (storedId) {
        const res = await fetch(`${BACKEND_URL}/update-message`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: msg.channelId, messageId: storedId, content: msg.content, embeds })
        });
        if (res.ok) success = true;
        else if (res.status === 404) storedId = null;
    }
    if (!storedId) {
        const res = await fetch(`${BACKEND_URL}/send-channel-message`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: msg.channelId, content: msg.content, embeds })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.messageId) await update(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`), { discordMessageId: data.messageId, lastSentAt: Date.now() });
            success = true;
        }
    }
    if (success) showNotify(`Sent "${msg.name}"`, "success");
    else showNotify(`Failed to send "${msg.name}"`, "error");
    loadSavedMessages();
};

window.deleteSavedMessage = async (id) => {
    if (!confirm("Delete?")) return;
    await remove(ref(db, `guilds/${currentGuildId}/saved_messages/${id}`));
    showNotify("Deleted", "success");
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
    const saveBtn = document.getElementById('saveMessageBtn');
    saveBtn.textContent = '💾 Save';
    saveBtn.style.background = '#48bb78';
    showNotify("Form cleared", "success");
}

// ==========================================
// LOGIN / AUTH
// ==========================================

async function doLiveCheck() {
    if (!currentUser || !currentGuildId) return false;
    try {
        const res = await fetch(`${BACKEND_URL}/check-member`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, guildId: currentGuildId })
        });
        if (!res.ok) return forceKickUser();
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
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
        });
        const data = await res.json();
        if (data.isAuthorized && data.isMember) {
            currentUser = data.user;
            sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
            window.history.replaceState({}, '', REDIRECT_URI);
            await loadAvailableGuilds();
            if (availableGuilds.length === 0) {
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('noPermissionPage').classList.remove('hidden');
            } else if (availableGuilds.length === 1) {
                await selectGuild(availableGuilds[0].id, availableGuilds[0].name);
            } else {
                showGuildSelector();
            }
        } else {
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('noPermissionPage').classList.remove('hidden');
        }
    } catch(e) { alert("Login Error"); }
}

async function handleRobloxLogin(code) {
    try {
        currentUser = JSON.parse(sessionStorage.getItem('pn_session'));
        const res = await fetch(`${BACKEND_URL}/roblox-token`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
        });
        const data = await res.json();
        if (data.success && data.robloxUser) {
            const rDisplay = data.robloxUser.nickname || data.robloxUser.name;
            const rUser = data.robloxUser.preferred_username || data.robloxUser.name;
            const rId = data.robloxUser.sub;
            const dDisplay = currentUser.global_name || currentUser.username;
            const dbKey = getSafeDbKey(currentUser.username);
            const userRef = ref(db, `guilds/${currentGuildId}/users/${dbKey}`);
            const snap = await get(userRef);
            const currentGP = snap.exists() ? (snap.val().totalGP || 0) : 0;
            await update(userRef, {
                discordName: dDisplay, discordUsername: currentUser.username,
                robloxName: rDisplay, robloxUsername: rUser, robloxId: rId,
                totalGP: currentGP, id: currentUser.id, hasLeftServer: false
            });
            await updateDiscordNickname(currentUser.id, rDisplay, rUser);
            window.location.href = REDIRECT_URI;
        }
    } catch(e) { alert("Roblox linking error"); }
}

// ==========================================
// EVENT LISTENERS
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
    const dbKey = getSafeDbKey(currentUser.username);
    await update(ref(db, `guilds/${currentGuildId}/users/${dbKey}`), { robloxId: null, robloxName: null, robloxUsername: null });
    window.location.reload();
});
document.getElementById('leaderboardSearch')?.addEventListener('input', (e) => renderLeaderboard(e.target.value));
document.getElementById('proofImage')?.addEventListener('change', (e) => {
    const max = guildConfigs[currentGuildId]?.system?.limits?.maxImagesPerRequest || 1;
    const newFiles = Array.from(e.target.files);
    if (selectedFiles.length + newFiles.length > max) return alert(`Max ${max} images`);
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
    else showNotify("No permission", "error");
});
document.getElementById('tabBtnGuildLeader')?.addEventListener('click', () => {
    if (hasGuildLeaderPermission(currentGuildId) || isPanelOwner()) switchTab('GuildLeader');
    else showNotify("No permission", "error");
});
document.getElementById('tabBtnPanelOwner')?.addEventListener('click', () => {
    if (isPanelOwner()) switchTab('PanelOwner');
    else showNotify("No permission", "error");
});
document.getElementById('addRoleBtn')?.addEventListener('click', window.addAdminRole);
document.getElementById('saveChannelConfigBtn')?.addEventListener('click', saveChannelConfig);
document.getElementById('saveRolesConfigBtn')?.addEventListener('click', saveRolesConfig);
document.getElementById('saveSystemConfigBtn')?.addEventListener('click', saveSystemConfig);
document.getElementById('saveGpSubmitRoleBtn')?.addEventListener('click', saveGpSubmitRole);
document.getElementById('refreshUsersBtn')?.addEventListener('click', loadRegisteredUsersCount);
document.getElementById('enableTestModeBtn')?.addEventListener('click', () => setTestMode(true));
document.getElementById('disableTestModeBtn')?.addEventListener('click', () => setTestMode(false));
document.getElementById('saveMessageBtn')?.addEventListener('click', saveMessage);
document.getElementById('sendMessageBtn')?.addEventListener('click', () => {
    if (currentEditingMessageId) window.sendSavedMessage(currentEditingMessageId);
    else {
        if (!document.getElementById('messageName').value.trim()) return showNotify("Save or load first", "error");
        saveMessage();
    }
});
document.getElementById('clearMessageFormBtn')?.addEventListener('click', clearMessageForm);
document.getElementById('enableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(true));
document.getElementById('disableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(false));

// ==========================================
// APP START
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
                if (availableGuilds.length === 1) {
                    await selectGuild(availableGuilds[0].id, availableGuilds[0].name);
                } else if (availableGuilds.length > 1) {
                    showGuildSelector();
                } else {
                    document.getElementById('loginPage').classList.add('hidden');
                    document.getElementById('noPermissionPage').classList.remove('hidden');
                }
            })();
        } catch(e) { sessionStorage.removeItem('pn_session'); playLoginMusic(); }
    } else {
        playLoginMusic();
    }
}
