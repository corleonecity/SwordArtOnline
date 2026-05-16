// ==========================================
// 1. SETTINGS & CONFIGURATION
// ==========================================

const OWNER_USER_ID = '917426398120005653';

// Roles for access control - stored in Firebase
let ADMIN_ROLES = [];
let OWNER_ROLES = [];

// GP Submit Role - now configurable via panel (wird durch Rollen-Permissions ersetzt)
let GP_SUBMIT_ROLE = '';

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
    updateInterval: 60
};

// Test mode
let testModeEnabled = false;

// Role name cache
let roleNameCache = {};

// Neue Variable für Rollen-Permissions (aus Firebase)
let rolePermissions = {}; // { roleId: { canSubmitGP: true, canViewAdmin: false, ... } }

const DISCORD_CLIENT_ID = '1503179151073345678';
const ROBLOX_CLIENT_ID = '1529843549493669743';

const BACKEND_URL = 'https://gentle-queen-63f0.keulecolin2005.workers.dev';
const REDIRECT_URI = 'https://corleonecity.github.io/SwordArtOnline/';

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

// Global variables
let currentUser = null;
let selectedFiles = [];
let allUsersData = {};
let liveCheckInterval = null;
let userGuildRoles = [];
let currentEditingMessageId = null;

// ==========================================
// 2. LOAD CONFIGURATIONS FROM FIREBASE
// ==========================================

async function loadRoleConfig() {
    const rolesRef = ref(db, 'config/admin_roles');
    const snap = await get(rolesRef);
    if (snap.exists()) {
        const data = snap.val();
        if (data.adminRoles) ADMIN_ROLES = data.adminRoles;
        if (data.ownerRoles) OWNER_ROLES = data.ownerRoles;
    }
}

async function getChannelConfig() {
    try {
        const configRef = ref(db, 'config/channels');
        const snap = await get(configRef);
        return snap.val() || {};
    } catch (e) {
        console.error("Error loading channel config:", e);
        return {};
    }
}

async function getRoleConfig() {
    try {
        const configRef = ref(db, 'config/roles');
        const snap = await get(configRef);
        return snap.val() || {};
    } catch (e) {
        console.error("Error loading role config:", e);
        return {};
    }
}

async function loadSystemConfig() {
    const configRef = ref(db, 'config/system');
    const snap = await get(configRef);
    if (snap.exists()) {
        const data = snap.val();
        if (data.embedColors) systemConfig.embedColors = { ...systemConfig.embedColors, ...data.embedColors };
        if (data.limits) systemConfig.limits = { ...systemConfig.limits, ...data.limits };
        if (data.musicUrl) systemConfig.musicUrl = data.musicUrl;
        if (data.updateInterval) systemConfig.updateInterval = data.updateInterval;
        if (data.gpSubmitRole) GP_SUBMIT_ROLE = data.gpSubmitRole;
    }
}

async function loadTestMode() {
    const testRef = ref(db, 'config/testMode');
    const snap = await get(testRef);
    if (snap.exists()) {
        testModeEnabled = snap.val().enabled === true;
        updateTestModeIndicator();
    }
}

async function loadMaintenanceStatus() {
    const maintenanceRef = ref(db, 'config/maintenance');
    const snap = await get(maintenanceRef);
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
        showNotify('⚠️ TEST MODE ENABLED - No real changes will be made', 'warning');
    } else {
        indicator.classList.add('hidden');
        if (statusText) statusText.textContent = 'Disabled';
    }
}

// ==========================================
// 3. NEUE FUNKTIONEN FÜR ROLLEN-MANAGEMENT
// ==========================================

async function loadAllGuildRoles() {
    try {
        const response = await fetch(`${BACKEND_URL}/guild-roles`);
        const data = await response.json();
        if (data.success) {
            return data.roles;
        } else {
            console.error("Failed to load guild roles:", data.error);
            return [];
        }
    } catch (e) {
        console.error("Error loading guild roles:", e);
        return [];
    }
}

async function loadRolePermissions() {
    try {
        const snap = await get(ref(db, 'config/role_permissions'));
        if (snap.exists()) {
            rolePermissions = snap.val();
        } else {
            rolePermissions = {};
        }
    } catch (e) {
        console.error("Error loading role permissions:", e);
    }
}

async function saveRolePermission(roleId, permissions) {
    try {
        await fetch(`${BACKEND_URL}/save-role-permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId, permissions })
        });
        rolePermissions[roleId] = permissions;
        showNotify(`Permissions for role saved!`, "success");
    } catch (e) {
        showNotify("Error saving permissions!", "error");
    }
}

async function renderDynamicRoles() {
    const container = document.getElementById('dynamicRolesContainer');
    if (!container) return;
    
    const roles = await loadAllGuildRoles();
    if (!roles.length) {
        container.innerHTML = '<div style="text-align: center; color: #888;">No roles found (make sure guild ID is set).</div>';
        return;
    }
    
    container.innerHTML = '';
    for (const role of roles) {
        const roleDiv = document.createElement('div');
        roleDiv.className = 'role-item';
        const colorHex = role.color ? `#${role.color.toString(16).padStart(6,'0')}` : '#ffd700';
        roleDiv.innerHTML = `
            <span class="role-name" style="color: ${colorHex};" title="${escapeHtml(role.name)}">${escapeHtml(role.name)}</span>
            <button class="role-open-btn" data-role-id="${role.id}" data-role-name="${escapeHtml(role.name)}">Open</button>
        `;
        container.appendChild(roleDiv);
    }
    
    // Direkte Zuweisung der Event-Listener per onclick (funktioniert immer)
    document.querySelectorAll('.role-open-btn').forEach(btn => {
        // Alte Listener entfernen (falls vorhanden)
        btn.removeEventListener('click', window.handleRoleOpenClick);
        // Neuen Listener zuweisen
        btn.addEventListener('click', window.handleRoleOpenClick);
    });
}

// Globale Event-Handler-Funktion für die Open-Buttons
window.handleRoleOpenClick = (event) => {
    const btn = event.currentTarget;
    const roleId = btn.getAttribute('data-role-id');
    const roleName = btn.getAttribute('data-role-name');
    console.log("Open clicked for role:", roleId, roleName);
    openRolePermissionModal(roleId, roleName);
};

// Globale Funktion, die das Modal öffnet
window.openRolePermissionModal = function(roleId, roleName) {
    openRolePermissionModal(roleId, roleName);
};

let currentEditingRoleId = null;

function openRolePermissionModal(roleId, roleName) {
    console.log("Opening modal for role:", roleId, roleName);
    currentEditingRoleId = roleId;
    const modal = document.getElementById('rolePermissionModal');
    const title = document.getElementById('modalRoleTitle');
    title.textContent = `Permissions for ${roleName}`;
    
    const permissions = rolePermissions[roleId] || {};
    
    // Definiere alle möglichen Berechtigungen
    const permissionDefs = [
        { key: 'canSubmitGP', label: 'Submit GP Donations', default: false, category: 'GP System' },
        { key: 'canViewLeaderboard', label: 'View Leaderboard', default: true, category: 'GP System' },
        { key: 'canViewProfile', label: 'View Own Profile', default: true, category: 'GP System' },
        { key: 'canViewAdminPanel', label: 'Access Admin Panel', default: false, category: 'Admin' },
        { key: 'canViewOwnerPanel', label: 'Access Owner Panel', default: false, category: 'Owner' },
        { key: 'canManageRoles', label: 'Manage Role Permissions (Owner only)', default: false, category: 'Owner' },
        { key: 'canManageSystem', label: 'Manage System Config (Owner only)', default: false, category: 'Owner' },
        { key: 'canManageMessages', label: 'Manage Saved Messages', default: false, category: 'Owner' },
        { key: 'canViewKickLogs', label: 'View Kick Logs', default: false, category: 'Owner' },
        { key: 'canToggleMaintenance', label: 'Toggle Maintenance Mode', default: false, category: 'Owner' },
        { key: 'canToggleTestMode', label: 'Toggle Test Mode', default: false, category: 'Owner' }
    ];
    
    // Gruppieren nach Kategorie
    const grouped = {};
    permissionDefs.forEach(def => {
        if (!grouped[def.category]) grouped[def.category] = [];
        grouped[def.category].push(def);
    });
    
    let html = '';
    for (const [category, items] of Object.entries(grouped)) {
        html += `<div class="permission-group"><h4>${category}</h4>`;
        items.forEach(item => {
            const isChecked = permissions[item.key] !== undefined ? permissions[item.key] : item.default;
            html += `
                <div class="permission-item">
                    <input type="checkbox" id="perm_${item.key}" ${isChecked ? 'checked' : ''}>
                    <label for="perm_${item.key}">${item.label}</label>
                </div>
            `;
        });
        html += `</div>`;
    }
    
    document.getElementById('modalPermissionsList').innerHTML = html;
    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('rolePermissionModal').classList.add('hidden');
    currentEditingRoleId = null;
}

async function saveCurrentRolePermissions() {
    if (!currentEditingRoleId) return;
    
    const checkboxes = document.querySelectorAll('#modalPermissionsList input[type="checkbox"]');
    const permissions = {};
    checkboxes.forEach(cb => {
        const key = cb.id.replace('perm_', '');
        permissions[key] = cb.checked;
    });
    
    await saveRolePermission(currentEditingRoleId, permissions);
    closeModal();
    
    // Nach dem Speichern die lokalen Berechtigungen aktualisieren und ggf. UI anpassen
    await loadRolePermissions();
    // Berechtigungen des aktuellen Users neu laden
    if (currentUser) {
        await fetchUserRoles(currentUser.id);
        updatePermissions();
    }
}

// ==========================================
// 4. HELPER FUNCTIONS
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

// Prüft Berechtigungen basierend auf den neuen Rollen-Permissions
function hasPermission(permissionKey) {
    if (!currentUser) return false;
    if (currentUser.id === OWNER_USER_ID) return true;
    // Durchlaufe alle Rollen des Users
    for (const roleId of userGuildRoles) {
        const perms = rolePermissions[roleId];
        if (perms && perms[permissionKey] === true) return true;
    }
    return false;
}

function hasAdminPermission() {
    return hasPermission('canViewAdminPanel');
}

function hasOwnerPermission() {
    if (currentUser && currentUser.id === OWNER_USER_ID) return true;
    return hasPermission('canViewOwnerPanel');
}

function hasGpSubmitPermission() {
    return hasPermission('canSubmitGP');
}

function updatePermissions() {
    const gpSubmitCard = document.getElementById('gpSubmitCard');
    const noPermissionCard = document.getElementById('noPermissionCard');
    const tabBtnSpenden = document.getElementById('tabBtnSpenden');
    const tabBtnAdmin = document.getElementById('tabBtnAdmin');
    const tabBtnOwner = document.getElementById('tabBtnOwner');
    const spendenContent = document.getElementById('content-spenden');
    
    if (hasGpSubmitPermission()) {
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
    if (!userId || !BACKEND_URL) {
        userGuildRoles = [];
        return [];
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/user-roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
        });
        
        if (response.ok) {
            const data = await response.json();
            userGuildRoles = data.roles || [];
            console.log("User roles loaded:", userGuildRoles);
        } else {
            userGuildRoles = [];
        }
    } catch (e) {
        console.warn("Error fetching user roles:", e);
        userGuildRoles = [];
    }
    
    await loadRolePermissions(); // Lade auch die Berechtigungen für diese Rollen
    updatePermissions();
    return userGuildRoles;
}

async function fetchRoleName(roleId) {
    if (roleNameCache[roleId]) return roleNameCache[roleId];
    
    try {
        const response = await fetch(`${BACKEND_URL}/role-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId: roleId, guildId: '1439377447630930084' })
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

// ==========================================
// 5. DISCORD BOT MESSAGES (gekürzt, bleibt gleich)
// ==========================================

async function sendDiscordMessage(channelId, content, embeds = null) {
    if (!channelId) return false;
    try {
        const body = {};
        if (content) body.content = content;
        if (embeds && embeds.length > 0) body.embeds = embeds;
        const response = await fetch(`${BACKEND_URL}/send-channel-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, content, embeds })
        });
        if (!response.ok) return false;
        return true;
    } catch (e) {
        console.error("sendDiscordMessage error:", e);
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
            body: JSON.stringify({ userId, nickname: newNickname, guildId: '1439377447630930084' })
        });
    } catch (e) {}
}

async function sendGPRequestToDiscord(requestData, images) {
    const formData = new FormData();
    const adminRoleId = ADMIN_ROLES[0] || '1503609455466643547';
    const channels = await getChannelConfig();
    const gpRequestsChannel = channels.CH_GP_REQUESTS;
    if (!gpRequestsChannel) return false;
    
    const embed = {
        title: "💎 New GP Donation Request",
        url: "https://corleonecity.github.io/SwordArtOnline/",
        color: parseInt(systemConfig.embedColors.pending.replace('#', ''), 16),
        fields: [
            { name: "💬 Discord", value: `**Name:** ${requestData.discordName}\n**Tag:** @${requestData.discordUsername}\n**Ping:** <@${requestData.userId}>`, inline: true },
            { name: "🎮 Roblox", value: `**Name:** ${requestData.robloxName}\n**User:** @${requestData.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${requestData.robloxId}/profile)`, inline: true },
            { name: "💰 Amount", value: `**+${requestData.amount.toLocaleString()} GP**`, inline: false },
            { name: "📊 Status", value: "⏳ Pending Review", inline: true },
            { name: "🆔 Request ID", value: `\`${requestData.requestId}\``, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "SwordArtOnline GP System" }
    };
    if (images && images.length > 0) embed.image = { url: "attachment://proof_1.png" };
    
    const components = [{
        type: 1,
        components: [
            { type: 2, style: 3, label: "Approve", custom_id: `approve_${requestData.requestId}`, emoji: { name: "✅" } },
            { type: 2, style: 4, label: "Reject", custom_id: `reject_${requestData.requestId}`, emoji: { name: "❌" } }
        ]
    }];
    
    formData.append('payload_json', JSON.stringify({ content: `<@&${adminRoleId}>`, embeds: [embed], components }));
    const imagesToSend = images.slice(0, systemConfig.limits.maxImagesPerRequest);
    for (let i = 0; i < imagesToSend.length; i++) formData.append(`file${i}`, imagesToSend[i], `proof_${i+1}.png`);
    
    try {
        const response = await fetch(`${BACKEND_URL}/send-gp-request-with-buttons`, { method: 'POST', body: formData });
        if (response.ok) {
            const data = await response.json();
            if (data.messageId) await update(ref(db, `requests/${requestData.requestId}`), { discordMessageId: data.messageId });
            return true;
        }
        return false;
    } catch (e) { return false; }
}

// ==========================================
// 6. DISCORD & ROBLOX AUTHENTIFICATION (gekürzt, bleibt gleich)
// ==========================================

async function doLiveCheck() {
    if (!currentUser) return false;
    try {
        const res = await fetch(`${BACKEND_URL}/check-member`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        if (!res.ok) { forceKickUser(); return false; }
        const data = await res.json();
        if (data.isMember === false) { forceKickUser(); return false; }
        return true;
    } catch (e) { forceKickUser(); return false; }
}

function startLiveMemberCheck() {
    if (liveCheckInterval) clearInterval(liveCheckInterval);
    liveCheckInterval = setInterval(doLiveCheck, 30000);
}

async function handleDiscordLogin(code) {
    try {
        const res = await fetch(`${BACKEND_URL}/token`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
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
            checkRobloxLink();
        }
    } catch (e) { alert("Login Error!"); }
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
            const rDisplayName = data.robloxUser.nickname || data.robloxUser.name;
            const rUsername = data.robloxUser.preferred_username || data.robloxUser.name;
            const rId = data.robloxUser.sub;
            const dDisplayName = currentUser.global_name || currentUser.username || "Unknown";
            const dbKey = getSafeDbKey(currentUser.username);
            const userRef = ref(db, `users/${dbKey}`);
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
            fetch(`${BACKEND_URL}/check-member`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.id, updateRoles: true }) });
            window.location.href = REDIRECT_URI;
        }
    } catch (e) { alert("Linking Error!"); }
}

async function checkRobloxLink() {
    try {
        const isStillMember = await doLiveCheck();
        if (!isStillMember) return;
        await loadMaintenanceStatus();
        await loadRoleConfig();
        await loadSystemConfig();
        await loadTestMode();
        await loadRolePermissions();
        const dbKey = getSafeDbKey(currentUser.username);
        const snap = await get(ref(db, `users/${dbKey}`));
        document.getElementById('loginPage').classList.add('hidden');
        if (snap.exists() && snap.val().robloxId) {
            if (currentUser && currentUser.id) await fetchUserRoles(currentUser.id);
            showDashboard();
            startLiveMemberCheck();
            fetch(`${BACKEND_URL}/check-member`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.id, updateRoles: true }) });
        } else {
            document.getElementById('robloxPage').classList.remove('hidden');
            playLoginMusic();
            startLiveMemberCheck();
        }
    } catch (err) { if (currentUser) showDashboard(); }
}

// ==========================================
// 7. DASHBOARD & UI
// ==========================================

function showDashboard() {
    stopMusic();
    document.getElementById('robloxPage').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('userWelcome').textContent = `Hi, ${currentUser.global_name || currentUser.username}`;
    if (currentUser.avatar) document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
    updatePermissions();
    loadLeaderboard();
    loadProfileHistory();
    if (hasAdminPermission()) loadAdminData();
    if (hasOwnerPermission()) {
        renderDynamicRoles();
        loadChannelConfigUI();
        loadRoleConfigUI();
        loadKickLogs();
        loadSavedMessages();
        loadSystemConfigUI();
        loadRegisteredUsersCount();
    }
    updateBotStatus();
    setInterval(updateBotStatus, 60000);
}

function renderLeaderboard(filterText) {
    const body = document.getElementById('leaderboardBody');
    body.innerHTML = '';
    if (!allUsersData) return;
    let usersArray = Object.values(allUsersData).filter(u => u.totalGP && u.totalGP > 0).sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0));
    if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        usersArray = usersArray.filter(u => (u.discordName && u.discordName.toLowerCase().includes(lowerFilter)) || (u.discordUsername && u.discordUsername.toLowerCase().includes(lowerFilter)) || (u.robloxName && u.robloxName.toLowerCase().includes(lowerFilter)));
    }
    usersArray.forEach((u, i) => {
        body.innerHTML += `<tr><td>#${i+1}</td><td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.discordName || "Unknown")}</span><span class="username-handle">@${escapeHtml(u.discordUsername || "Unknown")}</span></div></td><td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.robloxName || "Unknown")}</span><span class="username-handle">@${escapeHtml(u.robloxUsername || "Unknown")}</span></div></td><td style="color:#48bb78; font-weight:bold;">${(u.totalGP || 0).toLocaleString()} GP</td></tr>`;
    });
    if (usersArray.length === 0) body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No users with GP yet</td></tr>';
    const totalGP = Object.values(allUsersData).reduce((sum, u) => sum + (u.totalGP || 0), 0);
    const totalGpStat = document.getElementById('totalGpStat');
    if (totalGpStat) totalGpStat.textContent = totalGP.toLocaleString();
}

function loadLeaderboard() {
    onValue(ref(db, 'users'), (snapshot) => {
        allUsersData = snapshot.val();
        const searchValue = document.getElementById('leaderboardSearch')?.value || "";
        renderLeaderboard(searchValue);
        updateBotStatus();
    });
}

function loadProfileHistory() {
    onValue(ref(db, 'requests'), (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('profileHistoryBody');
        body.innerHTML = '';
        if (!data || !currentUser) return;
        const userRequests = Object.values(data).filter(r => r.userId === currentUser.id).sort((a, b) => b.timestamp - a.timestamp);
        userRequests.forEach(req => {
            const dateStr = new Date(req.timestamp).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            let statusHtml = req.status === 'pending' ? '<span class="status-badge status-pending">Pending ⏳</span>' : (req.status === 'approved' ? '<span class="status-badge status-approved">Approved ✅</span>' : '<span class="status-badge status-rejected">Rejected ❌</span>');
            body.innerHTML += `<tr><td style="font-size:14px; color:#aaa;">${dateStr}</td><td style="font-weight:bold;">+${req.amount.toLocaleString()} GP</td><td>${statusHtml}</td><td style="font-size:12px; color:#888;">${escapeHtml(req.adminComment || '-')}NonNull</td></tr>`;
        });
        if (userRequests.length === 0) body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No requests yet</td></tr>';
    });
}

// ==========================================
// 8. IMAGE UPLOAD & PREVIEW
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
        btn.onclick = () => { selectedFiles.splice(index, 1); updateImagePreviews(); };
        box.appendChild(img);
        box.appendChild(btn);
        previewContainer.appendChild(box);
    });
}

// ==========================================
// 9. GP SUBMIT FUNCTION
// ==========================================

async function submitGPRequest() {
    if (!hasGpSubmitPermission()) { showNotify("You don't have permission to submit GP requests!", "error"); return; }
    const amount = parseInt(document.getElementById('gpAmount').value);
    const btn = document.getElementById('addGPBtn');
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount!"); return; }
    if (selectedFiles.length === 0) { alert("Please add at least 1 screenshot as proof!"); return; }
    if (selectedFiles.length > systemConfig.limits.maxImagesPerRequest) { alert(`Maximum ${systemConfig.limits.maxImagesPerRequest} images allowed!`); return; }
    btn.disabled = true;
    btn.textContent = "SENDING...";
    try {
        const dbKey = getSafeDbKey(currentUser.username);
        const userRef = ref(db, `users/${dbKey}`);
        const snap = await get(userRef);
        const userData = snap.val() || {};
        const dName = userData.discordName || currentUser.global_name || "Unknown";
        const dUser = userData.discordUsername || currentUser.username || "Unknown";
        const dId = currentUser.id || "1";
        const rName = userData.robloxName || "Unknown";
        const rUser = userData.robloxUsername || "Unknown";
        const rId = userData.robloxId || "1";
        const newReqRef = push(ref(db, 'requests'));
        const reqKey = newReqRef.key;
        await set(newReqRef, { id: reqKey, dbKey, userId: dId, discordName: dName, discordUsername: dUser, robloxName: rName, robloxUsername: rUser, robloxId: rId, amount, status: 'pending', timestamp: Date.now() });
        const success = await sendGPRequestToDiscord({ discordName: dName, discordUsername: dUser, userId: dId, robloxName: rName, robloxUsername: rUser, robloxId: rId, amount, requestId: reqKey }, selectedFiles);
        if (success) showNotify(`GP Request submitted successfully!`, "success");
        else showNotify(`GP Request saved but Discord notification failed!`, "warning");
        document.getElementById('gpAmount').value = '';
        selectedFiles = [];
        updateImagePreviews();
        switchTab('Profile');
    } catch (e) { alert("Error: " + e.message); } finally { btn.disabled = false; btn.innerHTML = "SUBMIT PROOF FOR REVIEW"; }
}

// ==========================================
// 10. ADMIN FUNCTIONS (gekürzt)
// ==========================================

function loadAdminData() {
    onValue(ref(db, 'requests'), (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('adminPendingBody');
        if (!body) return;
        body.innerHTML = '';
        if (!data) { body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No pending requests</td></tr>'; return; }
        const pendingRequests = Object.values(data).filter(r => r.status === 'pending').sort((a, b) => a.timestamp - b.timestamp);
        if (pendingRequests.length === 0) { body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No pending requests</td></tr>'; return; }
        pendingRequests.forEach(req => {
            body.innerHTML += `<tr>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(req.discordName || "Unknown")}</span><span class="username-handle">@${escapeHtml(req.discordUsername || "Unknown")}</span></div></td>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(req.robloxName || "Unknown")}</span><span class="username-handle">@${escapeHtml(req.robloxUsername || "Unknown")}</span></div></td>
                <td style="color:#cd7f32; font-weight:bold;">+${req.amount.toLocaleString()} GP</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <input type="text" id="comment_${req.id}" placeholder="Admin comment (optional)" style="padding: 6px; font-size: 12px;">
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
            </tr>`;
        });
    });
}

window.handleAdminActionWithComment = async (reqId, userId, amount, action, passedDbKey, robloxId, discordName, discordUsername, robloxName, robloxUsername) => {
    const commentInput = document.getElementById(`comment_${reqId}`);
    const adminComment = commentInput ? commentInput.value.trim() : '';
    if (!confirm(`Are you sure you want to ${action === 'approve' ? 'APPROVE' : 'REJECT'} this request?${adminComment ? `\n\nComment: ${adminComment}` : ''}`)) return;
    if (testModeEnabled) {
        await update(ref(db, `requests/${reqId}`), { status: action === 'approve' ? 'approved' : 'rejected', adminComment, processedAt: Date.now(), processedBy: currentUser.id, testMode: true });
        showNotify(`Test: Request ${action === 'approve' ? 'approved' : 'rejected'}!`, "success");
        return;
    }
    try {
        await update(ref(db, `requests/${reqId}`), { status: action === 'approve' ? 'approved' : 'rejected', adminComment, processedAt: Date.now(), processedBy: currentUser.id, processedByName: currentUser.global_name || currentUser.username });
        const dbKey = getSafeDbKey(passedDbKey);
        let newTotal = 0;
        const userRef = ref(db, `users/${dbKey}`);
        const snap = await get(userRef);
        if (snap.exists()) {
            newTotal = snap.val().totalGP || 0;
            if (action === 'approve') { newTotal += amount; await update(userRef, { totalGP: newTotal }); }
        }
        const channels = await getChannelConfig();
        const processedChannel = channels.CH_GP_PROCESSED;
        if (processedChannel) {
            const embed = { title: action === 'approve' ? '✅ GP Donation Approved' : '❌ GP Donation Rejected', url: "https://corleonecity.github.io/SwordArtOnline/", color: action === 'approve' ? parseInt(systemConfig.embedColors.approve.replace('#', ''), 16) : parseInt(systemConfig.embedColors.reject.replace('#', ''), 16), fields: [
                { name: "💬 Discord", value: `**Name:** ${discordName}\n**Tag:** @${discordUsername}\n**Ping:** <@${userId}>`, inline: true },
                { name: "🎮 Roblox", value: `**Name:** ${robloxName}\n**User:** @${robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${robloxId}/profile)`, inline: true },
                { name: "💰 Amount", value: action === 'approve' ? `+${amount.toLocaleString()} GP` : `-${amount.toLocaleString()} GP`, inline: false },
                { name: "📊 New Total", value: `${newTotal.toLocaleString()} GP`, inline: true },
                { name: "🛡️ Processed By", value: `<@${currentUser.id}>`, inline: false }
            ], timestamp: new Date().toISOString(), footer: { text: "SwordArtOnline GP System" } };
            if (adminComment) embed.fields.push({ name: "💬 Admin Comment", value: adminComment, inline: false });
            await sendDiscordMessage(processedChannel, `<@${userId}>`, [embed]);
        }
        showNotify(`Request ${action === 'approve' ? 'approved' : 'rejected'}!`, "success");
    } catch (e) { alert("Error: " + e.message); }
};

// ==========================================
// 11. OWNER PANEL FUNCTIONS
// ==========================================

async function loadChannelConfigUI() {
    const container = document.getElementById('channelConfigList');
    if (!container) return;
    const channelConfig = await getChannelConfig();
    const channels = [
        { key: 'CH_LEAVE_LOGS', name: '📤 Leave Logs Channel', description: 'Channel for user leave notifications' },
        { key: 'CH_USER_INFO', name: '🛡️ User Info Board', description: 'Channel for Guild User Info board' },
        { key: 'CH_PANEL_INFO', name: '💻 Panel Info Board', description: 'Channel for Panel Registration Info board' },
        { key: 'CH_LEADERBOARD', name: '🏆 Leaderboard Channel', description: 'Channel for GP Leaderboard' },
        { key: 'CH_TRIGGER_BTN', name: '🔄 Trigger Button Channel', description: 'Channel with manual update button' },
        { key: 'CH_GP_REQUESTS', name: '💎 GP Requests Channel', description: 'Channel for new GP donation requests' },
        { key: 'CH_GP_PROCESSED', name: '✅ GP Processed Channel', description: 'Channel for approved/rejected GP requests' },
        { key: 'CH_LOGIN_LOGS', name: '🔐 Login Logs Channel', description: 'Channel for user login notifications' },
        { key: 'CH_BOT_DM_LOGS', name: '📨 Bot DM Logs Channel', description: 'Channel for /admin command messages' },
        { key: 'ticketMenuChannel', name: '🎫 Ticket Menu Channel', description: 'Channel where ticket dropdown is posted' },
        { key: 'ticketCatAdmin', name: '👑 Admin Ticket Category', description: 'Category ID for admin tickets' },
        { key: 'ticketCatMod', name: '🛡️ Moderator Ticket Category', description: 'Category ID for moderator tickets' },
        { key: 'ticketTranscriptCh', name: '📜 Ticket Transcript Channel', description: 'Channel where closed ticket transcripts are sent' }
    ];
    container.innerHTML = channels.map(ch => `<div class="channel-config-item"><div class="channel-config-name">${ch.name}</div><div class="channel-config-description">${ch.description}</div><div class="channel-config-input"><input type="text" id="cfg_${ch.key}" value="${channelConfig[ch.key] || ''}" placeholder="Enter Discord Channel ID"><span>Channel ID</span></div></div>`).join('');
}

async function saveChannelConfig() {
    const channelKeys = ['CH_LEAVE_LOGS', 'CH_USER_INFO', 'CH_PANEL_INFO', 'CH_LEADERBOARD', 'CH_TRIGGER_BTN', 'CH_GP_REQUESTS', 'CH_GP_PROCESSED', 'CH_LOGIN_LOGS', 'CH_BOT_DM_LOGS', 'ticketMenuChannel', 'ticketCatAdmin', 'ticketCatMod', 'ticketTranscriptCh'];
    const newConfig = {};
    let hasChanges = false;
    for (const key of channelKeys) {
        const input = document.getElementById(`cfg_${key}`);
        if (input) { newConfig[key] = input.value.trim() || null; hasChanges = true; }
    }
    if (!hasChanges) { showNotify("No changes to save!", "warning"); return; }
    try {
        const configToSave = {};
        for (const [key, value] of Object.entries(newConfig)) if (value !== null && value !== '') configToSave[key] = value;
        if (Object.keys(configToSave).length === 0) await set(ref(db, 'config/channels'), null);
        else await set(ref(db, 'config/channels'), configToSave);
        showNotify("Channel configuration saved!", "success");
        await loadChannelConfigUI();
    } catch (e) { showNotify("Error saving configuration!", "error"); }
}

async function loadRoleConfigUI() {
    const container = document.getElementById('roleConfigList');
    if (!container) return;
    const roleConfig = await getRoleConfig();
    const roles = [
        { key: 'ROLE_GUILD_MEMBER', name: '👥 Guild Member Role', description: 'Role assigned to guild members' },
        { key: 'ROLE_PENDING_GUILD', name: '⏳ Pending Guild Role', description: 'Role for pending members' },
        { key: 'ROLE_PANEL_REG', name: '✅ Panel Registered Role', description: 'Role for users who registered on panel' },
        { key: 'ROLE_PANEL_UNREG', name: '❌ Panel Unregistered Role', description: 'Role for users not registered' },
        { key: 'ticketModRole', name: '🛡️ Ticket Moderator Role', description: 'Role that gets access to moderator tickets' },
        { key: 'adminPingRoleId', name: '👑 Admin Ping Role', description: 'Role pinged when admin ticket is created' }
    ];
    container.innerHTML = roles.map(role => `<div class="channel-config-item"><div class="channel-config-name">${role.name}</div><div class="channel-config-description">${role.description}</div><div class="channel-config-input"><input type="text" id="role_${role.key}" value="${roleConfig[role.key] || ''}" placeholder="Enter Discord Role ID"><span>Role ID</span></div></div>`).join('');
}

async function saveRoleConfig() {
    const roleKeys = ['ROLE_GUILD_MEMBER', 'ROLE_PENDING_GUILD', 'ROLE_PANEL_REG', 'ROLE_PANEL_UNREG', 'ticketModRole', 'adminPingRoleId'];
    const newConfig = {};
    let hasChanges = false;
    for (const key of roleKeys) {
        const input = document.getElementById(`role_${key}`);
        if (input) { newConfig[key] = input.value.trim() || null; hasChanges = true; }
    }
    if (!hasChanges) { showNotify("No changes to save!", "warning"); return; }
    try {
        const configToSave = {};
        for (const [key, value] of Object.entries(newConfig)) if (value !== null && value !== '') configToSave[key] = value;
        if (Object.keys(configToSave).length === 0) await set(ref(db, 'config/roles'), null);
        else await set(ref(db, 'config/roles'), configToSave);
        showNotify("Role configuration saved!", "success");
        await loadRoleConfigUI();
    } catch (e) { showNotify("Error saving role configuration!", "error"); }
}

async function loadKickLogs() {
    const logsRef = ref(db, 'logs/kicks');
    onValue(logsRef, (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('kickLogsBody');
        if (!body) return;
        body.innerHTML = '';
        if (!data) { body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">No kick logs found</td></tr>'; return; }
        const logs = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        logs.forEach(log => { body.innerHTML += `<tr><td style="font-size:12px;">${new Date(log.timestamp).toLocaleString()}</td><td><code>${escapeHtml(log.kickedUserId || '?')}</code><br>${escapeHtml(log.kickedUserName || '')}</td><td><code>${escapeHtml(log.kickedByUserId || '?')}</code><br>${escapeHtml(log.kickedByUserName || '')}</td><td>${escapeHtml(log.reason || 'No reason')}</td><td>${log.dmSent ? '✅ Yes' : '❌ No'}</td>`; });
    });
}

async function setMaintenanceMode(enabled) {
    try {
        await set(ref(db, 'config/maintenance'), { enabled });
        if (enabled) { document.getElementById('maintenanceOverlay').classList.remove('hidden'); document.getElementById('maintenanceStatusText').textContent = 'Enabled'; showNotify("Maintenance mode ENABLED", "warning"); }
        else { document.getElementById('maintenanceOverlay').classList.add('hidden'); document.getElementById('maintenanceStatusText').textContent = 'Disabled'; showNotify("Maintenance mode DISABLED", "success"); }
    } catch (e) { showNotify("Error toggling maintenance mode!", "error"); }
}

async function setTestMode(enabled) {
    try {
        await set(ref(db, 'config/testMode'), { enabled });
        testModeEnabled = enabled;
        updateTestModeIndicator();
        showNotify(`Test mode ${enabled ? 'ENABLED' : 'DISABLED'}`, enabled ? "warning" : "success");
    } catch (e) { showNotify("Error toggling test mode!", "error"); }
}

async function loadRegisteredUsersCount() {
    try {
        const usersSnap = await get(ref(db, 'users'));
        const users = usersSnap.val() || {};
        let totalUsers = 0;
        for (const [key, user] of Object.entries(users)) if (user.robloxId && user.robloxId !== '1') totalUsers++;
        const statTotalUsers = document.getElementById('statTotalUsers');
        if (statTotalUsers) statTotalUsers.textContent = totalUsers;
    } catch (e) {}
}

function loadSystemConfigUI() {
    document.getElementById('colorApprove').value = systemConfig.embedColors.approve;
    document.getElementById('colorReject').value = systemConfig.embedColors.reject;
    document.getElementById('colorPending').value = systemConfig.embedColors.pending;
    document.getElementById('colorInfo').value = systemConfig.embedColors.info;
    document.getElementById('colorLeaderboard').value = systemConfig.embedColors.leaderboard;
    document.getElementById('maxImagesPerRequest').value = systemConfig.limits.maxImagesPerRequest;
    document.getElementById('loginMusicUrl').value = systemConfig.musicUrl;
    document.getElementById('updateInterval').value = systemConfig.updateInterval;
    document.getElementById('gpSubmitRoleId').value = GP_SUBMIT_ROLE;
}

async function saveSystemConfig() {
    const newConfig = { embedColors: { approve: document.getElementById('colorApprove').value, reject: document.getElementById('colorReject').value, pending: document.getElementById('colorPending').value, info: document.getElementById('colorInfo').value, leaderboard: document.getElementById('colorLeaderboard').value }, limits: { maxImagesPerRequest: parseInt(document.getElementById('maxImagesPerRequest').value) }, musicUrl: document.getElementById('loginMusicUrl').value, updateInterval: parseInt(document.getElementById('updateInterval').value) };
    try {
        await set(ref(db, 'config/system'), newConfig);
        systemConfig.embedColors = newConfig.embedColors;
        systemConfig.limits.maxImagesPerRequest = newConfig.limits.maxImagesPerRequest;
        systemConfig.musicUrl = newConfig.musicUrl;
        systemConfig.updateInterval = newConfig.updateInterval;
        showNotify("System configuration saved!", "success");
    } catch (e) { showNotify("Error saving configuration!", "error"); }
}

async function saveGpSubmitRole() {
    const newRoleId = document.getElementById('gpSubmitRoleId').value.trim();
    if (!newRoleId) { showNotify("Please enter a role ID!", "error"); return; }
    try {
        await set(ref(db, 'config/system/gpSubmitRole'), newRoleId);
        GP_SUBMIT_ROLE = newRoleId;
        showNotify(`GP Submit Role updated to ${newRoleId}!`, "success");
        updatePermissions();
    } catch (e) { showNotify("Error saving GP Submit Role!", "error"); }
}

// ==========================================
// 12. SAVED MESSAGES FUNCTIONS (gekürzt)
// ==========================================

async function loadSavedMessages() {
    const messagesRef = ref(db, 'saved_messages');
    onValue(messagesRef, (snapshot) => {
        const data = snapshot.val();
        const container = document.getElementById('savedMessagesList');
        if (!container) return;
        if (!data || Object.keys(data).length === 0) { container.innerHTML = '<p style="color: #666; text-align: center;">No saved messages yet. Create one above!</p>'; return; }
        container.innerHTML = '';
        Object.entries(data).forEach(([id, msg]) => {
            const previewContent = msg.content ? (msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')) : 'No content';
            const messageIdDisplay = msg.discordMessageId ? `✅ Message ID: ${msg.discordMessageId.substring(0, 8)}...` : '⚠️ Not sent yet';
            container.innerHTML += `<div class="saved-message-item" data-id="${id}"><div class="message-name">📝 ${escapeHtml(msg.name)}</div><div class="message-channel">📡 Channel ID: ${escapeHtml(msg.channelId || 'Not set')}</div><div class="message-id" style="font-size: 11px; color: ${msg.discordMessageId ? '#48bb78' : '#f56565'};">${messageIdDisplay}</div><div class="message-preview"><strong>Message:</strong> ${escapeHtml(previewContent)}${msg.embedTitle ? `<br><strong>Embed:</strong> ${escapeHtml(msg.embedTitle)}` : ''}</div><div class="message-actions"><button class="btn-edit-message" onclick="editSavedMessage('${id}')">✏️ Edit</button><button class="btn-send-message" onclick="sendSavedMessage('${id}')">📤 Send / Update</button><button class="btn-delete-message" onclick="deleteSavedMessage('${id}')">🗑️ Delete</button></div></div>`;
        });
    });
}

window.editSavedMessage = async (id) => {
    const snap = await get(ref(db, `saved_messages/${id}`));
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
    if (!name) { showNotify("Please enter a message name!", "error"); return; }
    if (!channelId) { showNotify("Please enter a channel ID!", "error"); return; }
    const messageData = { name, channelId, content, embedTitle, embedDesc, embedColor, updatedAt: Date.now(), updatedBy: currentUser?.id };
    try {
        if (currentEditingMessageId) {
            const existingSnap = await get(ref(db, `saved_messages/${currentEditingMessageId}`));
            const existing = existingSnap.val();
            if (existing && existing.discordMessageId) messageData.discordMessageId = existing.discordMessageId;
            await update(ref(db, `saved_messages/${currentEditingMessageId}`), messageData);
            showNotify(`Message "${name}" updated successfully!`, "success");
            currentEditingMessageId = null;
            const saveBtn = document.getElementById('saveMessageBtn');
            saveBtn.textContent = '💾 Save Message';
            saveBtn.style.background = '#48bb78';
        } else {
            const newRef = push(ref(db, 'saved_messages'));
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
    } catch (e) { showNotify("Error saving message!", "error"); }
}

window.sendSavedMessage = async (id) => {
    const snap = await get(ref(db, `saved_messages/${id}`));
    const msg = snap.val();
    if (!msg) return;
    if (!msg.channelId) { showNotify("No channel ID configured for this message!", "error"); return; }
    let embeds = null;
    if (msg.embedTitle || msg.embedDesc) { embeds = [{ title: msg.embedTitle || undefined, description: msg.embedDesc || undefined, color: msg.embedColor ? parseInt(msg.embedColor.replace('#', ''), 16) : 0x5865F2, timestamp: new Date().toISOString() }]; }
    showNotify(`Sending "${msg.name}"...`, "warning");
    let storedMessageId = msg.discordMessageId;
    let success = false;
    if (storedMessageId) {
        try {
            const response = await fetch(`${BACKEND_URL}/update-message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: msg.channelId, messageId: storedMessageId, content: msg.content, embeds }) });
            if (response.ok) success = true;
            else if (response.status === 404) storedMessageId = null;
            else storedMessageId = null;
        } catch (e) { storedMessageId = null; }
    }
    if (!storedMessageId) {
        const newMsgResponse = await fetch(`${BACKEND_URL}/send-channel-message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: msg.channelId, content: msg.content, embeds }) });
        if (newMsgResponse.ok) {
            const newMsgData = await newMsgResponse.json();
            success = true;
            if (newMsgData.messageId) await update(ref(db, `saved_messages/${id}`), { discordMessageId: newMsgData.messageId, lastSentAt: Date.now() });
        } else success = false;
    }
    if (success) showNotify(`Message "${msg.name}" sent/updated successfully!`, "success");
    else showNotify(`Failed to send "${msg.name}"!`, "error");
    loadSavedMessages();
};

window.deleteSavedMessage = async (id) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try { await remove(ref(db, `saved_messages/${id}`)); showNotify("Message deleted!", "success"); loadSavedMessages(); } catch (e) { showNotify("Error deleting message!", "error"); }
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// 13. EVENT LISTENERS & INITIALIZATION
// ==========================================

document.getElementById('discordLoginBtn')?.addEventListener('click', () => { window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds&state=discord`; });
document.getElementById('robloxLoginBtn')?.addEventListener('click', () => { window.location.href = `https://apis.roblox.com/oauth/v1/authorize?client_id=${ROBLOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=roblox`; });
document.getElementById('dcLogoutBtn')?.addEventListener('click', () => { sessionStorage.removeItem('pn_session'); window.location.href = REDIRECT_URI; });
document.getElementById('rbxLogoutBtn')?.addEventListener('click', async () => { if (!confirm("Disconnect Roblox?")) return; try { const dbKey = getSafeDbKey(currentUser.username); await update(ref(db, `users/${dbKey}`), { robloxId: null, robloxName: null, robloxUsername: null }); window.location.reload(); } catch (e) { showNotify("Error!", "error"); } });
document.getElementById('leaderboardSearch')?.addEventListener('input', (e) => { renderLeaderboard(e.target.value); });
document.getElementById('proofImage')?.addEventListener('change', (e) => { const newFiles = Array.from(e.target.files); const maxImages = systemConfig.limits.maxImagesPerRequest; if (selectedFiles.length + newFiles.length > maxImages) { alert(`Only ${maxImages} screenshot(s) are allowed!`); return; } selectedFiles = selectedFiles.concat(newFiles); updateImagePreviews(); e.target.value = ''; });
document.getElementById('addGPBtn')?.addEventListener('click', submitGPRequest);
document.getElementById('tabBtnSpenden')?.addEventListener('click', () => switchTab('Spenden'));
document.getElementById('tabBtnLeaderboard')?.addEventListener('click', () => switchTab('Leaderboard'));
document.getElementById('tabBtnProfile')?.addEventListener('click', () => switchTab('Profile'));
document.getElementById('tabBtnAdmin')?.addEventListener('click', () => { if (hasAdminPermission()) { switchTab('Admin'); loadAdminData(); } else { showNotify("You don't have permission to access Admin Panel!", "error"); } });
document.getElementById('tabBtnOwner')?.addEventListener('click', () => { if (hasOwnerPermission()) { switchTab('Owner'); renderDynamicRoles(); loadChannelConfigUI(); loadRoleConfigUI(); loadKickLogs(); loadSavedMessages(); loadSystemConfigUI(); loadRegisteredUsersCount(); } else { showNotify("You don't have permission to access Owner Panel!", "error"); } });

// Modal Events
document.getElementById('modalSaveBtn')?.addEventListener('click', saveCurrentRolePermissions);
document.getElementById('modalCancelBtn')?.addEventListener('click', closeModal);
document.querySelector('.modal-close')?.addEventListener('click', closeModal);
window.addEventListener('click', (e) => { if (e.target === document.getElementById('rolePermissionModal')) closeModal(); });

// Weitere Buttons
document.getElementById('saveChannelConfigBtn')?.addEventListener('click', saveChannelConfig);
document.getElementById('saveRoleConfigBtn')?.addEventListener('click', saveRoleConfig);
document.getElementById('saveSystemConfigBtn')?.addEventListener('click', saveSystemConfig);
document.getElementById('saveGpSubmitRoleBtn')?.addEventListener('click', saveGpSubmitRole);
document.getElementById('refreshUsersBtn')?.addEventListener('click', loadRegisteredUsersCount);
document.getElementById('enableTestModeBtn')?.addEventListener('click', () => setTestMode(true));
document.getElementById('disableTestModeBtn')?.addEventListener('click', () => setTestMode(false));
document.getElementById('saveMessageBtn')?.addEventListener('click', saveMessage);
document.getElementById('sendMessageBtn')?.addEventListener('click', () => { if (currentEditingMessageId) sendSavedMessage(currentEditingMessageId); else { const name = document.getElementById('messageName').value.trim(); if (!name) { showNotify("Please save the message first or load an existing one!", "error"); return; } saveMessage(); } });
document.getElementById('clearMessageFormBtn')?.addEventListener('click', clearMessageForm);
document.getElementById('enableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(true));
document.getElementById('disableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(false));

// ==========================================
// 14. APP START (AUTH CHECK)
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
        try { currentUser = JSON.parse(saved); if (!currentUser.id) throw new Error(); checkRobloxLink(); } catch (e) { sessionStorage.removeItem('pn_session'); playLoginMusic(); }
    } else { playLoginMusic(); }
}
