// ==========================================
// 1. SETTINGS & CONFIGURATION
// ==========================================

const OWNER_USER_ID = '917426398120005653';

// Roles for access control - stored in Firebase
let ADMIN_ROLES = ['1503609455466643547'];
let OWNER_ROLES = ['1504646932243546152'];

// Role name cache
let roleNameCache = {};

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

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

function getSafeDbKey(username) {
    return username ? username.replace(/[.#$\[\]]/g, '_') : 'unknown_user';
}

function playLoginMusic() {
    const ac = document.getElementById('audioPlayerContainer');
    if (ac.innerHTML === '') {
        ac.innerHTML = `<iframe width="0" height="0" src="https://www.youtube.com/embed/BtEkzZoUCpw?autoplay=1&loop=1" frameborder="0" allow="autoplay"></iframe>`;
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
    return userGuildRoles.includes('1503193408280330400');
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
// 4. DISCORD BOT MESSAGES
// ==========================================

async function sendDiscordMessage(channelId, content, embeds = null) {
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

// LOGIN NOTIFICATION - Single message with ping + embed
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
        color: 0x48bb78,
        fields: [
            { name: "💬 Discord", value: `**Name:** ${userData.discordName}\n**Tag:** @${userData.discordUsername}\n**ID:** <@${userData.userId}>`, inline: true },
            { name: "🎮 Roblox", value: `**Name:** ${userData.robloxName}\n**User:** @${userData.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${userData.robloxId}/profile)`, inline: true },
            { name: "📝 Nickname Updated", value: `${userData.robloxName} (@${userData.robloxUsername})`, inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "SwordArtOnline Panel" }
    };
    
    // Send ONE message with ping (user mention) + embed
    return sendDiscordMessage(loginLogsChannel, `<@${userData.userId}>`, [embed]);
}

// LEAVE NOTIFICATION - Single message with admin ping + embed
async function sendLeftUserToDiscord(userData) {
    const channels = await getChannelConfig();
    const leaveLogsChannel = channels.CH_LEAVE_LOGS;
    
    if (!leaveLogsChannel) {
        console.warn("CH_LEAVE_LOGS not configured - skipping leave notification");
        return false;
    }
    
    const { adminRoles } = await getAdminRoles();
    const adminRoleId = adminRoles[0] || '1503609455466643547';
    
    const robloxProfileLink = userData.robloxUsername 
        ? `https://www.roblox.com/user.aspx?username=${userData.robloxUsername}`
        : "";
    
    const embed = {
        title: "🚨 User has left the server!",
        url: "https://corleonecity.github.io/SwordArtOnline/",
        color: 0xf56565,
        fields: [
            { name: "💬 Discord", value: `**Display:** ${userData.discordName || "Unknown"}\n**User:** @${userData.discordUsername || "Unknown"}\n**Ping:** <@${userData.id}>`, inline: true },
            { name: "🎮 Roblox", value: `**Display:** ${userData.robloxName || "Unknown"}\n**User:** @${userData.robloxUsername || "Unknown"}\n**Profile:** [Click Here](${robloxProfileLink})`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "SwordArtOnline Panel" }
    };
    
    // Send ONE message with admin ping + embed
    return sendDiscordMessage(leaveLogsChannel, `<@&${adminRoleId}>`, [embed]);
}

// GP REQUEST NOTIFICATION - Single message with admin ping + embed + images
async function sendGPRequestToDiscord(requestData, images) {
    const formData = new FormData();
    
    const adminRoleId = ADMIN_ROLES[0] || '1503609455466643547';
    
    const embed = {
        title: "💎 New GP Donation Request",
        url: "https://corleonecity.github.io/SwordArtOnline/",
        color: 0xcd7f32,
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

    // Send ONE message with admin ping + embed + images
    formData.append('payload_json', JSON.stringify({
        content: `<@&${adminRoleId}>`,
        embeds: [embed]
    }));
    
    const imagesToSend = images.slice(0, 1);
    for (let i = 0; i < imagesToSend.length; i++) {
        formData.append(`file${i}`, imagesToSend[i], `proof_${i+1}.png`);
    }

    try {
        const response = await fetch(`${BACKEND_URL}/send-gp-request`, {
            method: 'POST',
            body: formData
        });
        return response.ok;
    } catch (e) {
        console.error("GP request send error:", e);
        return false;
    }
}

// ==========================================
// 5. DISCORD & ROBLOX AUTHENTIFICATION
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
            checkRobloxLink();
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
            const userRef = ref(db, `users/${dbKey}`);
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

            await sendLoginWebhook({
                discordName: dDisplayName,
                discordUsername: currentUser.username,
                userId: currentUser.id,
                robloxName: rDisplayName,
                robloxUsername: rUsername,
                robloxId: rId
            });

            fetch(`${BACKEND_URL}/check-member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, updateRoles: true })
            });

            window.location.href = REDIRECT_URI;
        }
    } catch (e) {
        alert("Linking Error!");
        console.error(e);
    }
}

async function checkRobloxLink() {
    try {
        const isStillMember = await doLiveCheck();
        if (!isStillMember) return;

        await loadMaintenanceStatus();
        await loadRoleConfig();
        
        const dbKey = getSafeDbKey(currentUser.username);
        const snap = await get(ref(db, `users/${dbKey}`));
        document.getElementById('loginPage').classList.add('hidden');
        
        if (snap.exists() && snap.val().robloxId) {
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
            document.getElementById('robloxPage').classList.remove('hidden');
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
    document.getElementById('robloxPage').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('userWelcome').textContent = `Hi, ${currentUser.global_name || currentUser.username}`;
    if (currentUser.avatar) {
        document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
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
    }
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
                <td style="color:#48bb78; font-weight:bold; font-size:16px;">${(u.totalGP || 0).toLocaleString()} GP</span></td>
            </tr>
        `;
    });
    
    if (usersArray.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No users with GP yet</span></td></tr>';
    }
}

function loadLeaderboard() {
    onValue(ref(db, 'users'), (snapshot) => {
        allUsersData = snapshot.val();
        const searchValue = document.getElementById('leaderboardSearch')?.value || "";
        renderLeaderboard(searchValue);
    });
}

function loadProfileHistory() {
    onValue(ref(db, 'requests'), (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('profileHistoryBody');
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
                    <td style="font-size:14px; color:#aaa;">${dateStr}</span>。</span>
                    <td style="font-weight:bold;">+${req.amount.toLocaleString()} GP</span>。</span>
                    <td>${statusHtml}</span>。</span>
                </tr>
            `;
        });
        
        if (userRequests.length === 0) {
            body.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#666;">No requests yet</span>。</span></tr>';
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
    fileCountText.textContent = `${selectedFiles.length} / 1 image selected`;
    
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

        await sendGPRequestToDiscord({
            discordName: dName,
            discordUsername: dUser,
            userId: dId,
            robloxName: rName,
            robloxUsername: rUser,
            robloxId: rId,
            amount: amount,
            requestId: reqKey
        }, selectedFiles);

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
// 9. ADMIN FUNCTIONS
// ==========================================

function loadAdminData() {
    onValue(ref(db, 'requests'), (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('adminPendingBody');
        if (!body) return;
        
        body.innerHTML = '';
        if (!data) {
            body.innerHTML = '</table><td colspan="4" style="text-align:center; color:#666;">No pending requests</span></td></tr>';
            return;
        }
        
        const pendingRequests = Object.values(data)
            .filter(r => r.status === 'pending')
            .sort((a, b) => a.timestamp - b.timestamp);
        
        if (pendingRequests.length === 0) {
            body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No pending requests</span></td></tr>';
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
                    </span>。
                    <td>
                        <div class="user-name-cell">
                            <span class="display-name">${escapeHtml(req.robloxName || "Unknown")}</span>
                            <span class="username-handle">@${escapeHtml(req.robloxUsername || "Unknown")}</span>
                        </div>
                    </span>。
                    <td style="color:#cd7f32; font-weight:bold;">+${req.amount.toLocaleString()} GP</span>。</span>
                    <td>
                        <button class="btn-small btn-approve" onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'approve', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn-small btn-deny" onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'reject', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </span>。
                </tr>
            `;
        });
    });
}

window.handleAdminAction = async (reqId, userId, amount, action, passedDbKey, robloxId, discordName, discordUsername, robloxName, robloxUsername) => {
    if (!confirm(`Are you sure you want to ${action === 'approve' ? 'APPROVE' : 'REJECT'} this request?`)) return;
    
    try {
        const reqSnap = await get(ref(db, `requests/${reqId}`));
        const reqData = reqSnap.val();
        if (!reqData) return alert("Request not found!");

        await update(ref(db, `requests/${reqId}`), {
            status: action === 'approve' ? 'approved' : 'rejected'
        });

        const dbKey = getSafeDbKey(passedDbKey);
        let newTotal = 0;
        const userRef = ref(db, `users/${dbKey}`);
        const snap = await get(userRef);

        if (snap.exists()) {
            newTotal = snap.val().totalGP || 0;
            if (action === 'approve') {
                newTotal += amount;
                await update(userRef, { totalGP: newTotal });
            }
        }

        const allUsersSnap = await get(ref(db, 'users'));
        let rank = "?";
        if (allUsersSnap.exists()) {
            const sorted = Object.values(allUsersSnap.val())
                .filter(u => u.totalGP && u.totalGP > 0)
                .sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0));
            const index = sorted.findIndex(u => u.id === userId);
            rank = index !== -1 ? (index + 1).toString() : "?";
        }

        const channels = await getChannelConfig();
        const processedChannel = channels.CH_GP_PROCESSED;
        
        if (processedChannel) {
            const actionText = action === 'approve' ? '✅ GP Donation Approved' : '❌ GP Donation Rejected';
            const amountText = action === 'approve' ? `+${amount.toLocaleString()} GP` : `-${amount.toLocaleString()} GP`;
            
            const embed = {
                title: actionText,
                url: "https://corleonecity.github.io/SwordArtOnline/",
                color: action === 'approve' ? 0x48bb78 : 0xf56565,
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
            
            // Send ONE message with user ping + embed
            await sendDiscordMessage(processedChannel, `<@${userId}>`, [embed]);
        }

        showNotify(`Request ${action === 'approve' ? 'approved' : 'rejected'}!`, "success");
        
    } catch (e) {
        console.error("Admin action error:", e);
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
        
        if (ADMIN_ROLES.length === 0 && OWNER_ROLES.length === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center;">No admin/owner roles configured.</p>';
            return;
        }
        
        let html = '<table class="table"><thead><tr><th>Role Name</th><th>Role ID</th><th>Type</th><th>Action</th></tr></thead><tbody>';
        
        for (const role of ADMIN_ROLES) {
            const roleName = await fetchRoleName(role);
            html += `<tr><td><span class="status-badge status-approved">${escapeHtml(roleName)}</span></span>。</span><td><code>${escapeHtml(role)}</code></span>。</span><td>Admin</span>。</span><td><button class="btn-small btn-remove-role" onclick="removeAdminRole('${role}')">Remove</button></span>。</span></tr>`;
        }
        
        for (const role of OWNER_ROLES) {
            const roleName = await fetchRoleName(role);
            html += `<tr><td><span class="status-badge status-pending">${escapeHtml(roleName)}</span></span>。</span><td><code>${escapeHtml(role)}</code></span>。</span><td>Owner</span>。</span><td><button class="btn-small btn-remove-role" onclick="removeOwnerRole('${role}')">Remove</button></span>。</span></tr>`;
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
        if (permissionLevel === 'admin') {
            if (!ADMIN_ROLES.includes(roleId)) {
                ADMIN_ROLES.push(roleId);
            }
        } else {
            if (!OWNER_ROLES.includes(roleId)) {
                OWNER_ROLES.push(roleId);
            }
        }
        
        await set(ref(db, 'config/admin_roles'), {
            adminRoles: ADMIN_ROLES,
            ownerRoles: OWNER_ROLES
        });
        
        showNotify(`Role added as ${permissionLevel}!`, "success");
        document.getElementById('newRoleId').value = '';
        await loadAdminRolesList();
        await fetchUserRoles(currentUser.id);
    } catch (e) {
        showNotify("Error saving role!", "error");
    }
};

window.removeAdminRole = async (roleId) => {
    const index = ADMIN_ROLES.indexOf(roleId);
    if (index !== -1) {
        ADMIN_ROLES.splice(index, 1);
        await set(ref(db, 'config/admin_roles'), {
            adminRoles: ADMIN_ROLES,
            ownerRoles: OWNER_ROLES
        });
        showNotify(`Role removed from admin!`, "success");
        await loadAdminRolesList();
        await fetchUserRoles(currentUser.id);
    }
};

window.removeOwnerRole = async (roleId) => {
    const index = OWNER_ROLES.indexOf(roleId);
    if (index !== -1) {
        OWNER_ROLES.splice(index, 1);
        await set(ref(db, 'config/admin_roles'), {
            adminRoles: ADMIN_ROLES,
            ownerRoles: OWNER_ROLES
        });
        showNotify(`Role removed from owner!`, "success");
        await loadAdminRolesList();
        await fetchUserRoles(currentUser.id);
    }
};

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
        
        if (Object.keys(configToSave).length === 0) {
            await set(ref(db, 'config/channels'), null);
            showNotify("All channel configurations cleared!", "success");
        } else {
            await set(ref(db, 'config/channels'), configToSave);
            showNotify("Channel configuration saved!", "success");
        }
        
        await loadChannelConfigUI();
    } catch (e) {
        console.error("Error saving config:", e);
        showNotify("Error saving configuration!", "error");
    }
}

async function loadKickLogs() {
    const logsRef = ref(db, 'logs/kicks');
    onValue(logsRef, (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('kickLogsBody');
        if (!body) return;
        
        body.innerHTML = '';
        if (!data) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">No kick logs found</span>。</span></tr>';
            return;
        }
        
        const logs = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        
        logs.forEach(log => {
            const dateStr = new Date(log.timestamp).toLocaleString();
            body.innerHTML += `
                <tr>
                    <td style="font-size:12px;">${dateStr}</span>。</span>
                    <td><code>${escapeHtml(log.kickedUserId || '?')}</code><br>${escapeHtml(log.kickedUserName || '')}</span>。</span>
                    <td><code>${escapeHtml(log.kickedByUserId || '?')}</code><br>${escapeHtml(log.kickedByUserName || '')}</span>。</span>
                    <td>${escapeHtml(log.reason || 'No reason')}</span>。</span>
                    <td>${log.dmSent ? '✅ Yes' : '❌ No'}</span>。</span>
                </tr>
            `;
        });
    });
}

async function setMaintenanceMode(enabled) {
    try {
        await set(ref(db, 'config/maintenance'), { enabled });
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

// ==========================================
// 11. SAVED MESSAGES FUNCTIONS
// ==========================================

async function loadSavedMessages() {
    const messagesRef = ref(db, 'saved_messages');
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
            
            container.innerHTML += `
                <div class="saved-message-item" data-id="${id}">
                    <div class="message-name">📝 ${escapeHtml(msg.name)}</div>
                    <div class="message-channel">📡 Channel ID: ${escapeHtml(msg.channelId || 'Not set')}</div>
                    <div class="message-preview">
                        <strong>Message:</strong> ${escapeHtml(previewContent)}
                        ${msg.embedTitle ? `<br><strong>Embed:</strong> ${escapeHtml(msg.embedTitle)}` : ''}
                    </div>
                    <div class="message-actions">
                        <button class="btn-edit-message" onclick="editSavedMessage('${id}')">✏️ Edit</button>
                        <button class="btn-send-message" onclick="sendSavedMessage('${id}')">📤 Send Now</button>
                        <button class="btn-delete-message" onclick="deleteSavedMessage('${id}')">🗑️ Delete</button>
                    </div>
                </div>
            `;
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
    } catch (e) {
        showNotify("Error saving message!", "error");
    }
}

window.sendSavedMessage = async (id) => {
    const snap = await get(ref(db, `saved_messages/${id}`));
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
    
    const success = await sendDiscordMessage(msg.channelId, msg.content, embeds);
    
    if (success) {
        showNotify(`Message "${msg.name}" sent successfully!`, "success");
    } else {
        showNotify(`Failed to send "${msg.name}"!`, "error");
    }
};

window.deleteSavedMessage = async (id) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
        await remove(ref(db, `saved_messages/${id}`));
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
    sessionStorage.removeItem('pn_session');
    window.location.href = REDIRECT_URI;
});

document.getElementById('rbxLogoutBtn')?.addEventListener('click', async () => {
    if (!confirm("Disconnect Roblox?")) return;
    try {
        const dbKey = getSafeDbKey(currentUser.username);
        await update(ref(db, `users/${dbKey}`), {
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
    if (selectedFiles.length + newFiles.length > 1) {
        alert("Only 1 screenshot is allowed!");
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
    if (hasAdminPermission()) {
        switchTab('Admin');
        loadAdminData();
    } else {
        showNotify("You don't have permission to access Admin Panel!", "error");
    }
});
document.getElementById('tabBtnOwner')?.addEventListener('click', () => {
    if (hasOwnerPermission()) {
        switchTab('Owner');
        loadAdminRolesList();
        loadChannelConfigUI();
        loadKickLogs();
        loadSavedMessages();
    } else {
        showNotify("You don't have permission to access Owner Panel!", "error");
    }
});

document.getElementById('addRoleBtn')?.addEventListener('click', window.addAdminRole);
document.getElementById('saveChannelConfigBtn')?.addEventListener('click', saveChannelConfig);
document.getElementById('saveMessageBtn')?.addEventListener('click', saveMessage);
document.getElementById('sendMessageBtn')?.addEventListener('click', () => {
    if (currentEditingMessageId) {
        sendSavedMessage(currentEditingMessageId);
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
// 13. APP START (AUTH CHECK)
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
            checkRobloxLink();
        } catch (e) {
            sessionStorage.removeItem('pn_session');
            playLoginMusic();
        }
    } else {
        playLoginMusic();
    }
}
