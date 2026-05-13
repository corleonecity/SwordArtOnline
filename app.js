// ==========================================
// 1. SETTINGS & KONFIGURATION
// ==========================================

const ADMIN_DISCORD_IDS = ['917426398120005653', '1503572666639061074'];

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

// ==========================================
// 3. DISCORD & ROBLOX AUTHENTIFIZIERUNG
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
    liveCheckInterval = setInterval(doLiveCheck, 5000);
}

async function sendLoginWebhook(userData) {
    const dbKey = getSafeDbKey(userData.discordUsername);
    const userRef = ref(db, `users/${dbKey}`);
    const snap = await get(userRef);
    
    if (snap.exists() && snap.val().webhookSent === true) return;

    const dName = userData.discordName || "Unknown";
    const dUser = userData.discordUsername || "Unknown";
    const dId = userData.id || "1";
    const rName = userData.robloxName || "Unknown";
    const rUser = userData.robloxUsername || "Unknown";
    const rId = userData.robloxId || "1";

    const payload = {
        content: `<@&1503609455466643547>`,
        embeds: [{
            title: "New Account Linked",
            url: "https://corleonecity.github.io/SwordArtOnline/",
            color: 0x5865F2,
            fields: [
                { name: "💬 Discord", value: `**Display:** ${dName}\n**User:** @${dUser}\n**Ping:** <@${dId}>`, inline: true },
                { name: "🎮 Roblox", value: `**Display:** ${rName}\n**User:** @${rUser}\n**Profile:** [Click Here](https://www.roblox.com/users/${rId}/profile)`, inline: true }
            ],
            timestamp: new Date().toISOString()
        }]
    };

    try {
        await fetch(`${BACKEND_URL}/log-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await update(userRef, { webhookSent: true });
    } catch (e) {
        console.error("Login Error:", e);
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
            const userData = snap.val();
            showDashboard();
            sendLoginWebhook(userData);
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
        console.error(err);
    }
}

// ==========================================
// 4. DASHBOARD & UI
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
    loadLeaderboard();
    loadProfileHistory();
}

function renderLeaderboard(filterText) {
    const body = document.getElementById('leaderboardBody');
    body.innerHTML = '';
    if (!allUsersData) return;
    
    let usersArray = Object.values(allUsersData).sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0));
    
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
                <td style="color:#48bb78; font-weight:bold; font-size:16px;">${(u.totalGP || 0).toLocaleString()}</td>
            </tr>
        `;
    });
}

function loadLeaderboard() {
    onValue(ref(db, 'users'), (snapshot) => {
        allUsersData = snapshot.val();
        const searchValue = document.getElementById('leaderboardSearch')?.value || "";
        renderLeaderboard(searchValue);
        
        if (ADMIN_DISCORD_IDS.includes(currentUser?.id)) {
            const select = document.getElementById('adminUserSelect');
            if (select) {
                select.innerHTML = '<option value="">-- Select a User --</option>';
                if (allUsersData) {
                    Object.values(allUsersData).forEach(u => {
                        const safeKey = getSafeDbKey(u.discordUsername);
                        select.innerHTML += `<option value="${safeKey}">${u.discordName} (@${u.discordUsername}) - ${u.totalGP || 0} GP</option>`;
                    });
                }
            }
        }
    });
}

function loadProfileHistory() {
    onValue(ref(db, 'requests'), (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('profileHistoryBody');
        body.innerHTML = '';
        if (!data) return;
        
        const userRequests = Object.values(data)
            .filter(r => r.userId === currentUser?.id)
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
            if (req.status === 'pending') statusHtml = '<span class="status-badge status-pending">Pending</span>';
            else if (req.status === 'approved') statusHtml = '<span class="status-badge status-approved">Approved</span>';
            else statusHtml = '<span class="status-badge status-rejected">Rejected</span>';
            
            body.innerHTML += `
                <tr>
                    <td style="font-size:14px; color:#aaa;">${dateStr}</td>
                    <td style="font-weight:bold;">+${req.amount.toLocaleString()} GP</td>
                    <td>${statusHtml}</td>
                </tr>
            `;
        });
    });
}

// ==========================================
// 5. BILDER-UPLOAD & PREVIEW
// ==========================================

function updateImagePreviews() {
    const previewContainer = document.getElementById('imagePreviewContainer');
    const fileCountText = document.getElementById('fileCountText');
    
    previewContainer.innerHTML = '';
    fileCountText.textContent = `${selectedFiles.length} images selected`;
    
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
// 6. GP SUBMIT FUNKTION
// ==========================================

async function submitGPRequest() {
    const amount = parseInt(document.getElementById('gpAmount').value);
    const btn = document.getElementById('addGPBtn');
    
    if (isNaN(amount) || amount <= 0 || selectedFiles.length === 0) {
        alert("Please enter amount and add at least 1 screenshot!");
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
            amount: amount,
            status: 'pending',
            timestamp: Date.now()
        });

        const formData = new FormData();
        const sharedUrl = "https://corleonecity.github.io/SwordArtOnline/";

        let embeds = [{
            title: "💎 GP Donation Request",
            url: sharedUrl,
            color: 0xcd7f32,
            fields: [
                { name: "💬 Discord", value: `**Display:** ${dName}\n**User:** @${dUser}\n**Ping:** <@${dId}>`, inline: true },
                { name: "🎮 Roblox", value: `**Display:** ${rName}\n**User:** @${rUser}\n**Profile:** [Click Here](https://www.roblox.com/users/${rId}/profile)`, inline: true },
                { name: "📋 Details", value: `**Amount:** +${amount.toLocaleString()} GP\n**Status:** ⏳ Pending (Admin Review)`, inline: false }
            ],
            image: { url: "attachment://image0.png" },
            timestamp: new Date().toISOString()
        }];

        for (let i = 1; i < selectedFiles.length; i++) {
            embeds.push({
                url: sharedUrl,
                image: { url: `attachment://image${i}.png` }
            });
        }

        formData.append('payload_json', JSON.stringify({
            content: `<@&1503609455466643547>\nA new GP donation has been submitted for review! 🎉`,
            embeds: embeds
        }));

        selectedFiles.forEach((file, index) => {
            formData.append(`file${index}`, file, `image${index}.png`);
        });

        const webRes = await fetch(`${BACKEND_URL}/log-request`, {
            method: 'POST',
            body: formData
        });
        
        if (!webRes.ok) {
            alert("Error Server!");
        } else {
            showNotify(`Request submitted!`, "success");
        }

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
// 7. ADMIN FUNKTIONEN
// ==========================================

function loadAdminData() {
    onValue(ref(db, 'requests'), (snapshot) => {
        const data = snapshot.val();
        const body = document.getElementById('adminPendingBody');
        body.innerHTML = '';
        if (!data) return;
        
        const pendingRequests = Object.values(data)
            .filter(r => r.status === 'pending')
            .sort((a, b) => a.timestamp - b.timestamp);
        
        pendingRequests.forEach(req => {
            body.innerHTML += `
                <tr>
                    <td>
                        <div class="user-name-cell">
                            <span class="display-name">${req.discordName}</span>
                            <span class="username-handle">@${req.discordUsername || "Unknown"}</span>
                        </div>
                    </td>
                    <td>
                        <div class="user-name-cell">
                            <span class="display-name">${req.robloxName}</span>
                            <span class="username-handle">@${req.robloxUsername || "Unknown"}</span>
                        </div>
                    </td>
                    <td style="color:#cd7f32; font-weight:bold;">+${req.amount.toLocaleString()}</td>
                    <td>
                        <button onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'approve', '${req.dbKey || req.discordUsername}')" class="btn-small btn-approve"><i class="fas fa-check"></i></button>
                        <button onclick="window.handleAdminAction('${req.id}', '${req.userId}', ${req.amount}, 'reject', '${req.dbKey || req.discordUsername}')" class="btn-small btn-deny"><i class="fas fa-times"></i></button>
                    </td>
                </tr>
            `;
        });
    });
}

window.handleAdminAction = async (reqId, userId, amount, action, passedDbKey) => {
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
        let robloxId = "";
        const userRef = ref(db, `users/${dbKey}`);
        const snap = await get(userRef);

        if (snap.exists()) {
            newTotal = snap.val().totalGP || 0;
            robloxId = snap.val().robloxId || "1";
            if (action === 'approve') {
                newTotal += amount;
                await update(userRef, { totalGP: newTotal });
            }
        }

        const allUsersSnap = await get(ref(db, 'users'));
        let rank = "?";
        if (allUsersSnap.exists()) {
            const sorted = Object.values(allUsersSnap.val()).sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0));
            rank = sorted.findIndex(u => u.id === userId) + 1;
        }

        const statusText = action === 'approve' ? 'Approved ✅' : 'Rejected ❌';
        const embedColor = action === 'approve' ? 0x48bb78 : 0xf56565;

        const dName = reqData.discordName || "Unknown";
        const dUser = reqData.discordUsername || "Unknown";
        const rName = reqData.robloxName || "Unknown";
        const rUser = reqData.robloxUsername || "Unknown";

        const payload = {
            content: `<@${userId}> has had a GP donation ${action === 'approve' ? 'approved' : 'rejected'}!`,
            embeds: [{
                title: "💎 GP Donation Processed",
                url: "https://corleonecity.github.io/SwordArtOnline/",
                color: embedColor,
                fields: [
                    { name: "💬 Discord", value: `**Display:** ${dName}\n**User:** @${dUser}\n**Ping:** <@${userId}>`, inline: true },
                    { name: "🎮 Roblox", value: `**Display:** ${rName}\n**User:** @${rUser}\n**Profile:** [Click Here](https://www.roblox.com/users/${robloxId}/profile)`, inline: true },
                    { name: "📋 Details", value: `**Amount:** ${amount.toLocaleString()} GP\n**Status:** ${statusText}\n**Rank:** #${rank}`, inline: false },
                    { name: "🛡️ Processed By", value: `<@${currentUser.id}>`, inline: false }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        const webRes = await fetch(`${BACKEND_URL}/log-processed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!webRes.ok) {
            alert("Server Error!");
        } else {
            showNotify(`Request processed!`, "success");
        }
        
    } catch (e) {
        alert("Error: " + e.message);
    }
};

// ==========================================
// 8. EVENT LISTENER & INITIALISIERUNG
// ==========================================

// Event Listener für Buttons
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
    if (selectedFiles.length + newFiles.length > 10) {
        alert("Max 10 screenshots allowed!");
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
            showNotify(`Deducted GP!`, "success");
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
        showNotify(`User reset!`, "success");
    } catch (e) {
        alert("Error!");
    }
});

document.getElementById('tabBtnSpenden')?.addEventListener('click', () => switchTab('Spenden'));
document.getElementById('tabBtnLeaderboard')?.addEventListener('click', () => switchTab('Leaderboard'));
document.getElementById('tabBtnProfile')?.addEventListener('click', () => switchTab('Profile'));
document.getElementById('tabBtnAdmin')?.addEventListener('click', () => switchTab('Admin'));

// ==========================================
// 9. APP START (AUTH CHECK)
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
