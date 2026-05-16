// ==========================================
// 1. SETTINGS & CONFIGURATION
// ==========================================

const OWNER_USER_ID = '917426398120005653';

// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update, push, remove, off } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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

const DISCORD_CLIENT_ID = '1503179151073345678';
const ROBLOX_CLIENT_ID = '1529843549493669743';

const BACKEND_URL = 'https://gentle-queen-63f0.keulecolin2005.workers.dev';
const REDIRECT_URI = 'https://corleonecity.github.io/SwordArtOnline/';

// Guild Scoped Variables
let activeGuildId = localStorage.getItem('pn_active_guild') || null;
let ADMIN_ROLES = [];
let OWNER_ROLES = [];
let GP_SUBMIT_ROLE = '';
let TICKET_MOD_ROLE = '';
let ADMIN_PING_ROLE = '';

// System configuration
let systemConfig = {
    embedColors: {
        approve: '#48bb78',
        reject: '#f56565',
        pending: '#cd7f32',
        info: '#5865F2',
        leaderboard: '#ffd700'
    },
    limits: {
        maxImagesPerRequest: 1
    },
    musicUrl: 'https://www.youtube.com/embed/BtEkzZoUCpw?autoplay=1&loop=1',
};

// Test mode
let testModeEnabled = false;

// Global variables
let currentUser = null;
let selectedFiles = [];
let allUsersData = {};
let liveCheckInterval = null;
let userGuildRoles = [];
let currentEditingMessageId = null;

// Track active listeners to clear them when changing servers
let activeDbListeners = []; 

// ==========================================
// 2. LOAD CONFIGURATIONS FROM FIREBASE
// ==========================================

function getDbRef(path) {
    return ref(db, `servers/${activeGuildId}/${path}`);
}

async function loadRoleConfig() {
    if (!activeGuildId) return;
    const snap = await get(getDbRef('config/admin_roles'));
    if (snap.exists()) {
        const data = snap.val();
        ADMIN_ROLES = data.adminRoles || [];
        OWNER_ROLES = data.ownerRoles || [];
    } else {
        ADMIN_ROLES = [];
        OWNER_ROLES = [];
    }
}

async function getChannelConfig() {
    if (!activeGuildId) return {};
    try {
        const snap = await get(getDbRef('config/channels'));
        return snap.val() || {};
    } catch (e) {
        return {};
    }
}

async function loadSystemConfig() {
    if (!activeGuildId) return;
    const snap = await get(getDbRef('config/system'));
    if (snap.exists()) {
        const data = snap.val();
        if (data.embedColors) systemConfig.embedColors = { ...systemConfig.embedColors, ...data.embedColors };
        if (data.limits) systemConfig.limits = { ...systemConfig.limits, ...data.limits };
        if (data.musicUrl) systemConfig.musicUrl = data.musicUrl;
        
        GP_SUBMIT_ROLE = data.gpSubmitRole || '';
        TICKET_MOD_ROLE = data.ticketModRole || '';
        ADMIN_PING_ROLE = data.adminPingRole || '';
    }
}

async function loadTestMode() {
    if (!activeGuildId) return;
    const snap = await get(getDbRef('config/testMode'));
    if (snap.exists()) {
        testModeEnabled = snap.val().enabled === true;
        updateTestModeIndicator();
    }
}

async function loadMaintenanceStatus() {
    // Maintenance might be global, but keeping it guild-scoped is better for multi-discord
    if (!activeGuildId) return;
    const snap = await get(getDbRef('config/maintenance'));
    if (snap.exists() && snap.val().enabled) {
        document.getElementById('maintenanceOverlay').classList.remove('hidden');
        document.getElementById('maintenanceStatusText').textContent = 'Enabled';
    } else {
        document.getElementById('maintenanceOverlay').classList.add('hidden');
        document.getElementById('maintenanceStatusText').textContent = 'Disabled';
    }
}

function updateTestModeIndicator() {
    const indicator = document.getElementById('testModeIndicator');
    const statusText = document.getElementById('testModeStatusText');
    if (testModeEnabled) {
        indicator.classList.remove('hidden');
        if (statusText) statusText.textContent = 'Enabled';
    } else {
        indicator.classList.add('hidden');
        if (statusText) statusText.textContent = 'Disabled';
    }
}

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

function getSafeDbKey(username) {
    return username ? username.replace(/[.#$\[\]]/g, '_') : 'unknown_user';
}

function playLoginMusic() {
    const ac = document.getElementById('audioPlayerContainer');
    if (ac.innerHTML === '') {
        ac.innerHTML = `<iframe width="0" height="0" src="${systemConfig.musicUrl}" frameborder="0" allow="autoplay"></iframe>`;
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

function switchTab(tabName) {
    const tabs = ['Spenden', 'Leaderboard', 'Profile', 'Admin', 'Owner'];
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

function hasAdminPermission() {
    if (!currentUser) return false;
    if (currentUser.id === OWNER_USER_ID) return true;
    return userGuildRoles.some(role => ADMIN_ROLES.includes(role));
}

function hasOwnerPermission() {
    if (!currentUser) return false;
    if (currentUser.id === OWNER_USER_ID) return true;
    return userGuildRoles.some(role => OWNER_ROLES.includes(role));
}

function hasGpSubmitPermission() {
    if (!GP_SUBMIT_ROLE) return true; // If not configured, everyone can
    return userGuildRoles.includes(GP_SUBMIT_ROLE);
}

function updatePermissions() {
    const gpSubmitCard = document.getElementById('gpSubmitCard');
    const noPermissionCard = document.getElementById('noPermissionCard');
    const tabBtnSpenden = document.getElementById('tabBtnSpenden');
    const tabBtnAdmin = document.getElementById('tabBtnAdmin');
    const tabBtnOwner = document.getElementById('tabBtnOwner');
    const spendenContent = document.getElementById('content-spenden');
    
    if (hasGpSubmitPermission() || hasAdminPermission() || hasOwnerPermission()) {
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
        tabBtnAdmin.style.display = hasAdminPermission() ? 'block' : 'none';
    }
    
    if (tabBtnOwner) {
        tabBtnOwner.style.display = hasOwnerPermission() ? 'block' : 'none';
    }
}

async function fetchUserRoles(userId) {
    if (!userId || !BACKEND_URL || !activeGuildId) {
        userGuildRoles = [];
        return [];
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/user-roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId, guildId: activeGuildId })
        });
        
        if (response.ok) {
            const data = await response.json();
            userGuildRoles = data.roles || [];
        } else {
            userGuildRoles = [];
        }
    } catch (e) {
        userGuildRoles = [];
    }
    
    await loadRoleConfig();
    updatePermissions();
    return userGuildRoles;
}

let roleNameCache = {};
async function fetchRoleName(roleId) {
    if (roleNameCache[roleId]) return roleNameCache[roleId];
    if (!activeGuildId) return roleId;
    
    try {
        const response = await fetch(`${BACKEND_URL}/role-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId: roleId, guildId: activeGuildId })
        });
        
        if (response.ok) {
            const data = await response.json();
            roleNameCache[roleId] = data.name || roleId;
            return roleNameCache[roleId];
        }
    } catch (e) {}
    return roleId;
}

// ==========================================
// 4. DISCORD BOT MESSAGES
// ==========================================

async function sendDiscordMessage(channelId, content, embeds = null) {
    if (!channelId) return false;
    
    try {
        const response = await fetch(`${BACKEND_URL}/send-channel-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, content, embeds, guildId: activeGuildId })
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

async function updateBotStatus() {
    try {
        const totalGP = Object.values(allUsersData).reduce((sum, u) => sum + (u.totalGP || 0), 0);
        await fetch(`${BACKEND_URL}/update-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: `🎮 Total GP: ${totalGP.toLocaleString()}`, guildId: activeGuildId })
        });
    } catch (e) {}
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
                guildId: activeGuildId
            })
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

async function sendLoginToDiscord(userData) {
    const channels = await getChannelConfig();
    const loginLogsChannel = channels.CH_LOGIN_LOGS;
    if (!loginLogsChannel) return false;
    
    const embed = {
        title: "🟢 New User Registered",
        color: parseInt(systemConfig.embedColors.info.replace('#', ''), 16),
        fields: [
            { name: "💬 Discord", value: `**Name:** ${userData.discordName}\n**Tag:** @${userData.discordUsername}\n**ID:** <@${userData.userId}>`, inline: true },
            { name: "🎮 Roblox", value: `**Name:** ${userData.robloxName}\n**User:** @${userData.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${userData.robloxId}/profile)`, inline: true }
        ]
    };
    
    return sendDiscordMessage(loginLogsChannel, null, [embed]);
}

async function sendGPRequestToDiscord(requestData, images) {
    const formData = new FormData();
    const adminRoleId = ADMIN_ROLES[0] || '';
    
    const channels = await getChannelConfig();
    const gpRequestsChannel = channels.CH_GP_REQUESTS;
    if (!gpRequestsChannel) return false;
    
    const embed = {
        title: "💎 New GP Donation Request",
        color: parseInt(systemConfig.embedColors.pending.replace('#', ''), 16),
        fields: [
            { name: "💬 Discord", value: `**Name:** ${requestData.discordName}\n**Tag:** @${requestData.discordUsername}\n**Ping:** <@${requestData.userId}>`, inline: true },
            { name: "🎮 Roblox", value: `**Name:** ${requestData.robloxName}\n**User:** @${requestData.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${requestData.robloxId}/profile)`, inline: true },
            { name: "💰 Amount", value: `**+${requestData.amount.toLocaleString()} GP**`, inline: false },
            { name: "📊 Status", value: "⏳ Pending Review", inline: true },
            { name: "🆔 Request ID", value: `\`${requestData.requestId}\``, inline: true }
        ]
    };
    
    if (images && images.length > 0) {
        embed.image = { url: "attachment://proof_1.png" };
    }

    const components = [{
        type: 1,
        components: [
            { type: 2, style: 3, label: "Approve", custom_id: `approve_${requestData.requestId}`, emoji: { name: "✅" } },
            { type: 2, style: 4, label: "Reject", custom_id: `reject_${requestData.requestId}`, emoji: { name: "❌" } }
        ]
    }];

    formData.append('payload_json', JSON.stringify({
        content: adminRoleId ? `<@&${adminRoleId}>` : "",
        embeds: [embed],
        components: components,
        guildId: activeGuildId
    }));
    
    const imagesToSend = images.slice(0, systemConfig.limits.maxImagesPerRequest);
    for (let i = 0; i < imagesToSend.length; i++) {
        formData.append(`file${i}`, imagesToSend[i], `proof_${i+1}.png`);
    }

    try {
        const response = await fetch(`${BACKEND_URL}/send-gp-request-with-buttons`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.messageId) {
                await update(getDbRef(`requests/${requestData.requestId}`), { discordMessageId: data.messageId });
            }
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// ==========================================
// 5. DISCORD & ROBLOX AUTHENTIFICATION
// ==========================================

async function doLiveCheck() {
    if (!currentUser || !activeGuildId) return false;
    try {
        const res = await fetch(`${BACKEND_URL}/check-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, guildId: activeGuildId })
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

function populateGuildSelector(guilds) {
    const selector = document.getElementById('serverSelector');
    selector.innerHTML = '';
    
    // Only show guilds where the user has Manage Guild or Admin permissions
    const adminGuilds = guilds.filter(g => (g.permissions & 0x8) === 0x8 || (g.permissions & 0x20) === 0x20);
    
    if (adminGuilds.length === 0) {
        forceKickUser();
        return false;
    }
    
    adminGuilds.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        if (g.id === activeGuildId) opt.selected = true;
        selector.appendChild(opt);
    });
    
    if (!activeGuildId || !adminGuilds.find(g => g.id === activeGuildId)) {
        activeGuildId = selector.value;
        localStorage.setItem('pn_active_guild', activeGuildId);
    }
    
    selector.addEventListener('change', (e) => {
        activeGuildId = e.target.value;
        localStorage.setItem('pn_active_guild', activeGuildId);
        window.location.reload(); // Cleanest way to reset all states and DB listeners
    });
    
    return true;
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
            sessionStorage.setItem('pn_guilds', JSON.stringify(data.guilds || []));
            window.history.replaceState({}, '', REDIRECT_URI);
            checkRobloxLink();
        } else {
            forceKickUser();
        }
    } catch (e) {
        alert("Login Error!");
    }
}

async function handleRobloxLogin(code) {
    try {
        currentUser = JSON.parse(sessionStorage.getItem('pn_session'));
        if(!activeGuildId) {
            window.location.href = REDIRECT_URI;
            return;
        }

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
            const userRef = getDbRef(`users/${dbKey}`);
            const snap = await get(userRef);
            let currentGP = snap.exists() && snap.val().totalGP ? snap.val().totalGP : 0;
            
            await update(userRef, {
                discordName: dDisplayName,
                discordUsername: currentUser.username,
                robloxName: rDisplayName,
                robloxUsername: rUsername,
                robloxId: rId,
                totalGP: currentGP,
                id: currentUser.id,
                hasLeftServer: false
            });

            await updateDiscordNickname(currentUser.id, rDisplayName, rUsername);

            if (!snap.exists() || !snap.val().loginNotified) {
                const success = await sendLoginToDiscord({
                    discordName: dDisplayName,
                    discordUsername: currentUser.username,
                    userId: currentUser.id,
                    robloxName: rDisplayName,
                    robloxUsername: rUsername,
                    robloxId: rId
                });
                if (success) await update(userRef, { loginNotified: true });
            }

            fetch(`${BACKEND_URL}/check-member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, guildId: activeGuildId, updateRoles: true })
            });

            window.location.href = REDIRECT_URI;
        }
    } catch (e) {
        alert("Linking Error!");
    }
}

async function checkRobloxLink() {
    try {
        const guilds = JSON.parse(sessionStorage.getItem('pn_guilds') || '[]');
        if(!populateGuildSelector(guilds)) return;

        const isStillMember = await doLiveCheck();
        if (!isStillMember) return;

        await loadRoleConfig();
        await loadSystemConfig();
        await loadTestMode();
        await loadMaintenanceStatus();
        
        const dbKey = getSafeDbKey(currentUser.username);
        const snap = await get(getDbRef(`users/${dbKey}`));
        document.getElementById('loginPage').classList.add('hidden');
        
        if (snap.exists() && snap.val().robloxId) {
            await fetchUserRoles(currentUser.id);
            showDashboard();
            startLiveMemberCheck();
        } else {
            document.getElementById('robloxPage').classList.remove('hidden');
            playLoginMusic();
            startLiveMemberCheck();
        }
    } catch (err) {
        if (currentUser) showDashboard();
    }
}

// ==========================================
// 6. DASHBOARD & UI
// ==========================================

function attachDbListener(refPath, callback) {
    const reference = getDbRef(refPath);
    onValue(reference, callback);
    activeDbListeners.push(reference);
}

function clearDbListeners() {
    activeDbListeners.forEach(ref => off(ref));
    activeDbListeners = [];
}

function showDashboard() {
    stopMusic();
    document.getElementById('robloxPage').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('userWelcome').textContent = `Hi, ${currentUser.global_name || currentUser.username}`;
    if (currentUser.avatar) {
        document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
    }
    
    updatePermissions();
    clearDbListeners();
    
    loadLeaderboard();
    loadProfileHistory();
    
    if (hasAdminPermission()) {
        loadAdminData();
    }
    
    if (hasOwnerPermission()) {
        loadAdminRolesList();
        loadChannelConfigUI();
        loadKickLogs();
        loadSavedMessages();
        loadSystemConfigUI();
        loadRegisteredUsersCount();
    }
    
    updateBotStatus();
}

function renderLeaderboard(filterText) {
    const body = document.getElementById('leaderboardBody');
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
    attachDbListener('users', (snapshot) => {
        allUsersData = snapshot.val();
        const searchValue = document.getElementById('leaderboardSearch')?.value || "";
        renderLeaderboard(searchValue);
    });
}

function loadProfileHistory() {
    attachDbListener('requests', (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('profileHistoryBody');
        body.innerHTML = '';
        if (!data || !currentUser) return;
        
        const userRequests = Object.values(data)
            .filter(r => r.userId === currentUser.id)
            .sort((a, b) => b.timestamp - a.timestamp);
        
        userRequests.forEach(req => {
            const dateStr = new Date(req.timestamp).toLocaleDateString();
            
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
    });
}

// ==========================================
// 7. IMAGE UPLOAD & PREVIEW
// ==========================================
function updateImagePreviews() {
    const previewContainer = document.getElementById('imagePreviewContainer');
    const fileCountText = document.getElementById('fileCountText');
    
    previewContainer.innerHTML = '';
    fileCountText.textContent = `${selectedFiles.length} / ${systemConfig.limits.maxImagesPerRequest} image(s) selected`;
    
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
// 8. GP SUBMIT FUNCTION
// ==========================================

async function submitGPRequest() {
    if (!hasGpSubmitPermission()) {
        showNotify("You don't have permission to submit GP requests!", "error");
        return;
    }
    
    const amount = parseInt(document.getElementById('gpAmount').value);
    const btn = document.getElementById('addGPBtn');
    
    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount!");
        return;
    }
    if (selectedFiles.length === 0) {
        alert("Please add at least 1 screenshot as proof!");
        return;
    }
    
    btn.disabled = true;
    btn.textContent = "SENDING...";

    try {
        const dbKey = getSafeDbKey(currentUser.username);
        const userRef = getDbRef(`users/${dbKey}`);
        const snap = await get(userRef);
        const userData = snap.val() || {};

        const dName = userData.discordName || currentUser.global_name || "Unknown";
        const dUser = userData.discordUsername || currentUser.username || "Unknown";
        const dId = currentUser.id;
        const rName = userData.robloxName || "Unknown";
        const rUser = userData.robloxUsername || "Unknown";
        const rId = userData.robloxId || "1";

        const newReqRef = push(getDbRef('requests'));
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

        const success = await sendGPRequestToDiscord({
            discordName: dName,
            discordUsername: dUser,
            userId: dId,
            robloxName: rName,
            robloxUsername: rUser,
            robloxId: rId,
            amount: amount,
            requestId: reqKey
        }, selectedFiles);

        if (success) showNotify(`GP Request submitted!`, "success");
        else showNotify(`Request saved but Discord notification failed!`, "warning");

        document.getElementById('gpAmount').value = '';
        selectedFiles = [];
        updateImagePreviews();
        switchTab('Profile');
        
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = "SUBMIT PROOF FOR REVIEW";
    }
}

// ==========================================
// 9. ADMIN FUNCTIONS
// ==========================================

function loadAdminData() {
    attachDbListener('requests', (snapshot) => {
        const data = snapshot.val();
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
                            <span class="display-name">${escapeHtml(req.discordName)}</span>
                            <span class="username-handle">@${escapeHtml(req.discordUsername)}</span>
                        </div>
                    </td>
                    <td>
                        <div class="user-name-cell">
                            <span class="display-name">${escapeHtml(req.robloxName)}</span>
                            <span class="username-handle">@${escapeHtml(req.robloxUsername)}</span>
                        </div>
                    </td>
                    <td style="color:#cd7f32; font-weight:bold;">+${req.amount.toLocaleString()} GP</td>
                    <td>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <input type="text" id="comment_${req.id}" placeholder="Admin comment (optional)" style="padding: 6px; font-size: 12px; margin-bottom: 5px;">
                            <div style="display: flex; gap: 5px;">
                                <button class="btn-small btn-approve" onclick="window.handleAdminActionWithComment('${req.id}', '${req.userId}', ${req.amount}, 'approve', '${req.dbKey}', '${req.robloxId}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">
                                    <i class="fas fa-check"></i> Approve
                                </button>
                                <button class="btn-small btn-deny" onclick="window.handleAdminActionWithComment('${req.id}', '${req.userId}', ${req.amount}, 'reject', '${req.dbKey}', '${req.robloxId}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">
                                    <i class="fas fa-times"></i> Reject
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });
    });
}

window.handleAdminActionWithComment = async (reqId, userId, amount, action, passedDbKey, robloxId, discordName, discordUsername, robloxName, robloxUsername) => {
    const commentInput = document.getElementById(`comment_${reqId}`);
    const adminComment = commentInput ? commentInput.value.trim() : '';
    
    if (!confirm(`Are you sure you want to ${action === 'approve' ? 'APPROVE' : 'REJECT'} this request?`)) return;
    
    if (testModeEnabled) {
        showNotify(`🔬 TEST MODE: ${action} simulated!`, "warning");
        return;
    }
    
    try {
        await update(getDbRef(`requests/${reqId}`), {
            status: action === 'approve' ? 'approved' : 'rejected',
            adminComment: adminComment,
            processedAt: Date.now(),
            processedBy: currentUser.id
        });

        const dbKey = getSafeDbKey(passedDbKey);
        let newTotal = 0;
        const userRef = getDbRef(`users/${dbKey}`);
        const snap = await get(userRef);

        if (snap.exists()) {
            newTotal = snap.val().totalGP || 0;
            if (action === 'approve') {
                newTotal += amount;
                await update(userRef, { totalGP: newTotal });
            }
        }

        const channels = await getChannelConfig();
        const processedChannel = channels.CH_GP_PROCESSED;
        
        if (processedChannel) {
            const embed = {
                title: action === 'approve' ? '✅ GP Approved' : '❌ GP Rejected',
                color: action === 'approve' ? parseInt(systemConfig.embedColors.approve.replace('#', ''), 16) : parseInt(systemConfig.embedColors.reject.replace('#', ''), 16),
                fields: [
                    { name: "💬 Discord", value: `<@${userId}>`, inline: true },
                    { name: "💰 Amount", value: `${action === 'approve'?'+':'-'}${amount.toLocaleString()} GP`, inline: true },
                    { name: "📊 New Total", value: `${newTotal.toLocaleString()} GP`, inline: false }
                ]
            };
            if (adminComment) embed.fields.push({ name: "💬 Comment", value: adminComment, inline: false });
            await sendDiscordMessage(processedChannel, `<@${userId}>`, [embed]);
        }
        showNotify(`Request processed!`, "success");
    } catch (e) {
        alert("Error: " + e.message);
    }
};

// ==========================================
// 10. OWNER PANEL FUNCTIONS
// ==========================================

async function loadAdminRolesList() {
    const container = document.getElementById('adminRolesList');
    if (!container) return;
    
    try {
        await loadRoleConfig();
        let html = '<table class="table"><thead><tr><th>Role Name</th><th>Role ID</th><th>Type</th><th>Action</th></tr></thead><tbody>';
        
        for (const role of ADMIN_ROLES) {
            const roleName = await fetchRoleName(role);
            html += `<tr><td class="role-name">${escapeHtml(roleName)}</td><td class="role-id">${escapeHtml(role)}</td><td><span class="status-badge status-approved">Admin</span></td><td><button class="btn-small btn-remove-role" onclick="removeAdminRole('${role}')">Remove</button></td></tr>`;
        }
        
        for (const role of OWNER_ROLES) {
            const roleName = await fetchRoleName(role);
            html += `<tr><td class="role-name">${escapeHtml(roleName)}</td><td class="role-id">${escapeHtml(role)}</td><td><span class="status-badge status-pending">Owner</span></td><td><button class="btn-small btn-remove-role" onclick="removeOwnerRole('${role}')">Remove</button></td></tr>`;
        }
        
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="color: #f56565;">Error loading roles</p>';
    }
}

window.addAdminRole = async () => {
    const roleId = document.getElementById('newRoleId').value.trim();
    const permissionLevel = document.getElementById('rolePermissionLevel').value;
    if (!roleId) return showNotify("Enter a role ID!", "error");
    
    try {
        if (permissionLevel === 'admin' && !ADMIN_ROLES.includes(roleId)) ADMIN_ROLES.push(roleId);
        else if (permissionLevel === 'owner' && !OWNER_ROLES.includes(roleId)) OWNER_ROLES.push(roleId);
        
        await set(getDbRef('config/admin_roles'), { adminRoles: ADMIN_ROLES, ownerRoles: OWNER_ROLES });
        showNotify(`Role added!`, "success");
        document.getElementById('newRoleId').value = '';
        await loadAdminRolesList();
    } catch (e) { showNotify("Error!", "error"); }
};

window.removeAdminRole = async (roleId) => {
    ADMIN_ROLES = ADMIN_ROLES.filter(r => r !== roleId);
    await set(getDbRef('config/admin_roles'), { adminRoles: ADMIN_ROLES, ownerRoles: OWNER_ROLES });
    loadAdminRolesList();
};
window.removeOwnerRole = async (roleId) => {
    OWNER_ROLES = OWNER_ROLES.filter(r => r !== roleId);
    await set(getDbRef('config/admin_roles'), { adminRoles: ADMIN_ROLES, ownerRoles: OWNER_ROLES });
    loadAdminRolesList();
};

async function loadChannelConfigUI() {
    const container = document.getElementById('channelConfigList');
    const config = await getChannelConfig();
    
    const channels = [
        { key: 'CH_LEAVE_LOGS', name: '📤 Leave Logs Channel', desc: 'User leave notifications' },
        { key: 'CH_USER_INFO', name: '🛡️ Guild User Info', desc: 'Guild User Info board' },
        { key: 'CH_PANEL_INFO', name: '💻 Panel Info Board', desc: 'Panel Registration Info board' },
        { key: 'CH_LEADERBOARD', name: '🏆 Leaderboard Channel', desc: 'GP Leaderboard' },
        { key: 'CH_GP_REQUESTS', name: '💎 GP Requests', desc: 'New GP donation requests' },
        { key: 'CH_GP_PROCESSED', name: '✅ GP Processed', desc: 'Approved/rejected GP requests' },
        { key: 'CH_LOGIN_LOGS', name: '🔐 Login Logs', desc: 'User login notifications' },
        { key: 'CH_BOT_DM_LOGS', name: '📨 Bot DM Logs', desc: '/admin command messages' },
        { key: 'TICKET_MENU_CHANNEL', name: '🎫 Ticket Menu Channel', desc: 'Where the ticket menu is placed' },
        { key: 'TICKET_CAT_ADMIN', name: '📁 Admin Tickets Category', desc: 'Category ID for Admin Tickets' },
        { key: 'TICKET_CAT_MOD', name: '📁 Mod Tickets Category', desc: 'Category ID for Mod Tickets' },
        { key: 'TICKET_TRANSCRIPT_CH', name: '📜 Ticket Transcripts', desc: 'Channel to save closed tickets' }
    ];
    
    container.innerHTML = channels.map(ch => `
        <div class="channel-config-item">
            <div class="channel-config-name">${ch.name}</div>
            <div class="channel-config-description">${ch.desc}</div>
            <div class="channel-config-input">
                <input type="text" id="cfg_${ch.key}" value="${config[ch.key] || ''}" placeholder="Discord Channel/Category ID">
            </div>
        </div>
    `).join('');
}

async function saveChannelConfig() {
    const keys = ['CH_LEAVE_LOGS', 'CH_USER_INFO', 'CH_PANEL_INFO', 'CH_LEADERBOARD', 'CH_GP_REQUESTS', 'CH_GP_PROCESSED', 'CH_LOGIN_LOGS', 'CH_BOT_DM_LOGS', 'TICKET_MENU_CHANNEL', 'TICKET_CAT_ADMIN', 'TICKET_CAT_MOD', 'TICKET_TRANSCRIPT_CH'];
    const newConfig = {};
    keys.forEach(k => {
        const val = document.getElementById(`cfg_${k}`).value.trim();
        if(val) newConfig[k] = val;
    });
    
    await set(getDbRef('config/channels'), newConfig);
    showNotify("Channels saved!", "success");
}

async function loadKickLogs() {
    attachDbListener('logs/kicks', (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('kickLogsBody');
        if (!body) return;
        body.innerHTML = '';
        if (!data) return body.innerHTML = '<tr><td colspan="5" style="text-align:center;">No logs found</td></tr>';
        
        Object.values(data).sort((a, b) => b.timestamp - a.timestamp).forEach(log => {
            body.innerHTML += `<tr>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td><code>${log.kickedUserId}</code></td>
                <td><code>${log.kickedByUserId}</code></td>
                <td>${escapeHtml(log.reason)}</td>
                <td>${log.dmSent ? '✅' : '❌'}</td>
            </tr>`;
        });
    });
}

async function setTestMode(enabled) {
    await set(getDbRef('config/testMode'), { enabled });
    testModeEnabled = enabled;
    updateTestModeIndicator();
}

async function loadRegisteredUsersCount() {
    const snap = await get(getDbRef('users'));
    const users = snap.val() || {};
    let count = Object.values(users).filter(u => u.robloxId && u.robloxId !== '1').length;
    document.getElementById('statTotalUsers').textContent = count;
}

function loadSystemConfigUI() {
    document.getElementById('colorApprove').value = systemConfig.embedColors.approve;
    document.getElementById('colorReject').value = systemConfig.embedColors.reject;
    document.getElementById('colorPending').value = systemConfig.embedColors.pending;
    document.getElementById('colorInfo').value = systemConfig.embedColors.info;
    document.getElementById('colorLeaderboard').value = systemConfig.embedColors.leaderboard;
    document.getElementById('maxImagesPerRequest').value = systemConfig.limits.maxImagesPerRequest;
    document.getElementById('loginMusicUrl').value = systemConfig.musicUrl;
    document.getElementById('gpSubmitRoleId').value = GP_SUBMIT_ROLE;
    document.getElementById('ticketModRoleId').value = TICKET_MOD_ROLE;
    document.getElementById('adminPingRoleId').value = ADMIN_PING_ROLE;
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
        limits: { maxImagesPerRequest: parseInt(document.getElementById('maxImagesPerRequest').value) },
        musicUrl: document.getElementById('loginMusicUrl').value,
        gpSubmitRole: document.getElementById('gpSubmitRoleId').value,
        ticketModRole: document.getElementById('ticketModRoleId').value,
        adminPingRole: document.getElementById('adminPingRoleId').value
    };
    
    await set(getDbRef('config/system'), newConfig);
    showNotify("System configuration saved!", "success");
    loadSystemConfig();
}

async function saveFeatureRoles() {
    await update(getDbRef('config/system'), {
        gpSubmitRole: document.getElementById('gpSubmitRoleId').value,
        ticketModRole: document.getElementById('ticketModRoleId').value,
        adminPingRole: document.getElementById('adminPingRoleId').value
    });
    GP_SUBMIT_ROLE = document.getElementById('gpSubmitRoleId').value;
    TICKET_MOD_ROLE = document.getElementById('ticketModRoleId').value;
    ADMIN_PING_ROLE = document.getElementById('adminPingRoleId').value;
    showNotify("Roles saved!", "success");
    updatePermissions();
}

// ==========================================
// 11. SAVED MESSAGES FUNCTIONS
// ==========================================

async function loadSavedMessages() {
    attachDbListener('saved_messages', (snapshot) => {
        const data = snapshot.val();
        const container = document.getElementById('savedMessagesList');
        if (!container) return;
        
        if (!data) return container.innerHTML = '<p>No saved messages yet.</p>';
        
        container.innerHTML = '';
        Object.entries(data).forEach(([id, msg]) => {
            container.innerHTML += `
                <div class="saved-message-item" data-id="${id}">
                    <div class="message-name">📝 ${escapeHtml(msg.name)}</div>
                    <div class="message-channel">📡 Channel ID: ${escapeHtml(msg.channelId)}</div>
                    <div class="message-actions">
                        <button class="btn-edit-message" onclick="editSavedMessage('${id}')">✏️ Edit</button>
                        <button class="btn-send-message" onclick="sendSavedMessage('${id}')">📤 Send</button>
                        <button class="btn-delete-message" onclick="deleteSavedMessage('${id}')">🗑️ Delete</button>
                    </div>
                </div>
            `;
        });
    });
}

window.editSavedMessage = async (id) => {
    const snap = await get(getDbRef(`saved_messages/${id}`));
    const msg = snap.val();
    if (!msg) return;
    
    currentEditingMessageId = id;
    document.getElementById('messageName').value = msg.name || '';
    document.getElementById('messageChannelId').value = msg.channelId || '';
    document.getElementById('messageContent').value = msg.content || '';
    document.getElementById('messageEmbedTitle').value = msg.embedTitle || '';
    document.getElementById('messageEmbedDesc').value = msg.embedDesc || '';
    if (msg.embedColor) document.getElementById('messageEmbedColor').value = msg.embedColor;
};

async function saveMessage() {
    const data = {
        name: document.getElementById('messageName').value,
        channelId: document.getElementById('messageChannelId').value,
        content: document.getElementById('messageContent').value,
        embedTitle: document.getElementById('messageEmbedTitle').value,
        embedDesc: document.getElementById('messageEmbedDesc').value,
        embedColor: document.getElementById('messageEmbedColor').value,
    };
    
    if (currentEditingMessageId) {
        await update(getDbRef(`saved_messages/${currentEditingMessageId}`), data);
        currentEditingMessageId = null;
    } else {
        await set(push(getDbRef('saved_messages')), data);
    }
    showNotify("Saved!", "success");
}

window.sendSavedMessage = async (id) => {
    const snap = await get(getDbRef(`saved_messages/${id}`));
    const msg = snap.val();
    if (!msg) return;
    
    let embeds = null;
    if (msg.embedTitle || msg.embedDesc) {
        embeds = [{ title: msg.embedTitle, description: msg.embedDesc, color: parseInt(msg.embedColor.replace('#', ''), 16) }];
    }
    
    const success = await sendDiscordMessage(msg.channelId, msg.content, embeds);
    if(success) showNotify("Sent!", "success");
    else showNotify("Failed!", "error");
};

window.deleteSavedMessage = async (id) => {
    if (!confirm("Delete?")) return;
    await remove(getDbRef(`saved_messages/${id}`));
};

function clearMessageForm() {
    currentEditingMessageId = null;
    ['messageName', 'messageChannelId', 'messageContent', 'messageEmbedTitle', 'messageEmbedDesc'].forEach(id => document.getElementById(id).value = '');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// 12. EVENT LISTENERS & INITIALIZATION
// ==========================================

document.getElementById('discordLoginBtn')?.addEventListener('click', () => {
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds&state=discord`;
});

document.getElementById('robloxLoginBtn')?.addEventListener('click', () => {
    window.location.href = `https://apis.roblox.com/oauth/v1/authorize?client_id=${ROBLOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=roblox`;
});

document.getElementById('dcLogoutBtn')?.addEventListener('click', () => {
    sessionStorage.clear();
    localStorage.removeItem('pn_active_guild');
    window.location.href = REDIRECT_URI;
});

document.getElementById('rbxLogoutBtn')?.addEventListener('click', async () => {
    if (!confirm("Disconnect Roblox?")) return;
    const dbKey = getSafeDbKey(currentUser.username);
    await update(getDbRef(`users/${dbKey}`), { robloxId: null, robloxName: null, robloxUsername: null });
    window.location.reload();
});

document.getElementById('leaderboardSearch')?.addEventListener('input', (e) => renderLeaderboard(e.target.value));
document.getElementById('proofImage')?.addEventListener('change', (e) => {
    selectedFiles = selectedFiles.concat(Array.from(e.target.files)).slice(0, systemConfig.limits.maxImagesPerRequest);
    updateImagePreviews();
});
document.getElementById('addGPBtn')?.addEventListener('click', submitGPRequest);
['Spenden', 'Leaderboard', 'Profile', 'Admin', 'Owner'].forEach(tab => {
    document.getElementById(`tabBtn${tab}`)?.addEventListener('click', () => switchTab(tab));
});

document.getElementById('addRoleBtn')?.addEventListener('click', window.addAdminRole);
document.getElementById('saveChannelConfigBtn')?.addEventListener('click', saveChannelConfig);
document.getElementById('saveSystemConfigBtn')?.addEventListener('click', saveSystemConfig);
document.getElementById('saveFeatureRolesBtn')?.addEventListener('click', saveFeatureRoles);
document.getElementById('refreshUsersBtn')?.addEventListener('click', loadRegisteredUsersCount);
document.getElementById('enableTestModeBtn')?.addEventListener('click', () => setTestMode(true));
document.getElementById('disableTestModeBtn')?.addEventListener('click', () => setTestMode(false));
document.getElementById('saveMessageBtn')?.addEventListener('click', saveMessage);
document.getElementById('sendMessageBtn')?.addEventListener('click', () => { if (currentEditingMessageId) sendSavedMessage(currentEditingMessageId); else saveMessage(); });
document.getElementById('clearMessageFormBtn')?.addEventListener('click', clearMessageForm);

// Start
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

if (code) {
    if (state === 'discord') handleDiscordLogin(code);
    else if (state === 'roblox') handleRobloxLogin(code);
} else {
    const saved = sessionStorage.getItem('pn_session');
    if (saved) {
        currentUser = JSON.parse(saved);
        checkRobloxLink();
    } else {
        playLoginMusic();
    }
}
