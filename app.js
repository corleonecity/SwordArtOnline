// ==========================================
// 1. SETTINGS & CONFIGURATION
// ==========================================

const OWNER_USER_ID = '917426398120005653';

// Rollen für Zugriffskontrolle - im System abgeglichen
let ADMIN_ROLES = ['1503609455466643547'];
let OWNER_ROLES = ['1504646932243546152'];

// System-Rollen (können im Owner Panel konfiguriert werden)
let SYSTEM_ROLES = {
    regRole: '1503217692843180083',
    unregRole: '1503218754643820624',
    gpSubmitRole: '1503193408280330400',
    pendingRole: '1503265048162996385'
};

let GP_SUBMIT_ROLE = SYSTEM_ROLES.gpSubmitRole;

// System-Konfiguration
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

// Globaler Anwendungsstatus
let currentUser = null;
let currentTab = 'spenden'; // Standardmäßig auf der Spendenseite starten
let allUsersData = {};
let allRequestsData = {};
let testModeEnabled = false;

// OAuth URLs & IDs
const REDIRECT_URI = window.location.origin + window.location.pathname;
const DISCORD_CLIENT_ID = '1342617711477264426'; 
const ROBLOX_CLIENT_ID = '4410186987179093850';

const DISCORD_AUTH_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=identify+guilds+email&state=discord`;
const ROBLOX_AUTH_URL = `https://arrow-roblox-oauth.pages.dev/?client_id=${ROBLOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=roblox`;

const WORKER_URL = ''; // Leerlassen, falls relative API-Routen auf derselben Domain laufen

// Array für die Bilddateien-Auswahl beim Spenden-Upload
let selectedFilesArray = [];

// ==========================================
// 2. BACKEND API FETCHERS
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

        // Vorhandenen User aus Firebase laden, falls existent
        try {
            const existingRes = await fetch(`/api/db?path=users/${dbKey}`);
            if (existingRes.ok) {
                const existingData = await existingRes.json();
                if (existingData) {
                    currentUser = { ...currentUser, ...existingData };
                }
            }
        } catch (e) { console.error("Error fetching existing user:", e); }

        // In Datenbank speichern
        try {
            await fetch(`/api/db?path=users/${dbKey}`, {
                method: 'PUT',
                body: JSON.stringify(currentUser)
            });
        } catch (e) { console.error("Error saving user to DB:", e); }

        // Rollen auf Discord Server anpassen
        try {
            await apiFetch('/check-member', {
                method: 'POST',
                body: JSON.stringify({ userId: user.id, updateRoles: true })
            });
        } catch (e) { console.error("Error updating member roles:", e); }

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

        // Nickname auf Discord-Server anpassen
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

    if (currentUser.robloxLinked) {
        showPage('mainContent');
        loadDashboard();
    } else {
        showPage('robloxPage');
    }
}

// ==========================================
// 5. NAVIGATION & PAGES SWITCHING
// ==========================================

function showPage(pageId) {
    const pages = ['loginPage', 'noPermissionPage', 'robloxPage', 'mainContent'];
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === pageId) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });
}

function switchTab(tabId) {
    currentTab = tabId;
    const tabs = ['spenden', 'leaderboard', 'profile', 'admin', 'owner'];
    
    tabs.forEach(t => {
        // Tab-Button-Zustand umschalten
        const btnId = 'tabBtn' + t.charAt(0).toUpperCase() + t.slice(1);
        const btn = document.getElementById(btnId);
        if (btn) {
            if (t === tabId) btn.classList.add('active');
            else btn.classList.remove('active');
        }
        
        // Tab-Inhalt umschalten
        const content = document.getElementById(`content-${t}`);
        if (content) {
            if (t === tabId) content.classList.remove('hidden');
            else content.classList.add('hidden');
        }
    });
    
    // Daten für den jeweiligen Tab laden
    if (tabId === 'leaderboard') renderLeaderboard();
    if (tabId === 'profile') renderProfileHistory();
    if (tabId === 'admin') renderAdminPanel();
    if (tabId === 'owner') renderOwnerPanel();
}

// ==========================================
// 6. DASHBOARD & PERMISSIONS LOGIC
// ==========================================

async function loadDashboard() {
    if (!currentUser) return;
    
    const userWelcome = document.getElementById('userWelcome');
    if (userWelcome) {
        userWelcome.textContent = `Hi, ${currentUser.discordName || currentUser.discordUsername}`;
    }
    
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar && currentUser.avatar) {
        userAvatar.src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
    }
    
    await fetchMaintenanceAndTestModeSettings();
    await checkAccessPermissions();
    switchTab(currentTab);
}

async function checkAccessPermissions() {
    if (!currentUser) return;
    
    let isOwner = (String(currentUser.id) === String(OWNER_USER_ID));
    let isAdmin = false;
    
    try {
        const res = await apiFetch(`/check-member-roles?userId=${currentUser.id}`);
        if (res && res.roles) {
            const userRoles = res.roles;
            isAdmin = userRoles.some(r => ADMIN_ROLES.includes(r)) || userRoles.some(r => OWNER_ROLES.includes(r)) || isOwner;
            isOwner = isOwner || userRoles.some(r => OWNER_ROLES.includes(r));
            
            // GP-Spenden Erlaubnis prüfen (Rolle vorhanden?)
            const hasGPRole = userRoles.includes(GP_SUBMIT_ROLE);
            const gpSubmitCard = document.getElementById('gpSubmitCard');
            const noPermissionCard = document.getElementById('noPermissionCard');
            if (gpSubmitCard && noPermissionCard) {
                if (hasGPRole || isAdmin || isOwner) {
                    gpSubmitCard.classList.remove('hidden');
                    noPermissionCard.classList.add('hidden');
                } else {
                    gpSubmitCard.classList.add('hidden');
                    noPermissionCard.classList.remove('hidden');
                }
            }
        }
    } catch (e) {
        console.error("Error checking roles:", e);
    }
    
    const adminTab = document.getElementById('tabBtnAdmin');
    const ownerTab = document.getElementById('tabBtnOwner');
    
    if (adminTab) {
        if (isAdmin || isOwner) adminTab.classList.remove('hidden');
        else adminTab.classList.add('hidden');
    }
    if (ownerTab) {
        if (isOwner) ownerTab.classList.remove('hidden');
        else ownerTab.classList.add('hidden');
    }
}

// ==========================================
// 7. GP SUBMISSION TAB (MULTI-IMAGES)
// ==========================================

function handleFileSelection(e) {
    const files = Array.from(e.target.files);
    if (selectedFilesArray.length + files.length > systemConfig.limits.maxImagesPerRequest) {
        showNotification(`❌ You can upload a maximum of ${systemConfig.limits.maxImagesPerRequest} images.`, "error");
        return;
    }
    
    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        selectedFilesArray.push(file);
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const container = document.getElementById('imagePreviewContainer');
            if (container) {
                const wrapper = document.createElement('div');
                wrapper.className = 'img-preview-wrapper';
                wrapper.style = 'position: relative; display: inline-block; margin: 10px; border: 1px solid #333; border-radius: 8px; overflow: hidden;';
                wrapper.innerHTML = `
                    <img src="${event.target.result}" style="width: 100px; height: 100px; object-fit: cover; display: block;">
                    <button type="button" style="position: absolute; top: 2px; right: 2px; background: rgba(245,101,101,0.9); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;">&times;</button>
                `;
                wrapper.querySelector('button').addEventListener('click', () => {
                    selectedFilesArray = selectedFilesArray.filter(f => f !== file);
                    wrapper.remove();
                    updateFileCountText();
                });
                container.appendChild(wrapper);
            }
        };
        reader.readAsDataURL(file);
    });
    
    updateFileCountText();
}

function updateFileCountText() {
    const txt = document.getElementById('fileCountText');
    if (txt) {
        txt.textContent = `${selectedFilesArray.length} image${selectedFilesArray.length === 1 ? '' : 's'} selected`;
    }
}

async function submitGPRequest() {
    const amountInput = document.getElementById('gpAmount');
    const submitBtn = document.getElementById('addGPBtn');
    if (!amountInput || !submitBtn) return;
    
    const amount = parseInt(amountInput.value);
    if (isNaN(amount) || amount < 100) {
        showNotification("❌ Please enter a valid amount (minimum 100 GP).", "error");
        return;
    }
    
    if (selectedFilesArray.length === 0) {
        showNotification("❌ Please attach at least one screenshot as proof.", "error");
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`;
    
    try {
        const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const dbKey = `user_${currentUser.id}`;
        
        const embedFields = [
            { name: "💬 Discord Account", value: `**Name:** ${currentUser.discordName}\n**Username:** @${currentUser.discordUsername}\n**ID:** \`${currentUser.id}\``, inline: true },
            { name: "🎮 Roblox Account", value: `**Name:** ${currentUser.robloxName}\n**Username:** @${currentUser.robloxUsername}\n**ID:** \`${currentUser.robloxId}\``, inline: true },
            { name: "💰 GP Amount", value: `**+${amount.toLocaleString()} GP**`, inline: false }
        ];
        
        const discordPayload = {
            username: "SAO GP Donation Logger",
            avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
            embeds: [{
                title: "📥 New GP Donation Request",
                description: `A user has submitted a donation proof for review.`,
                color: parseInt(systemConfig.embedColors.pending.replace('#', ''), 16),
                fields: embedFields,
                footer: { text: `SAO Panel | Request ID: ${reqId}` },
                timestamp: new Date().toISOString()
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
        
        // Senden via Cloudflare Worker Proxy
        const resData = await apiFetch('/send-gp-request-with-buttons', {
            method: 'POST',
            body: formData,
            headers: {} // Browser setzt Multipart-Header automatisch
        });
        
        if (!resData.success || !resData.messageId) {
            throw new Error(resData.error || "Failed to deliver request to Discord server.");
        }
        
        // Speichern in Firebase Realtime DB
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
        
        showNotification("✅ Donation proof submitted successfully to admins!", "success");
        amountInput.value = '';
        selectedFilesArray = [];
        const previewCont = document.getElementById('imagePreviewContainer');
        if (previewCont) previewCont.innerHTML = '';
        updateFileCountText();
        switchTab('profile'); // Nach Einreichung in die Historie wechseln
        
    } catch (e) {
        console.error(e);
        showNotification("❌ Submission Error: " + e.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `SUBMIT PROOF FOR REVIEW`;
    }
}

// ==========================================
// 8. LEADERBOARD TAB
// ==========================================

async function renderLeaderboard() {
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading ranks...</td></tr>`;
    
    try {
        const res = await fetch('/api/db?path=users');
        if (!res.ok) throw new Error("Could not fetch user database.");
        allUsersData = await res.json() || {};
        
        const searchInput = document.getElementById('leaderboardSearch');
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
        
        let sortedUsers = Object.values(allUsersData)
            .filter(user => {
                if (!user.robloxLinked) return false;
                if (searchTerm) {
                    const dcN = (user.discordName || "").toLowerCase();
                    const dcU = (user.discordUsername || "").toLowerCase();
                    const rN = (user.robloxName || "").toLowerCase();
                    const rU = (user.robloxUsername || "").toLowerCase();
                    return dcN.includes(searchTerm) || dcU.includes(searchTerm) || rN.includes(searchTerm) || rU.includes(searchTerm);
                }
                return true;
            })
            .sort((a, b) => (b.totalGP || 0) - (a.totalGP || 0));
            
        let totalSystemGP = Object.values(allUsersData).reduce((sum, u) => sum + (u.totalGP || 0), 0);
            
        const totalGpStat = document.getElementById('totalGpStat');
        if (totalGpStat) totalGpStat.textContent = totalSystemGP.toLocaleString();
        
        tbody.innerHTML = '';
        if (sortedUsers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#666;">No ranked players found.</td></tr>`;
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
                    <div style="font-weight: 600;">${user.discordName || user.discordUsername}</div>
                    <div style="font-size: 11px; color: #666;">@${user.discordUsername}</div>
                </td>
                <td>
                    <div class="user-name-cell">
                        <span class="display-name">${user.robloxName || 'Unknown'}</span>
                        <span class="username-handle" style="font-size: 11px; color:#666; display:block;">@${user.robloxUsername || 'unknown'}</span>
                    </div>
                </td>
                <td><strong style="color: #ffd700;">${(user.totalGP || 0).toLocaleString()} GP</strong></td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#f56565;">❌ Error: ${e.message}</td></tr>`;
    }
}

// ==========================================
// 9. PROFILE TAB (EIGENE ANFRAGEN)
// ==========================================

async function renderProfileHistory() {
    const tbody = document.getElementById('profileHistoryBody');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading requests...</td></tr>`;
    
    try {
        const res = await fetch('/api/db?path=requests');
        if (!res.ok) throw new Error("Could not fetch request history.");
        allRequestsData = await res.json() || {};
        
        const myRequests = Object.values(allRequestsData)
            .filter(r => String(r.userId) === String(currentUser.id))
            .sort((a, b) => b.createdAt - a.createdAt);
            
        tbody.innerHTML = '';
        if (myRequests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#666;">You have not submitted any GP donation proofs yet.</td></tr>`;
            return;
        }
        
        myRequests.forEach(req => {
            const tr = document.createElement('tr');
            
            let statusBadge = '';
            if (req.status === 'pending') statusBadge = `<span style="color:#cd7f32; background:rgba(205,127,50,0.1); padding:4px 8px; border-radius:6px; font-size:12px;"><i class="fas fa-clock"></i> Pending</span>`;
            else if (req.status === 'approved') statusBadge = `<span style="color:#48bb78; background:rgba(72,187,120,0.1); padding:4px 8px; border-radius:6px; font-size:12px;"><i class="fas fa-check"></i> Approved</span>`;
            else if (req.status === 'rejected') statusBadge = `<span style="color:#f56565; background:rgba(245,101,101,0.1); padding:4px 8px; border-radius:6px; font-size:12px;"><i class="fas fa-times"></i> Rejected</span>`;
            
            tr.innerHTML = `
                <td>${new Date(req.createdAt).toLocaleString()}</td>
                <td><strong style="color: #ffd700;">+${req.amount.toLocaleString()} GP</strong></td>
                <td>${statusBadge}</td>
                <td style="color:#aaa; font-size:13px;">${req.adminComment || '—'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#f56565;">❌ Error: ${e.message}</td></tr>`;
    }
}

// ==========================================
// 10. ADMIN PANEL TAB
// ==========================================

async function renderAdminPanel() {
    const tbody = document.getElementById('adminPendingBody');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Fetching open submissions...</td></tr>`;
    
    try {
        const reqRes = await fetch('/api/db?path=requests');
        if (reqRes.ok) allRequestsData = await reqRes.json() || {};
        
        tbody.innerHTML = '';
        const pendingList = Object.values(allRequestsData)
            .filter(r => r.status === 'pending')
            .sort((a, b) => a.createdAt - b.createdAt);
            
        if (pendingList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#666;">No pending donation proofs found inside the database! All clean.</td></tr>`;
            return;
        }
        
        pendingList.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight:600;">${r.discordName || r.discordUsername}</div>
                    <div style="font-size:11px; color:#777;">ID: ${r.userId}</div>
                </td>
                <td>
                    <div>${r.robloxName || 'Unknown'}</div>
                    <div style="font-size:11px; color:#777;">@${r.robloxUsername}</div>
                </td>
                <td><strong style="color:#ffd700;">+${r.amount.toLocaleString()} GP</strong></td>
                <td>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-primary btn-small" style="background:#48bb78; color:white; width:auto; padding:5px 10px; font-size:12px;" onclick="processRequestDirectly('${r.id}', 'approve')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn-primary btn-small" style="background:#f56565; color:white; width:auto; padding:5px 10px; font-size:12px;" onclick="processRequestDirectly('${r.id}', 'reject')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#f56565;">❌ Error loading admin list: ${e.message}</td></tr>`;
    }
}

async function processRequestDirectly(reqId, action) {
    if (!confirm(`Are you sure you want to declare this request as ${action.toUpperCase()}?`)) return;
    showLoading(true, "Processing status change...");
    
    try {
        const res = await fetch(`/api/db?path=requests/${reqId}`);
        if (!res.ok) throw new Error("Request data not found.");
        const reqData = await res.json();
        if (!reqData) throw new Error("Request does not exist anymore.");
        
        reqData.status = action === 'approve' ? 'approved' : 'rejected';
        reqData.processedAt = Date.now();
        reqData.processedBy = currentUser.id;
        reqData.adminComment = `Processed directly via web admin dashboard by ${currentUser.discordName}`;
        
        // Status in Firebase updaten
        await fetch(`/api/db?path=requests/${reqId}`, {
            method: 'PUT',
            body: JSON.stringify(reqData)
        });
        
        // Bei Genehmigung und deaktivertem Test-Modus GP gutschreiben
        if (action === 'approve' && !testModeEnabled) {
            let currentTotal = 0;
            const uRes = await fetch(`/api/db?path=users/${reqData.dbKey}`);
            if (uRes.ok) {
                const uData = await uRes.json();
                if (uData) currentTotal = uData.totalGP || 0;
            }
            const newTotal = currentTotal + reqData.amount;
            
            await fetch(`/api/db?path=users/${reqData.dbKey}`, {
                method: 'PATCH',
                body: JSON.stringify({ totalGP: newTotal })
            });
        }
        
        // Discord Embed Nachricht via Worker aktualisieren (Buttons sperren)
        try {
            await apiFetch('/update-gp-message', {
                method: 'POST',
                body: JSON.stringify({
                    requestId: reqId,
                    adminId: currentUser.id,
                    adminName: currentUser.discordName,
                    status: reqData.status
                })
            });
        } catch(discordErr) {
            console.error("Failed to update Discord embed message state:", discordErr);
        }
        
        showNotification(`✅ Request processed successfully: State declared as ${action}.`, "success");
        await renderAdminPanel();
    } catch (e) {
        showNotification("❌ Action Error: " + e.message, "error");
    } finally {
        showLoading(false);
    }
}
window.processRequestDirectly = processRequestDirectly; // Global bereitstellen

// ==========================================
// 11. OWNER PANEL TAB
// ==========================================

async function renderOwnerPanel() {
    try {
        const sysRolesRes = await fetch('/api/db?path=config/system_roles');
        if (sysRolesRes.ok) {
            const data = await sysRolesRes.json();
            if (data) {
                SYSTEM_ROLES = data;
                GP_SUBMIT_ROLE = SYSTEM_ROLES.gpSubmitRole || GP_SUBMIT_ROLE;
                
                // Formularfelder befüllen
                if (document.getElementById('sysRoleReg')) document.getElementById('sysRoleReg').value = data.regRole || '';
                if (document.getElementById('sysRoleUnreg')) document.getElementById('sysRoleUnreg').value = data.unregRole || '';
                if (document.getElementById('sysRoleGpSubmit')) document.getElementById('sysRoleGpSubmit').value = data.gpSubmitRole || '';
                if (document.getElementById('sysRolePending')) document.getElementById('sysRolePending').value = data.pendingRole || '';
            }
        }
    } catch(e) { console.error(e); }
    
    await fetchMaintenanceAndTestModeSettings();
}

async function fetchMaintenanceAndTestModeSettings() {
    try {
        // Wartungsmodus abfragen
        const maintRes = await fetch('/api/db?path=config/maintenance');
        if (maintRes.ok) {
            const mData = await maintRes.json();
            const active = mData?.enabled || false;
            const overlay = document.getElementById('maintenanceOverlay');
            const statusTxt = document.getElementById('maintenanceStatusText');
            
            if (overlay) {
                // Owner und Admins können die Sperre umgehen
                let bypass = currentUser && (String(currentUser.id) === String(OWNER_USER_ID) || ADMIN_ROLES.includes(currentUser.id)); 
                if (active && !bypass) overlay.classList.remove('hidden');
                else overlay.classList.add('hidden');
            }
            if (statusTxt) {
                statusTxt.textContent = active ? "Enabled" : "Disabled";
                statusTxt.style.color = active ? "#f56565" : "#48bb78";
            }
        }
        
        // Testmodus abfragen
        const testRes = await fetch('/api/db?path=config/testMode');
        if (testRes.ok) {
            const tData = await testRes.json();
            testModeEnabled = tData?.enabled || false;
            const indicator = document.getElementById('testModeIndicator');
            const statusTxt = document.getElementById('testModeStatusText');
            
            if (indicator) {
                if (testModeEnabled) indicator.classList.remove('hidden');
                else indicator.classList.add('hidden');
            }
            if (statusTxt) {
                statusTxt.textContent = testModeEnabled ? "Active" : "Disabled";
                statusTxt.style.color = testModeEnabled ? "#f56565" : "#48bb78";
            }
        }
    } catch(e) { console.error(e); }
}

async function saveSystemRoles() {
    const payload = {
        regRole: document.getElementById('sysRoleReg').value.trim(),
        unregRole: document.getElementById('sysRoleUnreg').value.trim(),
        gpSubmitRole: document.getElementById('sysRoleGpSubmit').value.trim(),
        pendingRole: document.getElementById('sysRolePending').value.trim()
    };
    
    try {
        await fetch('/api/db?path=config/system_roles', {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        SYSTEM_ROLES = payload;
        GP_SUBMIT_ROLE = SYSTEM_ROLES.gpSubmitRole;
        showNotification("✅ Discord System Access Roles updated in database!", "success");
    } catch(e) {
        showNotification("❌ Update failed: " + e.message, "error");
    }
}

async function setMaintenanceMode(enable) {
    try {
        await fetch('/api/db?path=config/maintenance', {
            method: 'PUT',
            body: JSON.stringify({ enabled: enable, updatedAt: Date.now() })
        });
        showNotification(`✅ Maintenance mode has been ${enable ? 'ENABLED' : 'DISABLED'}!`, "success");
        await fetchMaintenanceAndTestModeSettings();
    } catch(e) {
        showNotification("❌ Failed to set maintenance mode: " + e.message, "error");
    }
}

async function setTestMode(enable) {
    try {
        await fetch('/api/db?path=config/testMode', {
            method: 'PUT',
            body: JSON.stringify({ enabled: enable, updatedAt: Date.now() })
        });
        showNotification(`✅ Test mode has been ${enable ? 'ENABLED' : 'DISABLED'}!`, "success");
        await fetchMaintenanceAndTestModeSettings();
    } catch(e) {
        showNotification("❌ Failed to set test mode: " + e.message, "error");
    }
}

// ==========================================
// 12. OWNER PANEL: MANUELLE NUTZERREGISTRIERUNG
// ==========================================

async function manualRegisterUser() {
    const dId = document.getElementById('manualDiscordId').value.trim();
    const dName = document.getElementById('manualDiscordName').value.trim();
    const dUser = document.getElementById('manualDiscordUsername').value.trim();
    const rId = document.getElementById('manualRobloxId').value.trim();
    const rName = document.getElementById('manualRobloxName').value.trim();
    const rUser = document.getElementById('manualRobloxUsername').value.trim();
    const initGP = parseInt(document.getElementById('manualInitialGp').value) || 0;
    
    const resDiv = document.getElementById('manualRegisterResult');
    if (!dId || !dUser || !rId || !rUser) {
        if (resDiv) resDiv.innerHTML = `<span style="color:#f56565;">❌ Missing required fields marked with *.</span>`;
        return;
    }
    
    if (resDiv) resDiv.innerHTML = `Saving user records...`;
    
    try {
        const dbKey = `user_${dId}`;
        const userObj = {
            id: dId,
            discordName: dName || dUser,
            discordUsername: dUser,
            avatar: null,
            email: "",
            totalGP: initGP,
            robloxLinked: true,
            robloxId: rId,
            robloxName: rName || rUser,
            robloxUsername: rUser
        };
        
        await fetch(`/api/db?path=users/${dbKey}`, {
            method: 'PUT',
            body: JSON.stringify(userObj)
        });
        
        if (resDiv) resDiv.innerHTML = `<span style="color:#48bb78;">✅ Saved user profile under ${dbKey} successfully with ${initGP} GP!</span>`;
        showNotification("✅ Manual user creation succeeded!", "success");
    } catch(e) {
        if (resDiv) resDiv.innerHTML = `<span style="color:#f56565;">❌ Error: ${e.message}</span>`;
    }
}

async function manualCheckUser() {
    const dId = document.getElementById('manualDiscordId').value.trim();
    const resDiv = document.getElementById('manualRegisterResult');
    if (!dId) {
        if (resDiv) resDiv.innerHTML = `<span style="color:#f56565;">❌ Input Discord User ID to examine records.</span>`;
        return;
    }
    
    if (resDiv) resDiv.innerHTML = `Searching database entry...`;
    
    try {
        const response = await fetch(`/api/db?path=users/user_${dId}`);
        if (!response.ok) throw new Error("Entry absent or server unreachable.");
        const data = await response.json();
        
        if (!data) {
            if (resDiv) resDiv.innerHTML = `<span style="color:#ffd700;">⚠️ No profile exists for Discord User ID: ${dId}</span>`;
            return;
        }
        
        document.getElementById('manualDiscordName').value = data.discordName || '';
        document.getElementById('manualDiscordUsername').value = data.discordUsername || '';
        document.getElementById('manualRobloxId').value = data.robloxId || '';
        document.getElementById('manualRobloxName').value = data.robloxName || '';
        document.getElementById('manualRobloxUsername').value = data.robloxUsername || '';
        document.getElementById('manualInitialGp').value = data.totalGP || 0;
        
        if (resDiv) resDiv.innerHTML = `<span style="color:#48bb78;">✅ Found record! Fields autofilled above. Total GP: ${data.totalGP}</span>`;
    } catch(e) {
        if (resDiv) resDiv.innerHTML = `<span style="color:#f56565;">❌ Search failed: ${e.message}</span>`;
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
    const resDiv = document.getElementById('manualRegisterResult');
    if (resDiv) resDiv.innerHTML = '';
}

async function syncUserRolesManually() {
    const syncBtn = document.getElementById('syncRolesBtn');
    if (!syncBtn) return;
    
    syncBtn.disabled = true;
    syncBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Triggering Worker Sync...`;
    
    try {
        await apiFetch('/interactions', {
            method: 'POST',
            body: JSON.stringify({
                type: 3,
                data: { custom_id: 'manual_trigger_update' },
                member: { user: { id: currentUser?.id || OWNER_USER_ID } }
            })
        });
        showNotification("🔄 System synchronizer called: Info boards updating dynamically on server.", "success");
    } catch(e) {
        showNotification("❌ Sync execution fault: " + e.message, "error");
    } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = `<i class="fas fa-sync-alt"></i> Synchronize Discord Roles`;
    }
}

// ==========================================
// 13. TOAST NOTIFICATIONS & LOADING OVERLAY
// ==========================================

function showNotification(message, type = "info") {
    const notif = document.getElementById('notification');
    if (!notif) return;
    
    notif.textContent = message;
    notif.style.background = type === "success" ? "#48bb78" : type === "error" ? "#f56565" : "#5865F2";
    notif.className = "notification show";
    
    setTimeout(() => {
        notif.className = "notification";
    }, 4000);
}

function showLoading(show, message = "") {
    let loader = document.getElementById('loadingOverlaySafe');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'loadingOverlaySafe';
        loader.style = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: sans-serif; backdrop-filter: blur(5px);';
        loader.innerHTML = `
            <div style="border: 4px solid #333; border-top: 4px solid #ffd700; border-radius: 50%; width: 40px; height: 40px; animation: safeSpin 1s linear infinite; margin-bottom: 15px;"></div>
            <div id="loadingOverlaySafeText" style="font-size: 16px; font-weight: 500;"></div>
            <style>@keyframes safeSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        `;
        document.body.appendChild(loader);
    }
    
    if (show) {
        loader.style.display = 'flex';
        document.getElementById('loadingOverlaySafeText').textContent = message;
    } else {
        loader.style.display = 'none';
    }
}

// ==========================================
// 14. EVENT LISTENERS INITIALIZATION
// ==========================================

function initEventListeners() {
    const dcLogin = document.getElementById('discordLoginBtn');
    if (dcLogin) dcLogin.addEventListener('click', () => window.location.href = DISCORD_AUTH_URL);
    
    const rbxLogin = document.getElementById('robloxLoginBtn');
    if (rbxLogin) rbxLogin.addEventListener('click', () => window.location.href = ROBLOX_AUTH_URL);
    
    const dcLogout = document.getElementById('dcLogoutBtn');
    if (dcLogout) dcLogout.addEventListener('click', () => {
        sessionStorage.removeItem('pn_session');
        currentUser = null;
        window.location.href = window.location.pathname;
    });
    
    const rbxLogout = document.getElementById('rbxLogoutBtn');
    if (rbxLogout) rbxLogout.addEventListener('click', () => {
        if (currentUser) {
            currentUser.robloxLinked = false;
            currentUser.robloxId = null;
            currentUser.robloxName = null;
            currentUser.robloxUsername = null;
            sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
            checkRobloxLink();
        }
    });
    
    // Tab-Wechsel Event-Listener
    const tabsMapping = [
        { btn: 'tabBtnSpenden', id: 'spenden' },
        { btn: 'tabBtnLeaderboard', id: 'leaderboard' },
        { btn: 'tabBtnProfile', id: 'profile' },
        { btn: 'tabBtnAdmin', id: 'admin' },
        { btn: 'tabBtnOwner', id: 'owner' }
    ];
    
    tabsMapping.forEach(item => {
        const btnEl = document.getElementById(item.btn);
        if (btnEl) {
            btnEl.addEventListener('click', () => switchTab(item.id));
        }
    });
    
    // Upload & Formular Einreichung
    const proofImgInput = document.getElementById('proofImage');
    if (proofImgInput) proofImgInput.addEventListener('change', handleFileSelection);
    
    const addGPBtn = document.getElementById('addGPBtn');
    if (addGPBtn) addGPBtn.addEventListener('click', submitGPRequest);
    
    // Leaderboard Live-Suche
    const lbSearch = document.getElementById('leaderboardSearch');
    if (lbSearch) lbSearch.addEventListener('input', renderLeaderboard);
    
    // Owner Panel & System Toggles
    const enableMaint = document.getElementById('enableMaintenanceBtn');
    if (enableMaint) enableMaint.addEventListener('click', () => setMaintenanceMode(true));
    
    const disableMaint = document.getElementById('disableMaintenanceBtn');
    if (disableMaint) disableMaint.addEventListener('click', () => setMaintenanceMode(false));
    
    const saveRolesBtn = document.getElementById('saveSystemRolesBtn');
    if (saveRolesBtn) saveRolesBtn.addEventListener('click', saveSystemRoles);
    
    const enableTestModeBtn = document.getElementById('enableTestModeBtn');
    if (enableTestModeBtn) enableTestModeBtn.addEventListener('click', () => setTestMode(true));
    
    const disableTestModeBtn = document.getElementById('disableTestModeBtn');
    if (disableTestModeBtn) disableTestModeBtn.addEventListener('click', () => setTestMode(false));
    
    // Manuelle Registrierung
    const manualRegBtn = document.getElementById('manualRegisterBtn');
    if (manualRegBtn) manualRegBtn.addEventListener('click', manualRegisterUser);
    
    const manualChkBtn = document.getElementById('manualCheckUserBtn');
    if (manualChkBtn) manualChkBtn.addEventListener('click', manualCheckUser);
    
    const manualClrBtn = document.getElementById('manualClearFormBtn');
    if (manualClrBtn) manualClrBtn.addEventListener('click', clearManualForm);
    
    const syncRlsBtn = document.getElementById('syncRolesBtn');
    if (syncRlsBtn) syncRlsBtn.addEventListener('click', syncUserRolesManually);
}

// ==========================================
// 15. INITIALIZATION ENTRY POINT
// ==========================================

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
                checkRobloxLink();
            }
        } else {
            playLoginMusic();
            checkRobloxLink();
        }
    }
}

init();
