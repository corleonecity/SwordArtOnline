// ==========================================
// 1. SETTINGS & CONFIGURATION
// ==========================================

const OWNER_USER_ID = '917426398120005653';

// Roles for access control - stored in Firebase
let ADMIN_ROLES = ['1503609455466643547'];
let OWNER_ROLES = ['1504646932243546152'];

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

async function sendGPRequestToDiscord(requestData, images) {
    const formData = new FormData();
    
    const embed = {
        title: "💎 New GP Donation Request",
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

    const adminRoleId = ADMIN_ROLES[0] || '1503609455466643547';
    
    formData.append('payload_json', JSON.stringify({
        content: `<@&${adminRoleId}> New GP donation requires review!`,
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
        loadEditableBoards();
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
                <td style="color:#48bb78; font-weight:bold; font-size:16px;">${(u.totalGP || 0).toLocaleString()} GP</td>
            </tr>
        `;
    });
    
    if (usersArray.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No users with GP yet</td></tr>';
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
                    <td style="font-size:14px; color:#aaa;">${dateStr}</td>
                    <td style="font-weight:bold;">+${req.amount.toLocaleString()} GP</td>
                    <td>${statusHtml}</td>
                </tr>
            `;
        });
        
        if (userRequests.length === 0) {
            body.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#666;">No requests yet</td></tr>';
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
                        <button class="btn-small btn-approve" onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'approve', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn-small btn-deny" onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'reject', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${escapeHtml(req.discordName)}', '${escapeHtml(req.discordUsername)}', '${escapeHtml(req.robloxName)}', '${escapeHtml(req.robloxUsername)}')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </td>
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
            const embed = {
                title: action === 'approve' ? "✅ GP Donation Approved" : "❌ GP Donation Rejected",
                color: action === 'approve' ? 0x48bb78 : 0xf56565,
                fields: [
                    { name: "💬 Discord", value: `**Name:** ${discordName}\n**Tag:** @${discordUsername}\n**Ping:** <@${userId}>`, inline: true },
                    { name: "🎮 Roblox", value: `**Name:** ${robloxName}\n**User:** @${robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${robloxId}/profile)`, inline: true },
                    { name: "💰 Amount", value: `**${action === 'approve' ? '+' : '-'}${amount.toLocaleString()} GP**`, inline: false },
                    { name: "📊 New Total", value: `**${newTotal.toLocaleString()} GP**`, inline: true },
                    { name: "🏆 Rank", value: `**#${rank}**`, inline: true },
                    { name: "🛡️ Processed By", value: `<@${currentUser.id}>`, inline: false }
                ],
                timestamp: new Date().toISOString(),
                footer: { text: "SwordArtOnline GP System" }
            };
            await sendDiscordMessage(processedChannel, null, [embed]);
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
        
        let html = '<table class="table"><thead><tr><th>Role ID</th><th>Type</th><th>Action</th></tr></thead><tbody>';
        
        ADMIN_ROLES.forEach(role => {
            html += `<tr><td><code>${escapeHtml(role)}</code></td><td><span class="status-badge status-approved">Admin</span></td><td><button class="btn-small btn-remove-role" onclick="removeAdminRole('${role}')">Remove</button></td></tr>`;
        });
        
        OWNER_ROLES.forEach(role => {
            html += `<tr><td><code>${escapeHtml(role)}</code></td><td><span class="status-badge status-pending">Owner</span></td><td><button class="btn-small btn-remove-role" onclick="removeOwnerRole('${role}')">Remove</button></td></tr>`;
        });
        
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
        
        showNotify(`Role ${roleId} added as ${permissionLevel}!`, "success");
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
        showNotify(`Role ${roleId} removed from admin!`, "success");
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
        showNotify(`Role ${roleId} removed from owner!`, "success");
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
        await loadEditableBoards();
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
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">No kick logs found</td></tr>';
            return;
        }
        
        const logs = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        
        logs.forEach(log => {
            const dateStr = new Date(log.timestamp).toLocaleString();
            body.innerHTML += `
                <tr>
                    <td style="font-size:12px;">${dateStr}</td>
                    <td><code>${escapeHtml(log.kickedUserId || '?')}</code><br>${escapeHtml(log.kickedUserName || '')}</td>
                    <td><code>${escapeHtml(log.kickedByUserId || '?')}</code><br>${escapeHtml(log.kickedByUserName || '')}</td>
                    <td>${escapeHtml(log.reason || 'No reason')}</td>
                    <td>${log.dmSent ? '✅ Yes' : '❌ No'}</td>
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
// 11. EDITABLE BOARDS FUNCTIONS
// ==========================================

async function loadEditableBoards() {
    const channels = await getChannelConfig();
    
    const chUserInfoDisplay = document.getElementById('chUserInfoDisplay');
    const chPanelInfoDisplay = document.getElementById('chPanelInfoDisplay');
    const chLeaderboardDisplay = document.getElementById('chLeaderboardDisplay');
    
    if (chUserInfoDisplay) chUserInfoDisplay.textContent = channels.CH_USER_INFO || 'Not configured';
    if (chPanelInfoDisplay) chPanelInfoDisplay.textContent = channels.CH_PANEL_INFO || 'Not configured';
    if (chLeaderboardDisplay) chLeaderboardDisplay.textContent = channels.CH_LEADERBOARD || 'Not configured';
    
    const boardsRef = ref(db, 'config/boards');
    const snap = await get(boardsRef);
    const boards = snap.val() || {};
    
    const userInfoTextarea = document.getElementById('editUserInfoBoard');
    if (userInfoTextarea) {
        userInfoTextarea.value = boards.userInfoContent || '🛡️ **Guild User Info**\n\nWelcome to the SwordArtOnline server!\n\n**Guild Members:**\n{USER_LIST}\n\n**Last Updated:** {TIMESTAMP}';
    }
    
    const panelInfoTextarea = document.getElementById('editPanelInfoBoard');
    if (panelInfoTextarea) {
        panelInfoTextarea.value = boards.panelInfoContent || '💻 **Panel Registration Info**\n\n**Registered Users:**\n{REGISTERED_LIST}\n\n**Unregistered Users:**\n{UNREGISTERED_LIST}\n\n**Last Updated:** {TIMESTAMP}';
    }
    
    const leaderboardTextarea = document.getElementById('editLeaderboardBoard');
    if (leaderboardTextarea) {
        leaderboardTextarea.value = boards.leaderboardContent || '🏆 **Top 10 GP Donators**\n\n{TOP_USERS}\n\n**Last Updated:** {TIMESTAMP}\n\n🔗 [View Full Leaderboard](https://corleonecity.github.io/SwordArtOnline/)';
    }
}

async function fetchGuildMembers() {
    try {
        const response = await fetch(`${BACKEND_URL}/guild-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: '1439377447630930084' })
        });
        const data = await response.json();
        return data.members || [];
    } catch (e) {
        console.error("Failed to fetch guild members:", e);
        return [];
    }
}

async function fetchRegisteredUsers() {
    const usersRef = ref(db, 'users');
    const snap = await get(usersRef);
    const users = snap.val() || {};
    
    const registered = [];
    const unregistered = [];
    
    for (const [key, user] of Object.entries(users)) {
        if (user.robloxId && user.robloxId !== '1') {
            registered.push(`<@${user.id}> - ${user.robloxName || 'Unknown'}`);
        } else if (user.id) {
            unregistered.push(`<@${user.id}>`);
        }
    }
    
    return { registered, unregistered };
}

async function fetchTopUsers() {
    const usersRef = ref(db, 'users');
    const snap = await get(usersRef);
    const users = snap.val() || {};
    
    const topUsers = Object.values(users)
        .filter(u => u.totalGP && u.totalGP > 0)
        .sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0))
        .slice(0, 10);
    
    let leaderboardText = '';
    topUsers.forEach((u, i) => {
        let rankEmoji = '🏅';
        if (i === 0) rankEmoji = '🥇';
        else if (i === 1) rankEmoji = '🥈';
        else if (i === 2) rankEmoji = '🥉';
        leaderboardText += `${rankEmoji} **${i + 1}.** <@${u.id}> | **${(u.totalGP || 0).toLocaleString()} GP**\n`;
    });
    
    if (topUsers.length === 0) {
        leaderboardText = '*No verified donations yet.*';
    }
    
    return leaderboardText;
}

function replacePlaceholders(content, replacements) {
    let result = content;
    for (const [placeholder, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), value);
    }
    return result;
}

async function updateUserInfoBoard() {
    const content = document.getElementById('editUserInfoBoard').value;
    if (!content) {
        showNotify("Please enter content for the board!", "error");
        return;
    }
    
    const boardsRef = ref(db, 'config/boards');
    await update(boardsRef, { userInfoContent: content });
    
    const members = await fetchGuildMembers();
    const userList = members.map(m => `<@${m.user.id}>`).join('\n') || '*None*';
    
    const finalContent = replacePlaceholders(content, {
        USER_LIST: userList,
        TIMESTAMP: new Date().toLocaleString()
    });
    
    const channels = await getChannelConfig();
    const channelId = channels.CH_USER_INFO;
    
    if (!channelId) {
        showNotify("Channel ID not configured! Please configure CH_USER_INFO first.", "error");
        return;
    }
    
    showNotify("Updating User Info Board...", "warning");
    
    const success = await sendDiscordMessage(channelId, finalContent, null);
    
    if (success) {
        showNotify("User Info Board updated successfully!", "success");
    } else {
        showNotify("Failed to update board!", "error");
    }
}

async function updatePanelInfoBoard() {
    const content = document.getElementById('editPanelInfoBoard').value;
    if (!content) {
        showNotify("Please enter content for the board!", "error");
        return;
    }
    
    const boardsRef = ref(db, 'config/boards');
    await update(boardsRef, { panelInfoContent: content });
    
    const { registered, unregistered } = await fetchRegisteredUsers();
    
    const finalContent = replacePlaceholders(content, {
        REGISTERED_LIST: registered.join('\n') || '*None*',
        UNREGISTERED_LIST: unregistered.join('\n') || '*None*',
        TIMESTAMP: new Date().toLocaleString()
    });
    
    const channels = await getChannelConfig();
    const channelId = channels.CH_PANEL_INFO;
    
    if (!channelId) {
        showNotify("Channel ID not configured! Please configure CH_PANEL_INFO first.", "error");
        return;
    }
    
    showNotify("Updating Panel Info Board...", "warning");
    
    const success = await sendDiscordMessage(channelId, finalContent, null);
    
    if (success) {
        showNotify("Panel Info Board updated successfully!", "success");
    } else {
        showNotify("Failed to update board!", "error");
    }
}

async function updateLeaderboardBoard() {
    const content = document.getElementById('editLeaderboardBoard').value;
    if (!content) {
        showNotify("Please enter content for the board!", "error");
        return;
    }
    
    const boardsRef = ref(db, 'config/boards');
    await update(boardsRef, { leaderboardContent: content });
    
    const topUsersList = await fetchTopUsers();
    
    const finalContent = replacePlaceholders(content, {
        TOP_USERS: topUsersList,
        TIMESTAMP: new Date().toLocaleString()
    });
    
    const channels = await getChannelConfig();
    const channelId = channels.CH_LEADERBOARD;
    
    if (!channelId) {
        showNotify("Channel ID not configured! Please configure CH_LEADERBOARD first.", "error");
        return;
    }
    
    showNotify("Updating Leaderboard Board...", "warning");
    
    const success = await sendDiscordMessage(channelId, finalContent, null);
    
    if (success) {
        showNotify("Leaderboard Board updated successfully!", "success");
    } else {
        showNotify("Failed to update board!", "error");
    }
}

async function refreshBoardContent(boardType) {
    const boardsRef = ref(db, 'config/boards');
    const snap = await get(boardsRef);
    const boards = snap.val() || {};
    
    switch(boardType) {
        case 'userInfo':
            const userInfoTextarea = document.getElementById('editUserInfoBoard');
            if (userInfoTextarea && boards.userInfoContent) {
                userInfoTextarea.value = boards.userInfoContent;
            }
            break;
        case 'panelInfo':
            const panelInfoTextarea = document.getElementById('editPanelInfoBoard');
            if (panelInfoTextarea && boards.panelInfoContent) {
                panelInfoTextarea.value = boards.panelInfoContent;
            }
            break;
        case 'leaderboard':
            const leaderboardTextarea = document.getElementById('editLeaderboardBoard');
            if (leaderboardTextarea && boards.leaderboardContent) {
                leaderboardTextarea.value = boards.leaderboardContent;
            }
            break;
    }
    showNotify(`Content refreshed!`, "success");
}

async function sendBotMessage() {
    const channelId = document.getElementById('targetChannelId').value.trim();
    const content = document.getElementById('botMessageContent').value;
    const embedTitle = document.getElementById('botEmbedTitle').value;
    const embedDesc = document.getElementById('botEmbedDesc').value;
    const embedColor = document.getElementById('botEmbedColor').value;
    
    if (!channelId) {
        alert("Please enter a channel ID!");
        return;
    }
    
    if (!content && !embedTitle && !embedDesc) {
        alert("Please enter a message or embed content!");
        return;
    }
    
    let embeds = null;
    if (embedTitle || embedDesc) {
        embeds = [{
            title: embedTitle || undefined,
            description: embedDesc || undefined,
            color: parseInt(embedColor.replace('#', ''), 16),
            timestamp: new Date().toISOString()
        }];
    }
    
    showNotify("Sending message...", "warning");
    
    const success = await sendDiscordMessage(channelId, content, embeds);
    
    if (success) {
        showNotify("Message sent successfully!", "success");
        document.getElementById('botMessageContent').value = '';
        document.getElementById('botEmbedTitle').value = '';
        document.getElementById('botEmbedDesc').value = '';
    } else {
        showNotify("Failed to send message! Check channel ID.", "error");
    }
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
        loadEditableBoards();
    } else {
        showNotify("You don't have permission to access Owner Panel!", "error");
    }
});

document.getElementById('addRoleBtn')?.addEventListener('click', window.addAdminRole);
document.getElementById('saveChannelConfigBtn')?.addEventListener('click', saveChannelConfig);
document.getElementById('sendBotMessageBtn')?.addEventListener('click', sendBotMessage);
document.getElementById('enableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(true));
document.getElementById('disableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(false));

document.getElementById('updateUserInfoBtn')?.addEventListener('click', updateUserInfoBoard);
document.getElementById('updatePanelInfoBtn')?.addEventListener('click', updatePanelInfoBoard);
document.getElementById('updateLeaderboardBtn')?.addEventListener('click', updateLeaderboardBoard);
document.getElementById('refreshUserInfoBtn')?.addEventListener('click', () => refreshBoardContent('userInfo'));
document.getElementById('refreshPanelInfoBtn')?.addEventListener('click', () => refreshBoardContent('panelInfo'));
document.getElementById('refreshLeaderboardBtn')?.addEventListener('click', () => refreshBoardContent('leaderboard'));

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
