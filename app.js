// ==========================================
// 1. SETTINGS & CONFIGURATION
// ==========================================

const OWNER_USER_ID = '917426398120005653';

// Roles for access control - stored in Firebase
let ADMIN_ROLES = ['1503609455466643547'];
let OWNER_ROLES = ['1504646932243546152'];

// System Roles (können im Owner Panel konfiguriert werden)
let SYSTEM_ROLES = {
    regRole: '1503217692843180083',
    unregRole: '1503218754643820624',
    gpSubmitRole: '1503193408280330400',
    pendingRole: '1503265048162996385'
};

// GP Submit Role (wird aus SYSTEM_ROLES.gpSubmitRole gesetzt)
let GP_SUBMIT_ROLE = SYSTEM_ROLES.gpSubmitRole;

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
    musicUrl: 'https://raw.githubusercontent.com/CorleoneCity/SwordArtOnline/main/Sword%20Art%20Online%20-%20Main%20Theme%20-%20Swordland.mp3'
};

// Application state
let currentUser = null;
let currentTab = 'dashboard';
let allUsersData = {};
let allRequestsData = {};
let channelConfigData = {};
let audioPlayer = null;
let testModeEnabled = false;

// OAuth State
const REDIRECT_URI = window.location.origin + window.location.pathname;
const DISCORD_CLIENT_ID = '1342617711477264426'; 
const ROBLOX_CLIENT_ID = '4410186987179093850';

const DISCORD_AUTH_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=identify+guilds+email&state=discord`;
const ROBLOX_AUTH_URL = `https://arrow-roblox-oauth.pages.dev/?client_id=${ROBLOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=roblox`;

const WORKER_URL = ''; // Leerlassen, wenn auf derselben Domain oder setze deine Worker URL

// ==========================================
// 2. BACKEND API & FIREBASE FETCHERS
// ==========================================

async function apiFetch(path, options = {}) {
    const url = WORKER_URL ? `${WORKER_URL}${path}` : path;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    if (!response.ok) {
        const txt = await response.text();
        throw new Error(`API Error ${response.status}: ${txt}`);
    }
    return response.json();
}

async function getFirebaseUrl() {
    try {
        const res = await fetch('/config/firebaseUrl.json');
        if (res.ok) {
            const data = await res.json();
            if (data && data.url) return data.url;
        }
    } catch(e) {}
    
    // Fallback falls Worker-Route nicht direkt verfügbar
    const res = await fetch('/config/channels.json');
    if (res.ok) {
        // can imply context
    }
    return ""; // Wird dynamisch vom Worker über Routen gehandelt, wir greifen über relative Pfade zu
}

// Direkter Firebase-Lesezugriff via Worker-Proxy (bzw relative Pfade, falls konfiguriert)
async function fetchFirebase(path, options = {}) {
    // Da wir sensible Daten nicht direkt per Firebase-URL im Client exponieren wollen,
    // nutzen wir den Worker als Proxy oder fragen vordefinierte endpoints an.
    // Für dieses Setup nehmen wir an, dass der Worker Anfragen spiegelt oder wir URLs im Worker halten.
    // Da wir im Originalskript direkt auf Realtime DB zugreifen wollten, simulieren wir den sicheren Pfad:
    const res = await fetch(`/api/db?path=${encodeURIComponent(path)}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    if (!res.ok) return null;
    return res.json();
}

// ==========================================
// 3. AUDIO PLAYER
// ==========================================

function playLoginMusic() {
    const container = document.getElementById('audioPlayerContainer');
    if (!container) return;
    
    container.innerHTML = `
        <audio id="bgMusic" loop>
            <source src="${systemConfig.musicUrl}" type="audio/mpeg">
        </audio>
        <div id="musicToggle" class="music-card-toggle">
            <i class="fas fa-music"></i>
            <span>Play Soundtrack</span>
        </div>
    `;
    
    const audio = document.getElementById('bgMusic');
    const toggle = document.getElementById('musicToggle');
    
    if (!audio || !toggle) return;
    audio.volume = 0.2;
    
    toggle.addEventListener('click', () => {
        if (audio.paused) {
            audio.play().then(() => {
                toggle.classList.add('playing');
                toggle.innerHTML = `<i class="fas fa-pause"></i> <span>Pause Soundtrack</span>`;
            }).catch(err => console.log("Audio play blocked", err));
        } else {
            audio.pause();
            toggle.classList.remove('playing');
            toggle.innerHTML = `<i class="fas fa-music"></i> <span>Play Soundtrack</span>`;
        }
    });
}

function stopLoginMusic() {
    const audio = document.getElementById('bgMusic');
    if (audio) {
        audio.pause();
    }
    const container = document.getElementById('audioPlayerContainer');
    if (container) container.innerHTML = '';
}

// ==========================================
// 4. AUTHENTICATION & LOGIN FLOW
// ==========================================

async function handleDiscordLogin(code) {
    showLoading(true, "Authenticating with Discord...");
    try {
        const data = await apiFetch('/token', {
            method: 'POST',
            body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
        });

        if (!data.isAuthorized) {
            showNotification("❌ Discord authorization failed.", "error");
            showLoading(false);
            playLoginMusic();
            return;
        }

        if (!data.isMember) {
            showNotification("❌ You are not a member of the required Discord Server!", "error");
            showLoading(false);
            playLoginMusic();
            return;
        }

        const user = data.user;
        const dbKey = `user_${user.id}`;

        // 1. Benutzerdaten vorbereiten
        currentUser = {
            id: user.id,
            discordName: user.global_name || user.username,
            discordUsername: user.username,
            avatar: user.avatar,
            email: user.email || "",
            totalGP: 0,
            robloxLinked: false,
            robloxId: null,
            robloxName: null,
            robloxUsername: null
        };

        // 2. Vorhandenen User aus Firebase laden, um GP & Roblox-Daten nicht zu überschreiben
        try {
            const existingRes = await fetch(`/api/db?path=users/${dbKey}`);
            if (existingRes.ok) {
                const existingData = await existingRes.json();
                if (existingData) {
                    currentUser = { ...currentUser, ...existingData };
                }
            }
        } catch (e) { console.error("Error fetching existing user:", e); }

        // 3. ZUERST IN DER DATENBANK SPEICHERN (Damit /check-member weiß, dass er registriert ist!)
        try {
            await fetch(`/api/db?path=users/${dbKey}`, {
                method: 'PUT',
                body: JSON.stringify(currentUser)
            });
        } catch (e) { console.error("Error saving user to DB:", e); }

        // 4. JETZT DIE ROLLEN ANPASSEN (Führt dazu, dass er die Registered-Rolle bekommt!)
        try {
            await apiFetch('/check-member', {
                method: 'POST',
                body: JSON.stringify({ userId: user.id, updateRoles: true })
            });
        } catch (e) { console.error("Error updating member roles:", e); }

        // Session speichern und weitergehen
        sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
        window.history.replaceState({}, document.title, window.location.pathname);
        
        stopLoginMusic();
        checkRobloxLink();

    } catch (error) {
        console.error(error);
        showNotification("❌ Login Error: " + error.message, "error");
        showLoading(false);
        playLoginMusic();
    }
}

async function handleRobloxLogin(code) {
    showLoading(true, "Linking Roblox Account...");
    try {
        const savedSession = sessionStorage.getItem('pn_session');
        if (!savedSession) {
            showNotification("❌ Session expired. Please login to Discord again.", "error");
            window.location.href = window.location.pathname;
            return;
        }
        
        currentUser = JSON.parse(savedSession);
        
        const data = await apiFetch('/roblox-token', {
            method: 'POST',
            body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
        });

        if (!data.success || !data.robloxUser) {
            showNotification("❌ Roblox authentication failed: " + (data.error || "Unknown error"), "error");
            showLoading(false);
            checkRobloxLink();
            return;
        }

        const rUser = data.robloxUser;
        
        currentUser.robloxLinked = true;
        currentUser.robloxId = String(rUser.sub);
        currentUser.robloxName = rUser.displayName || rUser.name;
        currentUser.robloxUsername = rUser.name;

        const dbKey = `user_${currentUser.id}`;
        await fetch(`/api/db?path=users/${dbKey}`, {
            method: 'PATCH',
            body: JSON.stringify({
                robloxLinked: true,
                robloxId: currentUser.robloxId,
                robloxName: currentUser.robloxName,
                robloxUsername: currentUser.robloxUsername
            })
        });

        // Update Nickname on Discord Server
        try {
            const guildIdData = await (await fetch('/api/db?path=config/guildId')).json();
            const guildId = guildIdData?.id || '';
            if (guildId) {
                const newNick = `[SAO] ${currentUser.robloxName}`;
                await apiFetch('/update-nickname', {
                    method: 'POST',
                    body: JSON.stringify({ userId: currentUser.id, nickname: newNick, guildId })
                });
            }
        } catch(nickErr) {
            console.error("Failed to update Discord nickname:", nickErr);
        }

        sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
        window.history.replaceState({}, document.title, window.location.pathname);
        
        showNotification("✅ Roblox Account successfully linked!", "success");
        checkRobloxLink();

    } catch (error) {
        console.error(error);
        showNotification("❌ Roblox Link Error: " + error.message, "error");
        showLoading(false);
        checkRobloxLink();
    }
}

function checkRobloxLink() {
    if (!currentUser) {
        showPage('loginPage');
        return;
    }

    if (!currentUser.robloxLinked) {
        showPage('robloxLinkPage');
        document.getElementById('discordUserTag').textContent = `@${currentUser.discordUsername}`;
    } else {
        loadDashboard();
    }
}

function logout() {
    sessionStorage.removeItem('pn_session');
    currentUser = null;
    showPage('loginPage');
    playLoginMusic();
    showNotification("ℹ️ Logged out successfully.", "info");
}

// ==========================================
// 5. NAVIGATION & PAGES
// ==========================================

function showPage(pageId) {
    const pages = ['loginPage', 'robloxLinkPage', 'mainPanelPage', 'loadingPage'];
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    const target = document.getElementById(pageId);
    if (target) target.classList.remove('hidden');
}

function showLoading(show, message = "Loading...") {
    if (show) {
        showPage('loadingPage');
        document.getElementById('loadingMessage').textContent = message;
    }
}

function switchTab(tabId) {
    currentTab = tabId;
    
    // Update nav buttons
    const tabs = ['dashboard', 'leaderboard', 'request', 'history', 'admin', 'owner'];
    tabs.forEach(t => {
        const btn = document.getElementById(`nav-${t}`);
        const content = document.getElementById(`content-${t}`);
        if (btn) btn.classList.remove('active');
        if (content) content.classList.add('hidden');
    });

    const activeBtn = document.getElementById(`nav-${tabId}`);
    const activeContent = document.getElementById(`content-${tabId}`);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.remove('hidden');

    // Trigger tab specific loads
    if (tabId === 'dashboard') refreshDashboardData();
    if (tabId === 'leaderboard') renderLeaderboard();
    if (tabId === 'history') renderHistory();
    if (tabId === 'admin') renderAdminPanel();
    if (tabId === 'owner') renderOwnerPanel();
}

// ==========================================
// 6. DASHBOARD & REFRESH LOGIC
// ==========================================

async function loadDashboard() {
    showPage('mainPanelPage');
    
    // Set Sidebar Profile Info
    document.getElementById('userAvatar').src = currentUser.avatar 
        ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
    document.getElementById('userProfileName').textContent = currentUser.discordName;
    document.getElementById('userProfileRole').textContent = `@${currentUser.discordUsername}`;
    
    // Hide tabs initially based on roles
    document.getElementById('nav-admin').classList.add('hidden');
    document.getElementById('nav-owner').classList.add('hidden');

    await fetchMaintenanceAndTestModeSettings();
    await checkAccessPermissions();
    switchTab('dashboard');
}

async function fetchMaintenanceAndTestModeSettings() {
    try {
        const maintRes = await fetch('/api/db?path=config/maintenance');
        if (maintRes.ok) {
            const mData = await maintRes.json();
            const overlay = document.getElementById('maintenanceOverlay');
            if (mData?.enabled === true && currentUser.id !== OWNER_USER_ID) {
                if (overlay) overlay.classList.remove('hidden');
            } else {
                if (overlay) overlay.classList.add('hidden');
            }
            
            // UI States inside Owner panel
            const statusText = document.getElementById('maintenanceStatusText');
            if (statusText) {
                statusText.textContent = mData?.enabled ? "Enabled" : "Disabled";
                statusText.style.color = mData?.enabled ? "#f56565" : "#48bb78";
            }
        }
        
        const testModeRes = await fetch('/api/db?path=config/testMode');
        if (testModeRes.ok) {
            const tData = await testModeRes.json();
            testModeEnabled = tData?.enabled === true;
            const indicator = document.getElementById('testModeIndicator');
            if (indicator) {
                if (testModeEnabled) indicator.classList.remove('hidden');
                else indicator.classList.add('hidden');
            }
            const testStatusText = document.getElementById('testModeStatusText');
            if (testStatusText) {
                testStatusText.textContent = testModeEnabled ? "Enabled" : "Disabled";
                testStatusText.style.color = testModeEnabled ? "#f56565" : "#48bb78";
            }
        }
    } catch(e) {}
}

async function checkAccessPermissions() {
    try {
        // Dynamic Role Check via Discord Bot API / Worker
        const roleData = await apiFetch('/user-roles', {
            method: 'POST',
            body: JSON.stringify({ userId: currentUser.id })
        });

        let userRoles = roleData.roles || [];
        
        // Fetch Admin Roles from Firebase Config
        const configAdminRes = await fetch('/api/db?path=config/admin_roles');
        if (configAdminRes.ok) {
            const data = await configAdminRes.json();
            if (data && data.adminRoles) ADMIN_ROLES = data.adminRoles;
            if (data && data.ownerRoles) OWNER_ROLES = data.ownerRoles;
        }

        const isOwner = (currentUser.id === OWNER_USER_ID) || userRoles.some(r => OWNER_ROLES.includes(r));
        const isAdmin = isOwner || userRoles.some(r => ADMIN_ROLES.includes(r));

        if (isAdmin) document.getElementById('nav-admin').classList.remove('hidden');
        if (isOwner) document.getElementById('nav-owner').classList.remove('hidden');

    } catch (e) {
        console.error("Error validation permissions:", e);
        if (currentUser.id === OWNER_USER_ID) {
            document.getElementById('nav-admin').classList.remove('hidden');
            document.getElementById('nav-owner').classList.remove('hidden');
        }
    }
}

async function refreshDashboardData() {
    try {
        const dbKey = `user_${currentUser.id}`;
        const userRes = await fetch(`/api/db?path=users/${dbKey}`);
        if (userRes.ok) {
            const uData = await userRes.json();
            if (uData) {
                currentUser.totalGP = uData.totalGP || 0;
                sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
            }
        }

        // Render Stats
        document.getElementById('statTotalGP').textContent = currentUser.totalGP.toLocaleString();
        document.getElementById('dashRobloxUsername').textContent = currentUser.robloxUsername;
        document.getElementById('dashRobloxId').textContent = currentUser.robloxId;
        
        // Calculate Rank
        const allUsersRes = await fetch('/api/db?path=users');
        if (allUsersRes.ok) {
            allUsersData = await allUsersRes.json() || {};
            const sorted = Object.values(allUsersData).filter(u => u.totalGP > 0).sort((a,b) => b.totalGP - a.totalGP);
            const index = sorted.findIndex(u => u.id === currentUser.id);
            document.getElementById('statRank').textContent = index !== -1 ? `#${index + 1}` : "Unranked";
        }

        // Load recent requests
        const reqRes = await fetch('/api/db?path=requests');
        if (reqRes.ok) {
            allRequestsData = await reqRes.json() || {};
            renderRecentRequests();
        }

    } catch (e) {
        showNotification("⚠️ Error syncing dashboard: " + e.message, "error");
    }
}

function renderRecentRequests() {
    const container = document.getElementById('recentRequestsContainer');
    container.innerHTML = '';

    const myRequests = Object.values(allRequestsData)
        .filter(r => r.userId === currentUser.id)
        .sort((a,b) => b.createdAt - a.createdAt)
        .slice(0, 5);

    if (myRequests.length === 0) {
        container.innerHTML = `<div style="color: #666; text-align: center; padding: 20px;">No recent donation requests found.</div>`;
        return;
    }

    myRequests.forEach(r => {
        let statusClass = r.status === 'approved' ? 'status-approved' : r.status === 'rejected' ? 'status-rejected' : 'status-pending';
        let statusText = r.status.toUpperCase();

        const div = document.createElement('div');
        div.className = 'recent-request-item';
        div.innerHTML = `
            <div>
                <div style="font-weight:600; color:#fff;">+${r.amount.toLocaleString()} GP</div>
                <div style="font-size:12px; color:#666;">${new Date(r.createdAt).toLocaleString()}</div>
                ${r.adminComment ? `<div style="font-size:12px; color:#ffd700; margin-top:4px;">💬 ${r.adminComment}</div>` : ''}
            </div>
            <span class="status-badge ${statusClass}">${statusText}</span>
        `;
        container.appendChild(div);
    });
}

// ==========================================
// 7. LEADERBOARD TAB
// ==========================================

function renderLeaderboard() {
    const tbody = document.getElementById('leaderboardTableBody');
    tbody.innerHTML = '';

    const sorted = Object.values(allUsersData)
        .filter(u => u.totalGP > 0)
        .sort((a,b) => b.totalGP - a.totalGP);

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#666;">No players on the leaderboard yet.</td></tr>`;
        return;
    }

    sorted.forEach((u, index) => {
        let crown = index === 0 ? "👑 " : "";
        let rowClass = u.id === currentUser.id ? 'style="background: rgba(88,101,242,0.1); font-weight:600;"' : '';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td class="user-name-cell">
                <img src="${u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="avatar-small">
                <div>
                    <div class="display-name">${crown}${u.discordName}</div>
                    <div class="username-handle">@${u.discordUsername}</div>
                </div>
            </td>
            <td>${u.robloxUsername || 'Not Linked'}</td>
            <td style="color: #ffd700; font-weight:700;">${u.totalGP.toLocaleString()} GP</td>
        `;
        if (rowClass) tr.setAttribute('style', 'background: rgba(88,101,242,0.1);');
        tbody.appendChild(tr);
    });
}

// ==========================================
// 8. REQUEST SUBMISSION (WITH MULTI-IMAGES)
// ==========================================

let selectedFilesArray = [];

function handleFileSelection(e) {
    const files = Array.from(e.target.files);
    const previewContainer = document.getElementById('imagePreviewsContainer');
    
    if (selectedFilesArray.length + files.length > systemConfig.limits.maxImagesPerRequest) {
        showNotification(`❌ You can only upload a maximum of ${systemConfig.limits.maxImagesPerRequest} images per request!`, "error");
        return;
    }

    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        selectedFilesArray.push(file);

        const reader = new FileReader();
        reader.onload = function(event) {
            const div = document.createElement('div');
            div.className = 'image-preview-item';
            div.innerHTML = `
                <img src="${event.target.result}">
                <div class="remove-btn"><i class="fas fa-times"></i></div>
            `;
            div.querySelector('.remove-btn').addEventListener('click', () => {
                selectedFilesArray = selectedFilesArray.filter(f => f !== file);
                div.remove();
            });
            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
    e.target.value = ''; // Reset input
}

async function submitGPRequest(e) {
    e.preventDefault();
    
    // Dynamic Validation Check against required role
    try {
        const roleData = await apiFetch('/user-roles', { method: 'POST', body: JSON.stringify({ userId: currentUser.id }) });
        const userRoles = roleData.roles || [];
        
        // Fetch current system configuration for dynamic roles
        const systemRolesSnap = await fetch('/api/db?path=config/system_roles');
        if (systemRolesSnap.ok) {
            const data = await systemRolesSnap.snap();
            if (data) SYSTEM_ROLES = data;
        }

        if (!userRoles.includes(SYSTEM_ROLES.gpSubmitRole)) {
            showNotification("❌ Access Denied: You do not possess the required Guild Role to submit GP requests!", "error");
            return;
        }
    } catch(err) {
        showNotification("❌ Verification Failed: Unable to verify your current Discord roles.", "error");
        return;
    }

    const amountInput = document.getElementById('requestAmount');
    const amount = parseInt(amountInput.value);

    if (isNaN(amount) || amount <= 0) {
        showNotification("❌ Please enter a valid positive number for GP amount.", "error");
        return;
    }

    if (selectedFilesArray.length === 0) {
        showNotification("❌ You must upload at least one image as proof of payment!", "error");
        return;
    }

    const submitBtn = document.getElementById('submitRequestBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`;

    try {
        const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const dbKey = `user_${currentUser.id}`;

        // Prepare fields for Embed
        const embedFields = [
            { name: "💬 Discord", value: `**Name:** ${currentUser.discordName}\n**Tag:** @${currentUser.discordUsername}\n**Ping:** <@${currentUser.id}>`, inline: true },
            { name: "🎮 Roblox", value: `**Name:** ${currentUser.robloxName}\n**User:** @${currentUser.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${currentUser.robloxId}/profile)`, inline: true },
            { name: "💰 Amount", value: `**+${amount.toLocaleString()} GP**`, inline: false },
            { name: "📊 Status", value: "⏳ PENDING APPROVAL", inline: true }
        ];

        const discordPayload = {
            content: `📢 **New GP Donation Request** from <@${currentUser.id}>`,
            embeds: [{
                title: "💎 GP Donation Request",
                url: "https://corleonecity.github.io/SwordArtOnline/",
                color: parseInt(systemConfig.embedColors.pending.replace('#', ''), 16),
                fields: embedFields,
                timestamp: new Date().toISOString(),
                footer: { text: "SwordArtOnline GP System" },
                image: { url: `attachment://proof_1.png` }
            }],
            components: [{
                type: 1,
                components: [
                    { type: 2, custom_id: `approve_${reqId}`, label: "Approve", style: 3, emoji: { name: "✅" } },
                    { type: 2, custom_id: `reject_${reqId}`, label: "Reject", style: 4, emoji: { name: "❌" } }
                ]
            }]
        };

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify(discordPayload));
        selectedFilesArray.forEach((file, index) => {
            formData.append(`file${index}`, file);
        });

        // Send to Discord via Worker Endpoint
        const resData = await apiFetch('/send-gp-request-with-buttons', {
            method: 'POST',
            body: formData,
            headers: {} // Let browser set Content-Type for FormData
        });

        if (!resData.success || !resData.messageId) {
            throw new Error(resData.error || "Failed to deliver message to Discord.");
        }

        // Save entry into Firebase Requests object
        const requestObject = {
            id: reqId,
            discordMessageId: resData.messageId,
            userId: currentUser.id,
            discordName: currentUser.discordName,
            discordUsername: currentUser.discordUsername,
            dbKey: dbKey,
            robloxId: currentUser.robloxId,
            robloxName: currentUser.robloxName,
            robloxUsername: currentUser.robloxUsername,
            amount: amount,
            status: 'pending',
            createdAt: Date.now(),
            processedAt: null,
            processedBy: null,
            adminComment: null
        };

        await fetch(`/api/db?path=requests/${reqId}`, {
            method: 'PUT',
            body: JSON.stringify(requestObject)
        });

        showNotification("✅ Donation request submitted successfully to staff!", "success");
        amountInput.value = '';
        selectedFilesArray = [];
        document.getElementById('imagePreviewsContainer').innerHTML = '';
        switchTab('dashboard');

    } catch (e) {
        console.error(e);
        showNotification("❌ Submission Error: " + e.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Submit Request`;
    }
}

// ==========================================
// 9. HISTORY TAB
// ==========================================

function renderHistory() {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';

    const myRequests = Object.values(allRequestsData)
        .filter(r => r.userId === currentUser.id)
        .sort((a,b) => b.createdAt - a.createdAt);

    if (myRequests.length === 0) {
        container.innerHTML = `<div class="system-card" style="text-align:center; color:#666; padding:30px;">You haven't submitted any donation requests yet.</div>`;
        return;
    }

    myRequests.forEach(r => {
        let cardBorderColor = r.status === 'approved' ? systemConfig.embedColors.approve : r.status === 'rejected' ? systemConfig.embedColors.reject : '#cd7f32';
        
        const card = document.createElement('div');
        card.className = 'system-card dynamic-request-card';
        card.style.borderColor = cardBorderColor;
        
        card.innerHTML = `
            <div class="request-card-header">
                <div>
                    <span style="font-size: 20px; font-weight:700; color:#fff;">+${r.amount.toLocaleString()} GP</span>
                    <div style="font-size:12px; color:#666; margin-top:2px;">ID: ${r.id}</div>
                </div>
                <span class="status-badge ${r.status === 'approved' ? 'status-approved' : r.status === 'rejected' ? 'status-rejected' : 'status-pending'}">${r.status.toUpperCase()}</span>
            </div>
            <div class="request-card-body" style="margin-top:15px; font-size:14px; color:#aaa; display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div><strong>Created:</strong> ${new Date(r.createdAt).toLocaleString()}</div>
                <div><strong>Processed:</strong> ${r.processedAt ? new Date(r.processedAt).toLocaleString() : 'Pending'}</div>
                ${r.processedByName ? `<div style="grid-column: span 2;"><strong>Admin:</strong> ${r.processedByName}</div>` : ''}
                ${r.adminComment ? `<div style="grid-column: span 2; color:#ffd700; background:rgba(255,215,0,0.05); padding:10px; border-radius:8px; margin-top:5px; border:1px dashed #ffd700;"><strong>Comment:</strong> ${r.adminComment}</div>` : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// 10. ADMIN PANEL TAB
// ==========================================

async function renderAdminPanel() {
    const listContainer = document.getElementById('pendingRequestsList');
    listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#888;"><i class="fas fa-spinner fa-spin"></i> Refreshing logs...</div>`;
    
    try {
        const reqRes = await fetch('/api/db?path=requests');
        if (reqRes.ok) allRequestsData = await reqRes.json() || {};
        
        const usersRes = await fetch('/api/db?path=users');
        if (usersRes.ok) allUsersData = await usersRes.json() || {};
    } catch(e) {}

    listContainer.innerHTML = '';
    const pendingList = Object.values(allRequestsData).filter(r => r.status === 'pending').sort((a,b) => a.createdAt - b.createdAt);

    if (pendingList.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding:30px; color:#666;">No pending donation requests inside DB. All clean!</div>`;
        return;
    }

    pendingList.forEach(r => {
        const card = document.createElement('div');
        card.className = 'admin-request-card';
        card.innerHTML = `
            <div class="admin-request-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:18px; font-weight:700; color:#ffd700;">+${r.amount.toLocaleString()} GP</span>
                    <span style="color:#666; font-size:12px;">| @${r.discordUsername}</span>
                </div>
                <div style="font-size:12px; color:#888;">${new Date(r.createdAt).toLocaleString()}</div>
            </div>
            <div style="margin: 12px 0; font-size:13px; color:#aaa; display:grid; grid-template-columns:1fr 1fr; gap:5px;">
                <div><strong>Discord ID:</strong> ${r.userId}</div>
                <div><strong>Roblox User:</strong> ${r.robloxUsername}</div>
                <div style="grid-column:span 2;"><strong>Roblox Profile:</strong> <a href="https://www.roblox.com/users/${r.robloxId}/profile" target="_blank" style="color:#5865F2;">View Profile</a></div>
            </div>
            <div style="margin-bottom:12px;">
                <input type="text" id="comment_${r.id}" class="form-control" placeholder="Add optional admin comment/reason..." style="padding:8px; font-size:13px; background:#0f0f0f;">
            </div>
            <div class="admin-action-buttons">
                <button onclick="processRequestDirectly('${r.id}', 'approve')" class="btn-primary" style="background:#48bb78; color:white; padding:8px 15px;"><i class="fas fa-check"></i> Approve</button>
                <button onclick="processRequestDirectly('${r.id}', 'reject')" class="btn-primary" style="background:#f56565; color:white; padding:8px 15px;"><i class="fas fa-times"></i> Reject</button>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

async function processRequestDirectly(reqId, action) {
    const commentInput = document.getElementById(`comment_${reqId}`);
    const comment = commentInput ? commentInput.value : "";
    
    showLoading(true, `${action === 'approve' ? 'Approving' : 'Rejecting'} donation request...`);
    
    try {
        const reqData = allRequestsData[reqId];
        if (!reqData) throw new Error("Request local cache missing.");

        if (testModeEnabled) {
            // TEST MODE FLOW - SIMULATED BALANCES
            await fetch(`/api/db?path=requests/${reqId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    status: action === 'approve' ? 'approved' : 'rejected',
                    adminComment: comment + " (SIMULATED / TEST MODE)",
                    processedAt: Date.now(),
                    processedBy: currentUser.id,
                    processedByName: currentUser.discordName
                })
            });
            
            // Trigger Embed Update on Discord via Worker
            await apiFetch('/update-gp-message', {
                method: 'POST',
                body: JSON.stringify({ requestId: reqId, adminId: currentUser.id, adminName: currentUser.discordName })
            });

            showNotification(`🧪 Test Mode Action completed: Request was ${action}d without adding real GP.`, "info");
            await renderAdminPanel();
            showLoading(false);
            return;
        }

        // REAL PRODUCTION FLOW
        // Update operational request state in Firebase
        await fetch(`/api/db?path=requests/${reqId}`, {
            method: 'PATCH',
            body: JSON.stringify({
                status: action === 'approve' ? 'approved' : 'rejected',
                adminComment: comment,
                processedAt: Date.now(),
                processedBy: currentUser.id,
                processedByName: currentUser.discordName
            })
        });

        if (action === 'approve') {
            // Get user total
            const userRes = await fetch(`/api/db?path=users/${reqData.dbKey}`);
            const userData = await userRes.json();
            const currentTotal = userData?.totalGP || 0;
            const newTotal = currentTotal + reqData.amount;
            
            // Write update to Realtime database
            await fetch(`/api/db?path=users/${reqData.dbKey}`, {
                method: 'PATCH',
                body: JSON.stringify({ totalGP: newTotal })
            });
        }

        // Trigger Embed Update on Discord via Worker Interaction endpoint
        await apiFetch('/update-gp-message', {
            method: 'POST',
            body: JSON.stringify({ requestId: reqId, adminId: currentUser.id, adminName: currentUser.discordName })
        });

        showNotification(`✅ Request processed successfully: State declared as ${action}.`, "success");
        await renderAdminPanel();

    } catch (e) {
        showNotification("❌ Action Error: " + e.message, "error");
    } finally {
        showLoading(false);
    }
}
window.processRequestDirectly = processRequestDirectly; // Expose globally

// ==========================================
// 11. OWNER PANEL TAB
// ==========================================

async function renderOwnerPanel() {
    // Load current config variables
    try {
        const configRes = await fetch('/api/db?path=config/channels');
        if (configRes.ok) channelConfigData = await configRes.json() || {};
        
        const guildIdData = await (await fetch('/api/db?path=config/guildId')).json();
        document.getElementById('confGuildId').value = guildIdData?.id || '';
        
        const adminRolesData = await (await fetch('/api/db?path=config/admin_roles')).json();
        document.getElementById('confAdminRoles').value = adminRolesData?.adminRoles ? adminRolesData.adminRoles.join(', ') : '';
        document.getElementById('confOwnerRoles').value = adminRolesData?.ownerRoles ? adminRolesData.ownerRoles.join(', ') : '';

        const sysRolesData = await (await fetch('/api/db?path=config/system_roles')).json();
        if (sysRolesData) {
            SYSTEM_ROLES = sysRolesData;
            GP_SUBMIT_ROLE = SYSTEM_ROLES.gpSubmitRole;
        }
        document.getElementById('confRegRole').value = SYSTEM_ROLES.regRole || '';
        document.getElementById('confUnregRole').value = SYSTEM_ROLES.unregRole || '';
        document.getElementById('confGpSubmitRole').value = SYSTEM_ROLES.gpSubmitRole || '';
        document.getElementById('confPendingRole').value = SYSTEM_ROLES.pendingRole || '';

    } catch (e) { console.error("Error reading config variables:", e); }

    const inputFields = ['CH_GP_REQUESTS', 'CH_GP_PROCESSED', 'CH_LEADERBOARD', 'CH_LEAVE_LOGS', 'CH_BOT_DM_LOGS', 'CH_USER_INFO', 'CH_PANEL_INFO', 'ticketMenuChannel', 'ticketCatMod', 'ticketCatAdmin', 'ticketTranscriptCh'];
    inputFields.forEach(field => {
        const input = document.getElementById(`conf_${field}`);
        if (input) input.value = channelConfigData[field] || '';
    });
}

async function saveChannelConfig() {
    const inputFields = ['CH_GP_REQUESTS', 'CH_GP_PROCESSED', 'CH_LEADERBOARD', 'CH_LEAVE_LOGS', 'CH_BOT_DM_LOGS', 'CH_USER_INFO', 'CH_PANEL_INFO', 'ticketMenuChannel', 'ticketCatMod', 'ticketCatAdmin', 'ticketTranscriptCh'];
    const payload = {};
    inputFields.forEach(field => {
        const input = document.getElementById(`conf_${field}`);
        if (input) payload[field] = input.value.trim();
    });

    try {
        await fetch('/api/db?path=config/channels', { method: 'PUT', body: JSON.stringify(payload) });
        showNotification("✅ System channel mapping successfully updated!", "success");
    } catch (e) { showNotification("❌ Update failed: " + e.message, "error"); }
}

async function saveGlobalConfig() {
    const gId = document.getElementById('confGuildId').value.trim();
    const adminRolesStr = document.getElementById('confAdminRoles').value.trim();
    const ownerRolesStr = document.getElementById('confOwnerRoles').value.trim();

    const aRolesArray = adminRolesStr ? adminRolesStr.split(',').map(s => s.trim()) : [];
    const oRolesArray = ownerRolesStr ? ownerRolesStr.split(',').map(s => s.trim()) : [];

    try {
        await fetch('/api/db?path=config/guildId', { method: 'PUT', body: JSON.stringify({ id: gId }) });
        await fetch('/api/db?path=config/admin_roles', { method: 'PUT', body: JSON.stringify({ adminRoles: aRolesArray, ownerRoles: oRolesArray }) });
        showNotification("✅ Global configurations pushed successfully!", "success");
    } catch(e) { showNotification("❌ Update failed: " + e.message, "error"); }
}

async function saveSystemRoles() {
    const payload = {
        regRole: document.getElementById('confRegRole').value.trim(),
        unregRole: document.getElementById('confUnregRole').value.trim(),
        gpSubmitRole: document.getElementById('confGpSubmitRole').value.trim(),
        pendingRole: document.getElementById('confPendingRole').value.trim()
    };

    try {
        await fetch('/api/db?path=config/system_roles', { method: 'PUT', body: JSON.stringify(payload) });
        SYSTEM_ROLES = payload;
        GP_SUBMIT_ROLE = SYSTEM_ROLES.gpSubmitRole;
        showNotification("✅ Discord System Access Roles updated!", "success");
    } catch(e) { showNotification("❌ Update failed: " + e.message, "error"); }
}

async function setMaintenanceMode(enabled) {
    try {
        await fetch('/api/db?path=config/maintenance', { method: 'PUT', body: JSON.stringify({ enabled, setBy: currentUser.id, setAt: Date.now() }) });
        showNotification(`🔧 Maintenance mode changed: State defined as ${enabled ? 'Enabled' : 'Disabled'}.`, "info");
        await fetchMaintenanceAndTestModeSettings();
    } catch(e) { showNotification("❌ Failed toggling setting.", "error"); }
}

async function setTestMode(enabled) {
    try {
        await fetch('/api/db?path=config/testMode', { method: 'PUT', body: JSON.stringify({ enabled, setBy: currentUser.id, setAt: Date.now() }) });
        showNotification(`🧪 Test Mode configuration updated: State defined as ${enabled ? 'Enabled' : 'Disabled'}.`, "info");
        await fetchMaintenanceAndTestModeSettings();
    } catch(e) { showNotification("❌ Failed toggling setting.", "error"); }
}

// Manual User Controls inside Owner panel
async function manualRegisterUser() {
    const dId = document.getElementById('manDiscordId').value.trim();
    const rUser = document.getElementById('manRobloxUser').value.trim();
    const rId = document.getElementById('manRobloxId').value.trim();
    const gpVal = parseInt(document.getElementById('manGPBalance').value.trim()) || 0;

    if (!dId || !rUser || !rId) {
        showNotification("❌ Discord ID, Roblox Username and Roblox ID are mandatory fields.", "error");
        return;
    }

    try {
        const dbKey = `user_${dId}`;
        const manualPayload = {
            id: dId,
            discordName: rUser + " (Manual)",
            discordUsername: rUser.toLowerCase(),
            avatar: null,
            totalGP: gpVal,
            robloxLinked: true,
            robloxId: rId,
            robloxName: rUser,
            robloxUsername: rUser
        };
        await fetch(`/api/db?path=users/${dbKey}`, { method: 'PUT', body: JSON.stringify(manualPayload) });
        showNotification(`✅ Registered User ${dId} successfully inside internal Database.`, "success");
        clearManualForm();
    } catch(e) { showNotification("❌ Query Error: " + e.message, "error"); }
}

async function manualCheckUser() {
    const dId = document.getElementById('manDiscordId').value.trim();
    if (!dId) { showNotification("❌ Enter a valid Discord User ID.", "error"); return; }
    try {
        const checkRes = await fetch(`/api/db?path=users/user_${dId}`);
        if (checkRes.ok) {
            const data = await checkRes.json();
            if (data) {
                document.getElementById('manRobloxUser').value = data.robloxUsername || '';
                document.getElementById('manRobloxId').value = data.robloxId || '';
                document.getElementById('manGPBalance').value = data.totalGP || 0;
                showNotification(`ℹ️ User found. Active Total: ${data.totalGP} GP.`, "info");
            } else { showNotification("❌ User not found inside database.", "error"); }
        }
    } catch(e) { showNotification("❌ Fetch Error.", "error"); }
}

function clearManualForm() {
    document.getElementById('manDiscordId').value = '';
    document.getElementById('manRobloxUser').value = '';
    document.getElementById('manRobloxId').value = '';
    document.getElementById('manGPBalance').value = '';
}

async function syncUserRolesManually() {
    const syncBtn = document.getElementById('syncRolesBtn');
    syncBtn.disabled = true;
    syncBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Triggering Worker Sync...`;
    try {
        const trigger = await apiFetch('/interactions', {
            method: 'POST',
            body: JSON.stringify({ type: 3, data: { custom_id: 'manual_trigger_update' }, member: { user: { id: currentUser.id } } })
        });
        showNotification("🔄 System synchronizer called: Info boards updating dynamically on server.", "success");
    } catch(e) { showNotification("❌ Execution failed.", "error"); }
    finally { syncBtn.disabled = false; syncBtn.innerHTML = `<i class="fas fa-sync"></i> Force Board Refresh`; }
}

// ==========================================
// 12. HELPER TOAST NOTIFICATIONS
// ==========================================

function showNotification(message, type = "info") {
    const box = document.getElementById('notification');
    if (!box) return;
    box.textContent = message;
    box.className = `notification show ${type}`;
    
    setTimeout(() => {
        box.className = 'notification';
    }, 4000);
}

// ==========================================
// 13. EVENT LISTENERS INITIALIZATION
// ==========================================

function initEventListeners() {
    // Auth actions
    document.getElementById('loginBtnDiscord').addEventListener('click', () => window.location.href = DISCORD_AUTH_URL);
    document.getElementById('linkRobloxBtn').addEventListener('click', () => window.location.href = ROBLOX_AUTH_URL);
    document.getElementById('btnLogout').addEventListener('click', logout);

    // Navigation Tab listeners
    const tabs = ['dashboard', 'leaderboard', 'request', 'history', 'admin', 'owner'];
    tabs.forEach(t => {
        const btn = document.getElementById(`nav-${t}`);
        if (btn) btn.addEventListener('click', () => switchTab(t));
    });

    // Request Form multi-image bindings
    const fileInput = document.getElementById('requestFile');
    if (fileInput) fileInput.addEventListener('change', handleFileSelection);
    const formElement = document.getElementById('gpRequestForm');
    if (formElement) formElement.addEventListener('submit', submitGPRequest);

    // Owner adjustments inputs
    const saveChBtn = document.getElementById('saveChannelConfigBtn');
    if (saveChBtn) saveChBtn.addEventListener('click', saveChannelConfig);
    const saveGlBtn = document.getElementById('saveGlobalConfigBtn');
    if (saveGlBtn) saveGlBtn.addEventListener('click', saveGlobalConfig);
    
    const enableMBtn = document.getElementById('enableMaintenanceBtn');
    const disableMBtn = document.getElementById('disableMaintenanceBtn');
    if (enableMBtn) enableMBtn.addEventListener('click', () => setMaintenanceMode(true));
    if (disableMBtn) disableMBtn.addEventListener('click', () => setMaintenanceMode(false));

    const enableTestModeBtn = document.getElementById('enableTestModeBtn');
    const disableTestModeBtn = document.getElementById('disableTestModeBtn');
    if (enableTestModeBtn) enableTestModeBtn.addEventListener('click', () => setTestMode(true));
    if (disableTestModeBtn) disableTestModeBtn.addEventListener('click', () => setTestMode(false));

    const saveSystemRolesBtn = document.getElementById('saveSystemRolesBtn');
    if (saveSystemRolesBtn) saveSystemRolesBtn.addEventListener('click', saveSystemRoles);
    
    const manualRegisterBtn = document.getElementById('manualRegisterBtn');
    const manualCheckUserBtn = document.getElementById('manualCheckUserBtn');
    const manualClearFormBtn = document.getElementById('manualClearFormBtn');
    const syncRolesBtn = document.getElementById('syncRolesBtn');
    
    if (manualRegisterBtn) manualRegisterBtn.addEventListener('click', manualRegisterUser);
    if (manualCheckUserBtn) manualCheckUserBtn.addEventListener('click', manualCheckUser);
    if (manualClearFormBtn) manualClearFormBtn.addEventListener('click', clearManualForm);
    if (syncRolesBtn) syncRolesBtn.addEventListener('click', syncUserRolesManually);
}

function init() {
    initEventListeners();
    
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
}

init();
// ==========================================
// 6. DASHBOARD & UI (FORTSETZUNG)
// ==========================================
function showDashboard() {
    stopMusic();
    const robloxPage = document.getElementById('robloxPage');
    const mainContent = document.getElementById('mainContent');
    const userWelcome = document.getElementById('userWelcome');
    const userAvatar = document.getElementById('userAvatar');
    
    if (robloxPage) robloxPage.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');
    
    if (currentUser) {
        if (userWelcome) userWelcome.textContent = currentUser.global_name || currentUser.username;
        if (userAvatar && currentUser.avatar) {
            userAvatar.src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
        }
    }
    
    // Live-Updates starten
    listenToUsersData();
    listenToRequests();
    loadRegisteredUsersCount();
    switchTab('Leaderboard');
}

function listenToUsersData() {
    const usersRef = ref(db, 'users');
    onValue(usersRef, (snap) => {
        allUsersData = snap.val() || {};
        updateProfileTab();
        updateLeaderboardTab();
        updateAdminTab();
        updateBotStatus();
    });
}

function listenToRequests() {
    if (!hasAdminPermission() && !hasOwnerPermission()) return;
    const reqsRef = ref(db, 'requests');
    onValue(reqsRef, (snap) => {
        const requests = snap.val() || {};
        updateAdminRequestsTable(requests);
    });
}

async function loadRegisteredUsersCount() {
    try {
        const snap = await get(ref(db, 'users'));
        const users = snap.val() || {};
        const count = Object.keys(users).length;
        const countEl = document.getElementById('registeredUsersCount');
        if (countEl) countEl.textContent = `Registered Users in Database: ${count}`;
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// 7. TAB LOGICS & CONTENT UPDATES
// ==========================================

function updateProfileTab() {
    if (!currentUser) return;
    const dbKey = getSafeDbKey(currentUser.username);
    const myData = allUsersData[dbKey] || {};
    
    const dName = document.getElementById('profileDiscordName');
    const dUser = document.getElementById('profileDiscordUsername');
    const dId = document.getElementById('profileDiscordId');
    const rName = document.getElementById('profileRobloxName');
    const rUser = document.getElementById('profileRobloxUsername');
    const rId = document.getElementById('profileRobloxId');
    const gpVal = document.getElementById('profileGpAmount');
    
    if (dName) dName.textContent = currentUser.global_name || currentUser.username;
    if (dUser) dUser.textContent = `@${currentUser.username}`;
    if (dId) dId.textContent = currentUser.id;
    
    if (rName) rName.textContent = myData.robloxName || 'Not Linked';
    if (rUser) rUser.textContent = myData.robloxUsername ? `@${myData.robloxUsername}` : 'Not Linked';
    if (rId) rId.textContent = myData.robloxId || 'Not Linked';
    
    if (gpVal) {
        const amount = myData.totalGP || 0;
        gpVal.textContent = amount.toLocaleString();
    }
}

function updateLeaderboardTab() {
    const tbody = document.getElementById('leaderboardTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const sortedUsers = Object.values(allUsersData)
        .filter(u => u.robloxUsername && u.hasLeftServer !== true)
        .sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0));
        
    if (sortedUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">No users found.</td></tr>`;
        return;
    }
    
    sortedUsers.forEach((user, index) => {
        const tr = document.createElement('tr');
        
        let medal = index + 1;
        if (index === 0) medal = '🥇';
        else if (index === 1) medal = '🥈';
        else if (index === 2) medal = '🥉';
        
        const isMe = currentUser && String(user.id) === String(currentUser.id);
        if (isMe) tr.style.background = 'rgba(255,215,0,0.05)';
        
        tr.innerHTML = `
            <td><span class="rank-badge">${medal}</span></td>
            <td>
                <div class="user-name-cell">
                    <span class="display-name">${user.robloxName || 'Unknown'}</span>
                    <span class="username-handle">@${user.robloxUsername || 'unknown'}</span>
                </div>
            </td>
            <td>
                <div class="user-name-cell">
                    <span class="display-name">${user.discordName || 'Unknown'}</span>
                    <span class="username-handle">@${user.discordUsername || 'unknown'}</span>
                </div>
            </td>
            <td><span class="gp-amount">${(user.totalGP || 0).toLocaleString()} GP</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function updateAdminTab() {
    if (!hasAdminPermission()) return;
    
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const users = Object.values(allUsersData).sort((a, b) => a.discordUsername.localeCompare(b.discordUsername));
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        if (user.hasLeftServer) tr.style.opacity = '0.5';
        
        tr.innerHTML = `
            <td>
                <div class="user-name-cell">
                    <span class="display-name">${user.discordName || 'Unknown'}</span>
                    <span class="username-handle">@${user.discordUsername || 'unknown'}</span>
                    <span class="username-handle" style="font-size:9px; color:#555;">ID: ${user.id}</span>
                </div>
            </td>
            <td>
                <div class="user-name-cell">
                    <span class="display-name">${user.robloxName || 'Unknown'}</span>
                    <span class="username-handle">@${user.robloxUsername || 'unknown'}</span>
                    <span class="username-handle" style="font-size:9px; color:#555;">ID: ${user.robloxId}</span>
                </div>
            </td>
            <td>
                <input type="number" class="table-input" id="input-gp-${getSafeDbKey(user.discordUsername)}" value="${user.totalGP || 0}">
            </td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="btn-primary btn-small btn-save" data-username="${user.discordUsername}">Save</button>
                    <button class="btn-primary btn-small btn-sync-roles" style="background:#5865F2;" data-userid="${user.id}">Sync Roles</button>
                    <button class="btn-primary btn-small btn-remove-link" style="background:#f56565;" data-username="${user.discordUsername}">Reset</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Event-Listeners für dynamische Tabellen-Buttons hinzufügen
    tbody.querySelectorAll('.btn-save').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const username = e.currentTarget.dataset.username;
            saveUserGpManually(username);
        });
    });
    
    tbody.querySelectorAll('.btn-sync-roles').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const uid = e.currentTarget.dataset.userid;
            if (!uid) return;
            e.currentTarget.disabled = true;
            try {
                const res = await fetch(`${BACKEND_URL}/sync-user-roles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: uid, executorId: currentUser.id })
                });
                const d = await res.json();
                if (d.success) showNotify("Roles synced for this user!", "success");
                else showNotify(`Error: ${d.error}`, "error");
            } catch(err) {
                showNotify("Failed to sync.", "error");
            } finally {
                e.currentTarget.disabled = false;
            }
        });
    });

    tbody.querySelectorAll('.btn-remove-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const username = e.currentTarget.dataset.username;
            if(confirm(`Are you sure you want to completely clear database entry and unlink Roblox for @${username}?`)) {
                removeUserLink(username);
            }
        });
    });
}

function updateAdminRequestsTable(requests) {
    const tbody = document.getElementById('adminRequestsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const sortedReqs = Object.values(requests).sort((a,b) => b.timestamp - a.timestamp);
    
    if (sortedReqs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">No donation requests found.</td></tr>`;
        return;
    }
    
    sortedReqs.forEach(req => {
        const tr = document.createElement('tr');
        let statusBadge = `<span class="badge badge-pending">⏳ Pending</span>`;
        if (req.status === 'approved') statusBadge = `<span class="badge badge-approve">✅ Approved</span>`;
        if (req.status === 'rejected') statusBadge = `<span class="badge badge-reject">❌ Rejected</span>`;
        
        let actionButtons = '';
        if (req.status === 'pending') {
            actionButtons = `
                <button class="btn-primary btn-small btn-approve-req" style="background:#48bb78;" data-id="${req.requestId}">Approve</button>
                <button class="btn-primary btn-small btn-reject-req" style="background:#f56565;" data-id="${req.requestId}">Reject</button>
            `;
        } else {
            actionButtons = `<span style="color:#555; font-size:12px;">Processed by<br><@${req.processedBy || 'Unknown'}></span>`;
        }
        
        const dateStr = new Date(req.timestamp).toLocaleString();
        
        tr.innerHTML = `
            <td>
                <div class="user-name-cell">
                    <span class="display-name">${req.robloxName}</span>
                    <span class="username-handle">@${req.robloxUsername}</span>
                </div>
            </td>
            <td><strong>+${(req.amount || 0).toLocaleString()}</strong></td>
            <td><span style="font-size:11px; color:#888;">${dateStr}</span></td>
            <td>${statusBadge}</td>
            <td>
                <div style="display:flex; gap:5px;">
                    ${actionButtons}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    tbody.querySelectorAll('.btn-approve-req').forEach(btn => {
        btn.addEventListener('click', (e) => processDonationRequest(e.currentTarget.dataset.id, 'approve'));
    });
    tbody.querySelectorAll('.btn-reject-req').forEach(btn => {
        btn.addEventListener('click', (e) => processDonationRequest(e.currentTarget.dataset.id, 'reject'));
    });
}

// ==========================================
// 8. ACTIONS, REQUEST HANDLING & FORM SUBMITS
// ==========================================

async function submitGpDonation() {
    if (!currentUser) return;
    if (!hasGpSubmitPermission()) {
        showNotify("You don't have permission to submit requests!", "error");
        return;
    }
    
    const amountInput = document.getElementById('gpAmountInput');
    const fileInput = document.getElementById('gpProofInput');
    const amount = parseInt(amountInput?.value);
    
    if (!amount || amount <= 0) {
        showNotify("Please enter a valid GP amount!", "error");
        return;
    }
    
    if (!fileInput || fileInput.files.length === 0) {
        showNotify("Please upload at least one image as proof!", "error");
        return;
    }
    
    showLoading(true, 'submitGpBtn');
    
    try {
        const dbKey = getSafeDbKey(currentUser.username);
        const userSnap = await get(ref(db, `users/${dbKey}`));
        if (!userSnap.exists()) {
            throw new Error("User entry not found in database.");
        }
        const uData = userSnap.val();
        
        const requestId = 'REQ_' + Math.random().toString(36).substr(2, 9).toUpperCase();
        
        const requestData = {
            requestId,
            userId: currentUser.id,
            discordName: currentUser.global_name || currentUser.username,
            discordUsername: currentUser.username,
            robloxId: uData.robloxId,
            robloxName: uData.robloxName,
            robloxUsername: uData.robloxUsername,
            amount: amount,
            status: 'pending',
            timestamp: Date.now()
        };
        
        // Erst zu Firebase hinzufügen
        await set(ref(db, `requests/${requestId}`), requestData);
        
        // Zu Discord senden via Bot Backend (inkl. Bildern)
        const imagesArray = Array.from(fileInput.files);
        const sentToDiscord = await sendGPRequestToDiscord(requestData, imagesArray);
        
        if (sentToDiscord) {
            showNotify("GP request submitted successfully!", "success");
            amountInput.value = '';
            fileInput.value = '';
            const previewContainer = document.getElementById('imagePreviewContainer');
            if (previewContainer) previewContainer.innerHTML = '';
        } else {
            // Rollback in DB falls Discord fehlschlägt
            await remove(ref(db, `requests/${requestId}`));
            showNotify("Failed to sync request with Discord Bot Backend!", "error");
        }
    } catch(e) {
        console.error(e);
        showNotify(e.message || "Error submitting request", "error");
    } finally {
        showLoading(false, 'submitGpBtn');
    }
}

async function processDonationRequest(requestId, action) {
    if (!hasAdminPermission() && !hasOwnerPermission()) return;
    
    try {
        const reqRef = ref(db, `requests/${requestId}`);
        const snap = await get(reqRef);
        if (!snap.exists()) {
            showNotify("Request not found!", "error");
            return;
        }
        
        const rData = snap.val();
        if (rData.status !== 'pending') {
            showNotify("This request has already been processed!", "warning");
            return;
        }
        
        const dbKey = getSafeDbKey(rData.discordUsername);
        const userRef = ref(db, `users/${dbKey}`);
        const userSnap = await get(userRef);
        
        if (action === 'approve') {
            if (!testModeEnabled) {
                let currentGP = 0;
                if (userSnap.exists() && userSnap.val().totalGP) {
                    currentGP = parseInt(userSnap.val().totalGP);
                }
                const newGP = currentGP + parseInt(rData.amount);
                await update(userRef, { totalGP: newGP });
            }
            await update(reqRef, { status: 'approved', processedBy: currentUser.id, processedAt: Date.now() });
            showNotify("Request approved!", "success");
        } else {
            await update(reqRef, { status: 'rejected', processedBy: currentUser.id, processedAt: Date.now() });
            showNotify("Request rejected!", "error");
        }
        
        // Discord Embed über das Worker-Backend aktualisieren
        if (rData.discordMessageId) {
            const channels = await getChannelConfig();
            const chId = channels.CH_GP_REQUESTS;
            if (chId) {
                await fetch(`${BACKEND_URL}/update-interaction-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        channelId: chId,
                        messageId: rData.discordMessageId,
                        action: action,
                        processorId: currentUser.id
                    })
                });
            }
        }
    } catch (e) {
        console.error(e);
        showNotify("Error processing request", "error");
    }
}

async function saveUserGpManually(discordUsername) {
    if (!hasAdminPermission()) return;
    const dbKey = getSafeDbKey(discordUsername);
    const input = document.getElementById(`input-gp-${dbKey}`);
    if (!input) return;
    
    const newVal = parseInt(input.value);
    if (isNaN(newVal) || newVal < 0) {
        showNotify("Invalid GP amount!", "error");
        return;
    }
    
    try {
        await update(ref(db, `users/${dbKey}`), { totalGP: newVal });
        showNotify(`GP updated for @${discordUsername}`, "success");
    } catch(e) {
        console.error(e);
        showNotify("Failed to save GP", "error");
    }
}

async function removeUserLink(discordUsername) {
    if (!hasAdminPermission()) return;
    const dbKey = getSafeDbKey(discordUsername);
    
    try {
        const snap = await get(ref(db, `users/${dbKey}`));
        if (snap.exists()) {
            const uid = snap.val().id;
            // Eintrag löschen
            await remove(ref(db, `users/${dbKey}`));
            
            // Unreg Rolle im Discord Server setzen
            if (uid) {
                await fetch(`${BACKEND_URL}/sync-user-roles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: uid, executorId: currentUser.id })
                });
            }
            showNotify(`Entry cleared for @${discordUsername}`, "success");
            loadRegisteredUsersCount();
        }
    } catch (e) {
        console.error(e);
        showNotify("Failed to remove user", "error");
    }
}

async function saveChannelConfig() {
    if (!hasOwnerPermission()) return;
    
    const chLogin = document.getElementById('chLoginLogs')?.value.trim();
    const chLeave = document.getElementById('chLeaveLogs')?.value.trim();
    const chRequests = document.getElementById('chGpRequests')?.value.trim();
    
    try {
        await set(ref(db, 'config/channels'), {
            CH_LOGIN_LOGS: chLogin,
            CH_LEAVE_LOGS: chLeave,
            CH_GP_REQUESTS: chRequests
        });
        showNotify("Channel IDs configuration saved!", "success");
    } catch (e) {
        console.error(e);
        showNotify("Failed to save channels config", "error");
    }
}

async function setMaintenanceMode(enable) {
    if (!hasOwnerPermission()) return;
    try {
        await set(ref(db, 'config/maintenance'), { enabled: enable, toggledBy: currentUser.id, updatedAt: Date.now() });
        showNotify(`Maintenance mode ${enable ? 'ENABLED' : 'DISABLED'}`, "success");
        await loadMaintenanceStatus();
    } catch (e) {
        console.error(e);
    }
}

async function setTestMode(enable) {
    if (!hasOwnerPermission()) return;
    try {
        await set(ref(db, 'config/testMode'), { enabled: enable, toggledBy: currentUser.id, updatedAt: Date.now() });
        testModeEnabled = enable;
        updateTestModeIndicator();
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// 9. EVENT LISTENERS & INITIALIZATION
// ==========================================

function handleImagePreview(e) {
    const container = document.getElementById('imagePreviewContainer');
    if (!container) return;
    container.innerHTML = '';
    
    const files = Array.from(e.target.files);
    if (files.length > systemConfig.limits.maxImagesPerRequest) {
        showNotify(`Maximum ${systemConfig.limits.maxImagesPerRequest} images allowed!`, "warning");
    }
    
    files.slice(0, systemConfig.limits.maxImagesPerRequest).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const div = document.createElement('div');
            div.className = 'img-preview-wrapper';
            div.innerHTML = `<img src="${event.target.result}" alt="Proof Preview">`;
            container.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function initEventListeners() {
    // Login-Buttons
    const dLoginBtn = document.getElementById('discordLoginBtn');
    if (dLoginBtn) dLoginBtn.addEventListener('click', () => {
        window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    });
    
    const rLoginBtn = document.getElementById('robloxLoginBtn');
    if (rLoginBtn) rLoginBtn.addEventListener('click', () => {
        window.location.href = `https://apis.roblox.com/oauth/v1/authorize?client_id=${ROBLOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile`;
    });
    
    // Logout-Buttons
    const logoutBtns = document.querySelectorAll('#logoutBtn, #logoutBtnMobile');
    logoutBtns.forEach(btn => btn.addEventListener('click', () => {
        if (liveCheckInterval) clearInterval(liveCheckInterval);
        sessionStorage.removeItem('pn_session');
        window.location.href = REDIRECT_URI;
    }));
    
    // Tab-Navigation Buttons
    ['Spenden', 'Leaderboard', 'Profile', 'Admin', 'Owner'].forEach(name => {
        const btn = document.getElementById(`tabBtn${name}`);
        if (btn) btn.addEventListener('click', () => switchTab(name));
    });
    
    // GP Submit Formular
    const submitGpBtn = document.getElementById('submitGpBtn');
    if (submitGpBtn) submitGpBtn.addEventListener('click', submitGpDonation);
    
    const proofInput = document.getElementById('gpProofInput');
    if (proofInput) proofInput.addEventListener('click', () => { proofInput.value = ''; }); // Reset
    if (proofInput) proofInput.addEventListener('change', handleImagePreview);
    
    // Owner Config Speichern
    const saveChannelsBtn = document.getElementById('saveChannelsBtn');
    if (saveChannelsBtn) saveChannelsBtn.addEventListener('click', saveChannelConfig);
    
    // Maintenance & Test Mode Buttons
    const enableMaintenanceBtn = document.getElementById('enableMaintenanceBtn');
    const disableMaintenanceBtn = document.getElementById('disableMaintenanceBtn');
    const enableTestModeBtn = document.getElementById('enableTestModeBtn');
    const disableTestModeBtn = document.getElementById('disableTestModeBtn');
    const saveSystemRolesBtn = document.getElementById('saveSystemRolesBtn');
    
    const manualRegisterBtn = document.getElementById('manualRegisterBtn');
    const manualCheckUserBtn = document.getElementById('manualCheckUserBtn');
    const manualClearFormBtn = document.getElementById('manualClearFormBtn');
    const syncRolesBtn = document.getElementById('syncRolesBtn');
    
    if (enableTestModeBtn) enableTestModeBtn.addEventListener('click', () => setTestMode(true));
    if (disableTestModeBtn) disableTestModeBtn.addEventListener('click', () => setTestMode(false));
    if (enableMaintenanceBtn) enableMaintenanceBtn.addEventListener('click', () => setMaintenanceMode(true));
    if (disableMaintenanceBtn) disableMaintenanceBtn.addEventListener('click', () => setMaintenanceMode(false));
    if (saveSystemRolesBtn) saveSystemRolesBtn.addEventListener('click', saveSystemRoles);
    
    if (manualRegisterBtn) manualRegisterBtn.addEventListener('click', manualRegisterUser);
    if (manualCheckUserBtn) manualCheckUserBtn.addEventListener('click', manualCheckUser);
    if (manualClearFormBtn) manualClearFormBtn.addEventListener('click', clearManualForm);
    if (syncRolesBtn) syncRolesBtn.addEventListener('click', syncUserRolesManually);
}

function init() {
    initEventListeners();
    
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
}

init();
