// ==========================================
// 1. SETTINGS & CONFIGURATION
// ==========================================

const OWNER_USER_ID = '917426398120005653';

// Roles for access control - stored in Firebase
let ADMIN_ROLES = ['1503609455466643547'];
let OWNER_ROLES = ['1504646932243546152'];

// GP Submit Role - now configurable via panel
let GP_SUBMIT_ROLE = '1503193408280330400';

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
        maxImagesPerRequest: 3
    },
    musicUrl: 'https://www.youtube.com/embed/BtEkzZoUCpw?autoplay=1&loop=1',
    updateInterval: 60
};

// Test mode
let testModeEnabled = false;

// Role name cache
let roleNameCache = {};

const DISCORD_CLIENT_ID = '1503179151073345678';
const ROBLOX_CLIENT_ID = '1529843549493669743';

const BACKEND_URL = 'https://gentle-queen-63f0.keulecolin2005.workers.dev';
const REDIRECT_URI = 'https://corleonecity.github.io/SwordArtOnline/';

// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update, push, remove, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

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
    try {
        const rolesRef = ref(db, 'config/admin_roles');
        const snap = await get(rolesRef);
        if (snap.exists()) {
            const data = snap.val();
            if (data.adminRoles) ADMIN_ROLES = data.adminRoles;
            if (data.ownerRoles) OWNER_ROLES = data.ownerRoles;
        }
    } catch (e) {
        console.error("Error loading role config:", e);
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

async function loadSystemConfig() {
    try {
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
    } catch (e) {
        console.error("Error loading system config:", e);
    }
}

async function loadTestMode() {
    try {
        const testRef = ref(db, 'config/testMode');
        const snap = await get(testRef);
        if (snap.exists()) {
            testModeEnabled = snap.val().enabled === true;
            updateTestModeIndicator();
        }
    } catch (e) {
        console.error("Error loading test mode:", e);
    }
}

async function loadMaintenanceStatus() {
    try {
        const maintenanceRef = ref(db, 'config/maintenance');
        const snap = await get(maintenanceRef);
        if (snap.exists() && snap.val().enabled) {
            const overlay = document.getElementById('maintenanceOverlay');
            if (overlay) overlay.classList.remove('hidden');
            const statusText = document.getElementById('maintenanceStatusText');
            if (statusText) statusText.textContent = 'Enabled';
        } else {
            const overlay = document.getElementById('maintenanceOverlay');
            if (overlay) overlay.classList.add('hidden');
            const statusText = document.getElementById('maintenanceStatusText');
            if (statusText) statusText.textContent = 'Disabled';
        }
    } catch (e) {
        console.error("Error loading maintenance status:", e);
    }
}

function updateTestModeIndicator() {
    const indicator = document.getElementById('testModeIndicator');
    const statusText = document.getElementById('testModeStatusText');
    if (testModeEnabled) {
        if (indicator) indicator.classList.remove('hidden');
        if (statusText) statusText.textContent = 'Enabled';
        showNotify('⚠️ TEST MODE ENABLED - No real changes will be made', 'warning');
    } else {
        if (indicator) indicator.classList.add('hidden');
        if (statusText) statusText.textContent = 'Disabled';
    }
}

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

function getSafeDbKey(discordUsername) {
    if (!discordUsername) return 'unknown_user';
    return discordUsername.toLowerCase().replace(/[.#$\[\]]/g, '_');
}

function playLoginMusic() {
    const ac = document.getElementById('audioPlayerContainer');
    if (ac && ac.innerHTML === '') {
        ac.innerHTML = `<iframe width="0" height="0" src="${systemConfig.musicUrl}" frameborder="0" allow="autoplay"></iframe>`;
    }
}

function stopMusic() {
    const ac = document.getElementById('audioPlayerContainer');
    if (ac) ac.innerHTML = '';
}

function showNotify(msg, type) {
    const n = document.getElementById('notification');
    if (!n) return;
    n.textContent = msg;
    n.className = `notification show ${type === 'success' ? 'bg-success' : (type === 'warning' ? 'bg-warning' : 'bg-error')}`;
    setTimeout(() => n.classList.remove('show'), 3000);
}

function showLoading(show, elementId = null) {
    if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            if (show) {
                element.disabled = true;
                element.dataset.originalText = element.innerHTML;
                element.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            } else {
                element.disabled = false;
                if (element.dataset.originalText) {
                    element.innerHTML = element.dataset.originalText;
                }
            }
        }
    }
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
    const mainContent = document.getElementById('mainContent');
    const robloxPage = document.getElementById('robloxPage');
    const loginPage = document.getElementById('loginPage');
    const noPermissionPage = document.getElementById('noPermissionPage');
    
    if (mainContent) mainContent.classList.add('hidden');
    if (robloxPage) robloxPage.classList.add('hidden');
    if (loginPage) loginPage.classList.add('hidden');
    if (noPermissionPage) noPermissionPage.classList.remove('hidden');
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
    return userGuildRoles.includes(GP_SUBMIT_ROLE);
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
        tabBtnAdmin.style.display = hasAdminPermission() ? 'flex' : 'none';
    }
    
    if (tabBtnOwner) {
        tabBtnOwner.style.display = hasOwnerPermission() ? 'flex' : 'none';
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
    
    await loadRoleConfig();
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
// 3.5 MANUAL USER REGISTRATION
// ==========================================

async function checkExistingUserByDiscordUsername(discordUsername) {
    if (!discordUsername) return { exists: false };
    
    try {
        const dbKey = getSafeDbKey(discordUsername);
        const userRef = ref(db, `users/${dbKey}`);
        const snap = await get(userRef);
        
        if (snap.exists()) {
            return { exists: true, userKey: dbKey, userData: snap.val() };
        }
        return { exists: false };
    } catch (e) {
        console.error("Error checking existing user:", e);
        return { exists: false, error: e.message };
    }
}

async function manualRegisterUser() {
    if (!hasOwnerPermission()) {
        showNotify("Only the owner can manually register users!", "error");
        return;
    }
    
    const discordId = document.getElementById('manualDiscordId')?.value.trim();
    const discordName = document.getElementById('manualDiscordName')?.value.trim() || "Unknown";
    const discordUsername = document.getElementById('manualDiscordUsername')?.value.trim();
    const robloxId = document.getElementById('manualRobloxId')?.value.trim();
    const robloxName = document.getElementById('manualRobloxName')?.value.trim() || "Unknown";
    const robloxUsername = document.getElementById('manualRobloxUsername')?.value.trim();
    const initialGp = parseInt(document.getElementById('manualInitialGp')?.value) || 0;
    
    const resultDiv = document.getElementById('manualRegisterResult');
    
    if (!discordId) {
        resultDiv.innerHTML = '<span style="color: #f56565;">❌ Discord User ID is required!</span>';
        return;
    }
    
    if (!discordUsername) {
        resultDiv.innerHTML = '<span style="color: #f56565;">❌ Discord Username is required!</span>';
        return;
    }
    
    if (!robloxId) {
        resultDiv.innerHTML = '<span style="color: #f56565;">❌ Roblox User ID is required!</span>';
        return;
    }
    
    if (!robloxUsername) {
        resultDiv.innerHTML = '<span style="color: #f56565;">❌ Roblox Username is required!</span>';
        return;
    }
    
    resultDiv.innerHTML = '<span style="color: #ffd700;"><i class="fas fa-spinner fa-spin"></i> Saving user...</span>';
    
    try {
        const dbKey = getSafeDbKey(discordUsername);
        
        const userData = {
            id: discordId,
            discordName: discordName,
            discordUsername: discordUsername,
            robloxId: robloxId,
            robloxName: robloxName,
            robloxUsername: robloxUsername,
            totalGP: initialGp,
            hasLeftServer: false,
            manuallyRegistered: true,
            registeredAt: Date.now(),
            registeredBy: currentUser?.id
        };
        
        const existing = await checkExistingUserByDiscordUsername(discordUsername);
        
        if (existing.exists) {
            await update(ref(db, `users/${dbKey}`), {
                ...userData,
                updatedAt: Date.now(),
                updatedBy: currentUser?.id
            });
            resultDiv.innerHTML = `<span style="color: #48bb78;">✅ User UPDATED successfully! Discord: @${discordUsername}</span>`;
            showNotify(`User ${discordUsername} has been updated!`, "success");
        } else {
            await set(ref(db, `users/${dbKey}`), {
                ...userData,
                createdAt: Date.now()
            });
            resultDiv.innerHTML = `<span style="color: #48bb78;">✅ User CREATED successfully! Discord: @${discordUsername}</span>`;
            showNotify(`User ${discordUsername} has been registered manually!`, "success");
        }
        
        loadRegisteredUsersCount();
        
    } catch (e) {
        console.error("Manual registration error:", e);
        resultDiv.innerHTML = `<span style="color: #f56565;">❌ Error: ${e.message}</span>`;
    }
}

async function manualCheckUser() {
    const discordUsername = document.getElementById('manualDiscordUsername')?.value.trim();
    const resultDiv = document.getElementById('manualRegisterResult');
    
    if (!discordUsername) {
        resultDiv.innerHTML = '<span style="color: #f56565;">❌ Please enter a Discord Username first!</span>';
        return;
    }
    
    resultDiv.innerHTML = '<span style="color: #ffd700;"><i class="fas fa-spinner fa-spin"></i> Checking...</span>';
    
    try {
        const existing = await checkExistingUserByDiscordUsername(discordUsername);
        
        if (existing.exists) {
            const user = existing.userData;
            resultDiv.innerHTML = `
                <span style="color: #48bb78;">✅ User FOUND!</span><br>
                📝 Discord: ${user.discordName} (@${user.discordUsername})<br>
                🎮 Roblox: ${user.robloxName} (@${user.robloxUsername})<br>
                💰 GP: ${(user.totalGP || 0).toLocaleString()}<br>
                📅 Registered: ${user.manuallyRegistered ? 'Manually' : 'Via Login'}
            `;
        } else {
            resultDiv.innerHTML = '<span style="color: #f56565;">❌ User NOT found in database. You can create them using the form above.</span>';
        }
    } catch (e) {
        resultDiv.innerHTML = `<span style="color: #f56565;">❌ Error: ${e.message}</span>`;
    }
}

function clearManualForm() {
    document.getElementById('manualDiscordId').value = '';
    document.getElementById('manualDiscordName').value = '';
    document.getElementById('manualDiscordUsername').value = '';
    document.getElementById('manualRobloxId').value = '';
    document.getElementById('manualRobloxName').value = '';
    document.getElementById('manualRobloxUsername').value = '';
    document.getElementById('manualInitialGp').value = '0';
    document.getElementById('manualRegisterResult').innerHTML = '';
    showNotify("Form cleared!", "success");
}

// ==========================================
// 4. DISCORD BOT MESSAGES
// ==========================================

async function sendDiscordMessage(channelId, content, embeds = null) {
    if (!channelId) {
        console.warn("No channel ID provided");
        return false;
    }
    
    try {
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
                guildId: '1439377447630930084'
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

async function sendLoginToDiscord(userData) {
    const channels = await getChannelConfig();
    const loginLogsChannel = channels.CH_LOGIN_LOGS;
    
    if (!loginLogsChannel) {
        console.warn("CH_LOGIN_LOGS not configured - skipping login notification");
        return false;
    }
    
    const embed = {
        title: "🟢 New User Registered",
        url: "https://corleonecity.github.io/SwordArtOnline/",
        color: parseInt(systemConfig.embedColors.info.replace('#', ''), 16),
        fields: [
            { name: "💬 Discord", value: `**Name:** ${userData.discordName}\n**Tag:** @${userData.discordUsername}\n**ID:** <@${userData.userId}>`, inline: true },
            { name: "🎮 Roblox", value: `**Name:** ${userData.robloxName}\n**User:** @${userData.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${userData.robloxId}/profile)`, inline: true },
            { name: "📝 Nickname Updated", value: `${userData.robloxName} (@${userData.robloxUsername})`, inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "SwordArtOnline Panel" }
    };
    
    return sendDiscordMessage(loginLogsChannel, null, [embed]);
}

async function sendLeftUserToDiscord(userData) {
    const channels = await getChannelConfig();
    const leaveLogsChannel = channels.CH_LEAVE_LOGS;
    
    if (!leaveLogsChannel) {
        console.warn("CH_LEAVE_LOGS not configured - skipping leave notification");
        return false;
    }
    
    const adminRoleId = ADMIN_ROLES[0] || '1503609455466643547';
    
    const robloxProfileLink = userData.robloxUsername 
        ? `https://www.roblox.com/user.aspx?username=${userData.robloxUsername}`
        : "";
    
    const embed = {
        title: "🚨 User has left the server!",
        url: "https://corleonecity.github.io/SwordArtOnline/",
        color: parseInt(systemConfig.embedColors.reject.replace('#', ''), 16),
        fields: [
            { name: "💬 Discord", value: `**Display:** ${userData.discordName || "Unknown"}\n**User:** @${userData.discordUsername || "Unknown"}\n**Ping:** <@${userData.id}>`, inline: true },
            { name: "🎮 Roblox", value: `**Display:** ${userData.robloxName || "Unknown"}\n**User:** @${userData.robloxUsername || "Unknown"}\n**Profile:** [Click Here](${robloxProfileLink})`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "SwordArtOnline Panel" }
    };
    
    return sendDiscordMessage(leaveLogsChannel, `<@&${adminRoleId}>`, [embed]);
}

async function sendGPRequestToDiscord(requestData, images) {
    const formData = new FormData();
    
    const adminRoleId = ADMIN_ROLES[0] || '1503609455466643547';
    
    const channels = await getChannelConfig();
    const gpRequestsChannel = channels.CH_GP_REQUESTS;
    
    if (!gpRequestsChannel) {
        console.error("GP Requests channel not configured!");
        return false;
    }
    
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
    
    if (images && images.length > 0) {
        embed.image = { url: "attachment://proof_1.png" };
    }

    const components = [{
        type: 1,
        components: [
            {
                type: 2,
                style: 3,
                label: "Approve",
                custom_id: `approve_${requestData.requestId}`,
                emoji: { name: "✅" }
            },
            {
                type: 2,
                style: 4,
                label: "Reject",
                custom_id: `reject_${requestData.requestId}`,
                emoji: { name: "❌" }
            }
        ]
    }];

    formData.append('payload_json', JSON.stringify({
        content: `<@&${adminRoleId}>`,
        embeds: [embed],
        components: components
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
            console.log("Discord response:", data);
            if (data.messageId) {
                await update(ref(db, `requests/${requestData.requestId}`), {
                    discordMessageId: data.messageId
                });
                console.log("Saved discordMessageId:", data.messageId);
            }
            return true;
        } else {
            const errorText = await response.text();
            console.error("GP request send failed:", errorText);
            return false;
        }
    } catch (e) {
        console.error("GP request send error:", e);
        return false;
    }
}

// ==========================================
// 5. DISCORD & ROBLOX AUTHENTIFICATION (mit automatischer Erkennung)
// ==========================================

async function doLiveCheck() {
    if (!currentUser) return false;
    try {
        const res = await fetch(`${BACKEND_URL}/check-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
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
        console.warn("Live check failed:", e);
        forceKickUser();
        return false;
    }
}

function startLiveMemberCheck() {
    if (liveCheckInterval) clearInterval(liveCheckInterval);
    liveCheckInterval = setInterval(doLiveCheck, 30000);
}

async function sendLoginWebhook(userData) {
    const dbKey = getSafeDbKey(userData.discordUsername);
    const userRef = ref(db, `users/${dbKey}`);
    const snap = await get(userRef);
    
    if (snap.exists() && snap.val().loginNotified === true) return;

    const success = await sendLoginToDiscord(userData);
    
    if (success) {
        await update(userRef, { loginNotified: true });
        console.log("Login notification sent successfully");
    }
}

async function handleDiscordLogin(code) {
    try {
        showLoading(true, 'discordLoginBtn');
        
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
            
            const dbKey = getSafeDbKey(currentUser.username);
            const userSnap = await get(ref(db, `users/${dbKey}`));
            
            if (userSnap.exists() && userSnap.val().robloxId && userSnap.val().robloxId !== '1') {
                console.log("User exists in DB, skipping Roblox link");
                const userData = userSnap.val();
                
                await update(ref(db, `users/${dbKey}`), {
                    discordName: currentUser.global_name || currentUser.username,
                    discordUsername: currentUser.username,
                    lastLoginAt: Date.now()
                });
                
                await updateDiscordNickname(currentUser.id, userData.robloxName, userData.robloxUsername);
                await fetchUserRoles(currentUser.id);
                showDashboard();
                startLiveMemberCheck();
                showNotify(`Welcome back ${currentUser.global_name || currentUser.username}!`, "success");
            } else {
                await checkRobloxLink();
            }
        } else {
            showNotify("Discord authorization failed!", "error");
        }
    } catch (e) {
        console.error("Discord login error:", e);
        showNotify("Login Error! Please try again.", "error");
    } finally {
        showLoading(false, 'discordLoginBtn');
    }
}

async function handleRobloxLogin(code) {
    try {
        showLoading(true, 'robloxLoginBtn');
        
        const savedSession = sessionStorage.getItem('pn_session');
        if (!savedSession) {
            throw new Error("No Discord session found. Please login with Discord first.");
        }
        
        currentUser = JSON.parse(savedSession);
        
        const res = await fetch(`${BACKEND_URL}/roblox-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
        });
        
        if (!res.ok) {
            const errorData = await res.text();
            throw new Error(`Server error: ${res.status} - ${errorData}`);
        }
        
        const data = await res.json();
        
        if (!data.success) {
            throw new Error(data.error || "Roblox authentication failed");
        }
        
        if (data.success && data.robloxUser) {
            // ==========================================
            // FIX: KORREKTE API-ZUORDNUNG FÜR ROBLOX
            // ==========================================
            const rDisplayName = data.robloxUser.name || "Unknown";                             // Echter Anzeigename
            const rUsername = data.robloxUser.preferred_username || data.robloxUser.name;        // Echter @-Benutzername
            const rId = data.robloxUser.sub;
            const dDisplayName = currentUser.global_name || currentUser.username || "Unknown";
            
            const dbKey = getSafeDbKey(currentUser.username);
            const userRef = ref(db, `users/${dbKey}`);
            const snap = await get(userRef);
            let currentGP = snap.exists() && snap.val().totalGP ? snap.val().totalGP : 0;
            
            await update(userRef, {
                discordName: dDisplayName || "Unknown",
                discordUsername: currentUser.username || "Unknown",
                robloxName: rDisplayName,        // Speichert Displaynamen getrennt
                robloxUsername: rUsername,       // Speichert @-Usernamen getrennt
                robloxId: rId || "1",
                totalGP: currentGP,
                id: currentUser.id || "1",
                hasLeftServer: false,
                linkedAt: Date.now()
            });

            await updateDiscordNickname(currentUser.id, rDisplayName, rUsername);

            await sendLoginWebhook({
                discordName: dDisplayName,
                discordUsername: currentUser.username,
                userId: currentUser.id,
                robloxName: rDisplayName,
                robloxUsername: rUsername,
                robloxId: rId
            });

            await fetch(`${BACKEND_URL}/check-member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, updateRoles: true })
            });

            showNotify("Roblox account linked successfully!", "success");
            window.location.href = REDIRECT_URI;
        } else {
            throw new Error("Invalid Roblox user data received");
        }
    } catch (e) {
        console.error("Roblox login error:", e);
        showNotify(`Linking Error: ${e.message}`, "error");
    } finally {
        showLoading(false, 'robloxLoginBtn');
    }
}

async function checkRobloxLink() {
    try {
        const isStillMember = await doLiveCheck();
        if (!isStillMember) return;
        await loadMaintenanceStatus();
        await loadRoleConfig();
        await loadSystemConfig();
        await loadTestMode();
        
        const dbKey = getSafeDbKey(currentUser.username);
        const snap = await get(ref(db, `users/${dbKey}`));
        const loginPage = document.getElementById('loginPage');
        
        if (loginPage) loginPage.classList.add('hidden');
        
        if (snap.exists() && snap.val().robloxId && snap.val().robloxId !== '1') {
            if (currentUser && currentUser.id) {
                await fetchUserRoles(currentUser.id);
            }
            showDashboard();
            startLiveMemberCheck();
            fetch(`${BACKEND_URL}/check-member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, updateRoles: true })
            });
        } else {
            const robloxPage = document.getElementById('robloxPage');
            if (robloxPage) robloxPage.classList.remove('hidden');
            playLoginMusic();
            startLiveMemberCheck();
        }
    } catch (err) {
        console.error("checkRobloxLink error:", err);
        if (currentUser) {
            showDashboard();
        }
    }
}

// ==========================================
// 6. DASHBOARD & UI
// ==========================================

function showDashboard() {
    stopMusic();
    const robloxPage = document.getElementById('robloxPage');
    const mainContent = document.getElementById('mainContent');
    const userWelcome = document.getElementById('userWelcome');
    const userAvatar = document.getElementById('userAvatar');
    
    if (robloxPage) robloxPage.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');
    if (userWelcome) userWelcome.textContent = `Hi, ${currentUser.global_name || currentUser.username}`;
    
    if (userAvatar && currentUser.avatar) {
        userAvatar.src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
    }
    
    updatePermissions();
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
    setInterval(updateBotStatus, 60000);
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
    
    if (usersArray.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No users with GP yet</td></tr>';
        return;
    }
    
    usersArray.forEach((u, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
        body.innerHTML += `
            <tr>
                <td><strong>${medal}</strong></td>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.discordName || "Unknown")}</span><span class="username-handle">@${escapeHtml(u.discordUsername || "Unknown")}</span></div></td>
                <td><div class="user-name-cell"><span class="display-name">${escapeHtml(u.robloxName || "Unknown")}</span><span class="username-handle">@${escapeHtml(u.robloxUsername || "Unknown")}</span></div></td>
                <td style="color:#48bb78; font-weight:bold; font-size:16px;">${(u.totalGP || 0).toLocaleString()} GP</td>
            </tr>
        `;
    });
    
    const totalGP = Object.values(allUsersData).reduce((sum, u) => sum + (u.totalGP || 0), 0);
    const totalGpStat = document.getElementById('totalGpStat');
    if (totalGpStat) totalGpStat.textContent = totalGP.toLocaleString();
}

function loadLeaderboard() {
    const usersRef = ref(db, 'users');
    onValue(usersRef, (snapshot) => {
        allUsersData = snapshot.val();
        const searchValue = document.getElementById('leaderboardSearch')?.value || "";
        renderLeaderboard(searchValue);
        updateBotStatus();
    });
}

function loadProfileHistory() {
    const requestsRef = ref(db, 'requests');
    onValue(requestsRef, (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('profileHistoryBody');
        if (!body) return;
        body.innerHTML = '';
        if (!data || !currentUser) return;
        
        // (Der Rest der App-Logik läuft wie gehabt weiter...)
    });
}
