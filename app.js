// ==========================================
// 1. SETTINGS & KONFIGURATION
// ==========================================

const ADMIN_DISCORD_IDS = ['917426398120005653', '1503572666639061074'];

// Die Rolle, die zum Einreichen von GP Requests berechtigt ist
const REQUIRED_GP_SUBMIT_ROLE = "1503193408280330400";

const DISCORD_CLIENT_ID = '1503179151073345678';
const ROBLOX_CLIENT_ID = '1529843549493669743';

const BACKEND_URL = 'https://gentle-queen-63f0.keulecolin2005.workers.dev';
const REDIRECT_URI = 'https://corleonecity.github.io/SwordArtOnline/';

// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update, push } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// Firebase Konfiguration
const firebaseConfig = {
    apiKey: "AIzaSyAjo_0WEf9qBH-EcKPNEY4PtBVGwxdHsbI",
    authDomain: "cc-shop-finanzsystem.firebaseapp.com",
    databaseURL: "https://cc-shop-finanzsystem-default-rtdb.firebaseio.com",
    projectId: "cc-shop-finanzsystem",
    storageBucket: "cc-shop-finanzsystem.firebasestorage.app",
    messagingSenderId: "575918945925",
    appId: "1:575918945925:web:288a763f1bcbb5ae7e5bec"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Globale Variablen
let currentUser = null;
let selectedFiles = [];
let allUsersData = {};
let liveCheckInterval = null;
let userGuildRoles = [];

// ==========================================
// 2. HELPER FUNKTIONEN
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
    const tabs = ['Spenden', 'Leaderboard', 'Profile', 'Admin'];
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

function hasGpSubmitPermission() {
    return userGuildRoles.includes(REQUIRED_GP_SUBMIT_ROLE);
}

function updateGpSubmitVisibility() {
    const gpSubmitCard = document.getElementById('gpSubmitCard');
    const noPermissionCard = document.getElementById('noPermissionCard');
    const tabBtnSpenden = document.getElementById('tabBtnSpenden');
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
    
    updateGpSubmitVisibility();
    return userGuildRoles;
}

// ==========================================
// 3. DISCORD BOT NACHRICHTEN ÜBER CLOUDFLARE
// ==========================================

async function sendDiscordMessage(endpoint, payload) {
    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const error = await response.text();
            console.error(`Discord message failed (${endpoint}):`, error);
            return false;
        }
        return true;
    } catch (e) {
        console.error(`Discord message error (${endpoint}):`, e);
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

    formData.append('payload_json', JSON.stringify({
        content: `<@&1503609455466643547> New GP donation requires review!`,
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
        
        if (!response.ok) {
            console.error("GP request send failed:", await response.text());
            return false;
        }
        return true;
    } catch (e) {
        console.error("GP request send error:", e);
        return false;
    }
}

async function sendLoginToDiscord(userData) {
    const embed = {
        title: "🟢 New User Registered",
        color: 0x48bb78,
        fields: [
            { name: "💬 Discord", value: `**Name:** ${userData.discordName}\n**Tag:** @${userData.discordUsername}\n**ID:** ${userData.userId}`, inline: true },
            { name: "🎮 Roblox", value: `**Name:** ${userData.robloxName}\n**User:** @${userData.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${userData.robloxId}/profile)`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "SwordArtOnline Panel" }
    };

    return sendDiscordMessage('/send-login', { embeds: [embed] });
}

async function sendProcessedToDiscord(data) {
    const embed = {
        title: data.action === 'approve' ? "✅ GP Donation Approved" : "❌ GP Donation Rejected",
        color: data.action === 'approve' ? 0x48bb78 : 0xf56565,
        fields: [
            { name: "💬 Discord", value: `**Name:** ${data.discordName}\n**Tag:** @${data.discordUsername}\n**Ping:** <@${data.userId}>`, inline: true },
            { name: "🎮 Roblox", value: `**Name:** ${data.robloxName}\n**User:** @${data.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${data.robloxId}/profile)`, inline: true },
            { name: "💰 Amount", value: `**${data.action === 'approve' ? '+' : '-'}${data.amount.toLocaleString()} GP**`, inline: false },
            { name: "📊 New Total", value: `**${data.newTotal.toLocaleString()} GP**`, inline: true },
            { name: "🏆 Rank", value: `**#${data.rank}**`, inline: true },
            { name: "🛡️ Processed By", value: `<@${data.processedBy}>`, inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "SwordArtOnline GP System" }
    };

    return sendDiscordMessage('/send-processed', { embeds: [embed] });
}

async function sendUserLeftToDiscord(userData) {
    const embed = {
        title: "🚨 User has left the server!",
        color: 0xf56565,
        fields: [
            { name: "💬 Discord", value: `**Name:** ${userData.discordName}\n**Tag:** @${userData.discordUsername}\n**ID:** ${userData.userId}`, inline: true },
            { name: "🎮 Roblox", value: `**Name:** ${userData.robloxName || "Unknown"}\n**User:** @${userData.robloxUsername || "Unknown"}`, inline: true },
            { name: "💰 Total GP", value: `${(userData.totalGP || 0).toLocaleString()} GP`, inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "SwordArtOnline Panel" }
    };

    return sendDiscordMessage('/send-left-user', { 
        content: `<@&1503609455466643547>`,
        embeds: [embed] 
    });
}

// ==========================================
// 4. DISCORD & ROBLOX AUTHENTIFIZIERUNG
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
            const dbKey = getSafeDbKey(currentUser.username);
            const snap = await get(ref(db, `users/${dbKey}`));
            if (snap.exists() && !snap.val().hasLeftServer) {
                const userData = snap.val();
                await sendUserLeftToDiscord({
                    discordName: userData.discordName,
                    discordUsername: userData.discordUsername,
                    userId: currentUser.id,
                    robloxName: userData.robloxName,
                    robloxUsername: userData.robloxUsername,
                    totalGP: userData.totalGP || 0
                });
                await update(ref(db, `users/${dbKey}`), { hasLeftServer: true });
            }
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
    
    if (snap.exists() && snap.val().webhookSent === true) return;

    const success = await sendLoginToDiscord(userData);
    
    if (success) {
        await update(userRef, { webhookSent: true });
        console.log("Login notification sent successfully");
    } else {
        console.error("Login notification failed");
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
// 5. DASHBOARD & UI
// ==========================================

function showDashboard() {
    stopMusic();
    document.getElementById('robloxPage').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('userWelcome').textContent = `Hi, ${currentUser.global_name || currentUser.username}`;
    if (currentUser.avatar) {
        document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
    }
    
    if (ADMIN_DISCORD_IDS.includes(currentUser.id)) {
        document.getElementById('tabBtnAdmin').style.display = 'block';
        loadAdminData();
    }
    
    updateGpSubmitVisibility();
    
    loadLeaderboard();
    loadProfileHistory();
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
                <td><div class="user-name-cell"><span class="display-name">${u.discordName || "Unknown"}</span><span class="username-handle">@${u.discordUsername || "Unknown"}</span></div></td>
                <td><div class="user-name-cell"><span class="display-name">${u.robloxName || "Unknown"}</span><span class="username-handle">@${u.robloxUsername || "Unknown"}</span></div></td>
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
        
        if (ADMIN_DISCORD_IDS.includes(currentUser?.id)) {
            const select = document.getElementById('adminUserSelect');
            if (select && allUsersData) {
                select.innerHTML = '<option value="">-- Select a User --</option>';
                Object.values(allUsersData).forEach(u => {
                    const safeKey = getSafeDbKey(u.discordUsername);
                    select.innerHTML += `<option value="${safeKey}">${u.discordName} (@${u.discordUsername}) - ${u.totalGP || 0} GP</option>`;
                });
            }
        }
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
// 6. BILDER-UPLOAD & PREVIEW
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
// 7. GP SUBMIT FUNKTION
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
// 8. ADMIN FUNKTIONEN
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
                            <span class="display-name">${req.discordName || "Unknown"}</span>
                            <span class="username-handle">@${req.discordUsername || "Unknown"}</span>
                        </div>
                    </td>
                    <td>
                        <div class="user-name-cell">
                            <span class="display-name">${req.robloxName || "Unknown"}</span>
                            <span class="username-handle">@${req.robloxUsername || "Unknown"}</span>
                        </div>
                    </td>
                    <td style="color:#cd7f32; font-weight:bold;">+${req.amount.toLocaleString()} GP</td>
                    <td>
                        <button class="btn-small btn-approve" onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'approve', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${req.discordName}', '${req.discordUsername}', '${req.robloxName}', '${req.robloxUsername}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn-small btn-deny" onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'reject', '${req.dbKey || req.discordUsername}', '${req.robloxId || ''}', '${req.discordName}', '${req.discordUsername}', '${req.robloxName}', '${req.robloxUsername}')">
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

        await sendProcessedToDiscord({
            action: action,
            discordName: discordName || reqData.discordName,
            discordUsername: discordUsername || reqData.discordUsername,
            userId: userId,
            robloxName: robloxName || reqData.robloxName,
            robloxUsername: robloxUsername || reqData.robloxUsername,
            robloxId: robloxId || reqData.robloxId,
            amount: amount,
            newTotal: newTotal,
            rank: rank,
            processedBy: currentUser.id
        });

        showNotify(`Request ${action === 'approve' ? 'approved' : 'rejected'}!`, "success");
        
    } catch (e) {
        console.error("Admin action error:", e);
        alert("Error: " + e.message);
    }
};

// ==========================================
// 9. EVENT LISTENER & INITIALISIERUNG
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

document.getElementById('adminDeductBtn')?.addEventListener('click', async () => {
    const dbKey = document.getElementById('adminUserSelect')?.value;
    const amount = parseInt(document.getElementById('adminDeductAmount')?.value);
    if (!dbKey || isNaN(amount) || amount <= 0) return alert("Invalid selection.");
    try {
        const userRef = ref(db, `users/${dbKey}`);
        const snap = await get(userRef);
        if (snap.exists()) {
            let newGP = (snap.val().totalGP || 0) - amount;
            await update(userRef, { totalGP: newGP < 0 ? 0 : newGP });
            showNotify(`Deducted ${amount.toLocaleString()} GP!`, "success");
        }
    } catch (e) {
        alert("Error!");
    }
});

document.getElementById('adminResetBtn')?.addEventListener('click', async () => {
    const dbKey = document.getElementById('adminUserSelect')?.value;
    if (!dbKey || !confirm("Reset user to 0 GP?")) return;
    try {
        await update(ref(db, `users/${dbKey}`), { totalGP: 0 });
        showNotify(`User reset to 0 GP!`, "success");
    } catch (e) {
        alert("Error!");
    }
});

document.getElementById('tabBtnSpenden')?.addEventListener('click', () => switchTab('Spenden'));
document.getElementById('tabBtnLeaderboard')?.addEventListener('click', () => switchTab('Leaderboard'));
document.getElementById('tabBtnProfile')?.addEventListener('click', () => switchTab('Profile'));
document.getElementById('tabBtnAdmin')?.addEventListener('click', () => switchTab('Admin'));

// ==========================================
// 10. APP START (AUTH CHECK)
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
