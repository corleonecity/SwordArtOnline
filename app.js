// ==========================================
// 1. SETTINGS & CONFIGURATION (Aus deinem Original-Skript)
// ==========================================

const OWNER_USER_ID = '917426398120005653';

let ADMIN_ROLES = ['1503609455466643547'];
let OWNER_ROLES = ['1504646932243546152'];

let SYSTEM_ROLES = {
    regRole: '1503217692843180083',
    unregRole: '1503218754643820624',
    gpSubmitRole: '1503193408280330400',
    pendingRole: '1503265048162996385'
};

let GP_SUBMIT_ROLE = SYSTEM_ROLES.gpSubmitRole;

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
    musicUrl: "https://www.youtube.com/embed/BtEkzZoUCpw?autoplay=1&loop=1",
    updateInterval: 60
};

// Globaler State
let currentUser = null;
let selectedFiles = [];
let fullLeaderboardData = [];
let activeMessageId = null;
let updateTimer = null;

// Backend-URL (Worker)
const WORKER_URL = window.location.origin; 

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

function showNotification(message, type = 'info') {
    const notif = document.getElementById('notification');
    if (!notif) return;
    notif.textContent = message;
    notif.className = `notification show ${type}`;
    setTimeout(() => { notif.classList.remove('show'); }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function showPage(pageId) {
    const pages = ['loginPage', 'noPermissionPage', 'robloxPage', 'mainContent'];
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== pageId);
    });
}

function playLoginMusic(play = true) {
    const container = document.getElementById('audioPlayerContainer');
    if (!container) return;
    if (play && systemConfig.musicUrl) {
        container.innerHTML = `<iframe width="1" height="1" src="${systemConfig.musicUrl}" frameborder="0" allow="autoplay; encrypted-media" style="display:none;"></iframe>`;
        container.classList.remove('hidden');
    } else {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
}

// ==========================================
// 3. AUTHENTICATION & OAUTH FLOWS
// ==========================================

function redirectToDiscord() {
    // Ersetze mit deiner echten Discord Client ID & Redirect URI falls nötig
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=DEINE_CLIENT_ID&redirect_uri=${encodeURIComponent(WORKER_URL)}&response_type=code&scope=identify%20guilds.members.read&state=discord`;
}

function redirectToRoblox() {
    window.location.href = `https://apis.roblox.com/oauth/v1/authorize?client_id=DEINE_ROBLOX_ID&redirect_uri=${encodeURIComponent(WORKER_URL)}&response_type=code&scope=openid%20profile&state=roblox`;
}

async function handleDiscordLogin(code) {
    try {
        const res = await fetch(`${WORKER_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        if (!res.ok) throw new Error("Discord Login fehlgeschlagen");
        const data = await res.json();
        
        currentUser = data.user;
        sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
        window.history.replaceState({}, document.title, window.location.pathname);
        checkRobloxLink();
    } catch (e) {
        showNotification(e.message, "error");
        playLoginMusic(true);
    }
}

async function handleRobloxLogin(code) {
    try {
        const saved = sessionStorage.getItem('pn_session');
        if (!saved) return;
        currentUser = JSON.parse(saved);

        const res = await fetch(`${WORKER_URL}/roblox-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, discordId: currentUser.id })
        });
        if (!res.ok) throw new Error("Roblox Verknüpfung fehlgeschlagen");
        
        const data = await res.json();
        currentUser.roblox = data.roblox;
        sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
        window.history.replaceState({}, document.title, window.location.pathname);
        checkRobloxLink();
    } catch (e) {
        showNotification(e.message, "error");
    }
}

function checkRobloxLink() {
    if (!currentUser) {
        showPage('loginPage');
        playLoginMusic(true);
        return;
    }

    // Berechtigungsprüfung über Gilden-Rollen
    const hasPerm = currentUser.roles && currentUser.roles.some(r => r === SYSTEM_ROLES.regRole || r === SYSTEM_ROLES.unregRole || ADMIN_ROLES.includes(r) || OWNER_ROLES.includes(r));
    if (!hasPerm && currentUser.id !== OWNER_USER_ID) {
        showPage('noPermissionPage');
        playLoginMusic(true);
        return;
    }

    if (!currentUser.roblox) {
        showPage('robloxPage');
        playLoginMusic(true);
        return;
    }

    // Erfolgreich eingeloggt
    showPage('mainContent');
    playLoginMusic(false);
    updateUserHeader();
    setupRoleTabs();
    switchTab('tabBtnSpenden', 'content-spenden');
    startAutoUpdate();
}

function handleLogout() {
    sessionStorage.removeItem('pn_session');
    currentUser = null;
    if (updateTimer) clearInterval(updateTimer);
    showPage('loginPage');
    playLoginMusic(true);
    showNotification("Erfolgreich abgemeldet.", "success");
}

async function handleRobloxLogout() {
    if (!confirm("Möchtest du die Verknüpfung zu Roblox wirklich aufheben?")) return;
    try {
        const res = await fetch(`${WORKER_URL}/roblox-logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discordId: currentUser.id })
        });
        if (res.ok) {
            currentUser.roblox = null;
            sessionStorage.setItem('pn_session', JSON.stringify(currentUser));
            checkRobloxLink();
            showNotification("Roblox-Verknüpfung aufgehoben.", "success");
        }
    } catch (e) { showNotification("Fehler beim Logout.", "error"); }
}

// ==========================================
// 4. UI INTERACTIONS & TABS
// ==========================================

function updateUserHeader() {
    const avatarImg = document.getElementById('userAvatar');
    const welcomeTxt = document.getElementById('userWelcome');
    if (avatarImg && currentUser.avatar) {
        avatarImg.src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
    }
    if (welcomeTxt) {
        welcomeTxt.textContent = `Hi, ${currentUser.global_name || currentUser.username}`;
    }
}

function setupRoleTabs() {
    const isAdmin = currentUser.roles && currentUser.roles.some(r => ADMIN_ROLES.includes(r));
    const isOwner = currentUser.id === OWNER_USER_ID || (currentUser.roles && currentUser.roles.some(r => OWNER_ROLES.includes(r)));

    document.getElementById('tabBtnAdmin')?.classList.toggle('hidden', !isAdmin && !isOwner);
    document.getElementById('tabBtnOwner')?.classList.toggle('hidden', !isOwner);

    const canSubmit = currentUser.roles && currentUser.roles.includes(GP_SUBMIT_ROLE);
    document.getElementById('gpSubmitCard')?.classList.toggle('hidden', !canSubmit);
    document.getElementById('noPermissionCard')?.classList.toggle('hidden', !!canSubmit);
}

function switchTab(activeTabId, contentId) {
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    document.getElementById(activeTabId)?.classList.add('active');

    const contents = ['content-spenden', 'content-leaderboard', 'content-profile', 'content-admin', 'content-owner'];
    contents.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== contentId);
    });

    loadTabContent(contentId);
}

function loadTabContent(contentId) {
    if (contentId === 'content-leaderboard') fetchLeaderboard();
    if (contentId === 'content-profile') fetchProfileHistory();
    if (contentId === 'content-admin') fetchAdminPending();
    if (contentId === 'content-owner') loadOwnerPanelData();
}

function startAutoUpdate() {
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = setInterval(() => {
        const activeTab = document.querySelector('.nav-tab.active');
        if (activeTab) {
            const tabs = {
                'tabBtnSpenden': 'content-spenden',
                'tabBtnLeaderboard': 'content-leaderboard',
                'tabBtnProfile': 'content-profile',
                'tabBtnAdmin': 'content-admin',
                'tabBtnOwner': 'content-owner'
            };
            loadTabContent(tabs[activeTab.id]);
        }
    }, systemConfig.updateInterval * 1000);
}

// ==========================================
// 5. GP SPENDEN & PROOF MANAGEMENT
// ==========================================

function handleFileSelection(e) {
    const files = Array.from(e.target.files);
    const maxFiles = systemConfig.limits.maxImagesPerRequest;

    if (selectedFiles.length + files.length > maxFiles) {
        showNotification(`Maximal ${maxFiles} Bilder erlaubt!`, "error");
        e.target.value = '';
        return;
    }

    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        selectedFiles.push(file);

        const reader = new FileReader();
        reader.onload = (event) => {
            const container = document.getElementById('imagePreviewContainer');
            if (!container) return;

            const div = document.createElement('div');
            div.className = 'img-preview-wrapper';
            div.style.position = 'relative';
            div.style.display = 'inline-block';
            div.style.margin = '5px';
            div.innerHTML = `
                <img src="${event.target.result}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; border: 1px solid #333;">
                <button type="button" class="btn-remove-img" style="position: absolute; top: -5px; right: -5px; background: #f56565; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-weight: bold;">&times;</button>
            `;

            div.querySelector('.btn-remove-img').addEventListener('click', () => {
                selectedFiles = selectedFiles.filter(f => f !== file);
                div.remove();
                updateFileCountText();
            });

            container.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
    updateFileCountText();
    e.target.value = '';
}

function updateFileCountText() {
    const txt = document.getElementById('fileCountText');
    if (txt) txt.textContent = `${selectedFiles.length} Bilder ausgewählt`;
}

async function handleGpSubmit() {
    const amountInput = document.getElementById('gpAmount');
    const amount = parseInt(amountInput?.value);

    if (!amount || amount < 100) {
        showNotification("Mindestbetrag beträgt 100 GP.", "error");
        return;
    }
    if (selectedFiles.length === 0) {
        showNotification("Bitte lade mindestens einen Nachweis hoch.", "error");
        return;
    }

    const btn = document.getElementById('addGPBtn');
    btn.disabled = true;
    btn.textContent = "SENDING PROOF...";

    // Konvertiere Bilder in Base64 Strings zur Übertragung an den Worker
    const base64Promises = selectedFiles.map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target.result);
            reader.readAsDataURL(file);
        });
    });

    const base64Images = await Promise.all(base64Promises);

    try {
        const res = await fetch(`${WORKER_URL}/gp-submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discordId: currentUser.id,
                discordName: currentUser.username,
                robloxName: currentUser.roblox.username,
                amount,
                images: base64Images
            })
        });

        if (res.ok) {
            showNotification("Nachweis eingereicht! Ein Admin prüft deine Anfrage.", "success");
            amountInput.value = '';
            selectedFiles = [];
            const preview = document.getElementById('imagePreviewContainer');
            if (preview) preview.innerHTML = '';
            updateFileCountText();
        } else {
            showNotification("Fehler beim Einreichen.", "error");
        }
    } catch (e) { showNotification("Netzwerkfehler.", "error"); }
    finally {
        btn.disabled = false;
        btn.textContent = "SUBMIT PROOF FOR REVIEW";
    }
}

// ==========================================
// 6. LEADERBOARD & PROFILE HISTORY
// ==========================================

async function fetchLeaderboard() {
    try {
        const res = await fetch(`${WORKER_URL}/leaderboard-data`);
        if (!res.ok) return;
        const data = await res.json();
        fullLeaderboardData = data.leaderboard || [];

        const totalGpStat = document.getElementById('totalGpStat');
        if (totalGpStat) totalGpStat.textContent = (data.totalGp || 0).toLocaleString();

        renderLeaderboard(fullLeaderboardData);
    } catch (e) { console.error(e); }
}

function renderLeaderboard(data) {
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    data.forEach((u, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>#${i + 1}</strong></td>
            <td>${escapeHtml(u.discordName || 'Unbekannt')}</td>
            <td>${escapeHtml(u.robloxName || 'Nicht verknüpft')}</td>
            <td><span style="color: #ffd700; font-weight: bold;">${u.totalGp.toLocaleString()}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function filterLeaderboard(e) {
    const q = e.target.value.toLowerCase();
    const filtered = fullLeaderboardData.filter(u => 
        (u.discordName || '').toLowerCase().includes(q) || 
        (u.robloxName || '').toLowerCase().includes(q)
    );
    renderLeaderboard(filtered);
}

async function fetchProfileHistory() {
    const tbody = document.getElementById('profileHistoryBody');
    if (!tbody) return;

    try {
        const res = await fetch(`${WORKER_URL}/user-history?discordId=${currentUser.id}`);
        if (!res.ok) return;
        const data = await res.json();
        tbody.innerHTML = '';

        if (!data.requests || data.requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#555;">Keine Einträge vorhanden.</td></tr>';
            return;
        }

        data.requests.forEach(r => {
            let color = '#cd7f32';
            if (r.status === 'approved') color = '#48bb78';
            if (r.status === 'rejected') color = '#f56565';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(r.timestamp).toLocaleDateString()}</td>
                <td><strong>${r.amount.toLocaleString()} GP</strong></td>
                <td><span class="status-badge" style="background:${color}; padding:3px 8px; border-radius:6px; font-size:12px; color:white;">${r.status.toUpperCase()}</span></td>
                <td>${escapeHtml(r.comment || '-')}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

// ==========================================
// 7. ADMIN PANEL LOGIC
// ==========================================

async function fetchAdminPending() {
    const tbody = document.getElementById('adminPendingBody');
    if (!tbody) return;

    try {
        const res = await fetch(`${WORKER_URL}/admin/pending-requests`);
        if (!res.ok) return;
        const data = await res.json();
        tbody.innerHTML = '';

        if (!data.pending || data.pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#555;">Keine ausstehenden Anfragen.</td></tr>';
            return;
        }

        data.pending.forEach(req => {
            const tr = document.createElement('tr');
            let imagesHtml = '';
            if (req.images) {
                req.images.forEach((img, idx) => {
                    imagesHtml += `<a href="${img}" target="_blank" style="color:#ffd700; margin-right:10px;"><i class="fas fa-image"></i> Bild ${idx+1}</a>`;
                });
            }

            tr.innerHTML = `
                <td><strong>${escapeHtml(req.discordName)}</strong><br><small style="color:#555;">ID: ${req.id}</small></td>
                <td>${escapeHtml(req.robloxName)}</td>
                <td><strong style="color:#ffd700;">${req.amount.toLocaleString()} GP</strong></td>
                <td>
                    <div style="margin-bottom:8px;">${imagesHtml}</div>
                    <div style="display:flex; gap:6px;">
                        <input type="text" id="admin-comment-${req.requestId}" placeholder="Grund/Kommentar..." style="padding:6px; margin:0; flex:1; font-size:12px;">
                        <button class="btn-approve" data-id="${req.requestId}" style="background:#48bb78; border:none; color:white; padding:5px 10px; cursor:pointer; border-radius:4px;"><i class="fas fa-check"></i></button>
                        <button class="btn-reject" data-id="${req.requestId}" style="background:#f56565; border:none; color:white; padding:5px 10px; cursor:pointer; border-radius:4px;"><i class="fas fa-times"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-approve').forEach(b => b.addEventListener('click', () => handleRequestAction(b.getAttribute('data-id'), 'approve')));
        tbody.querySelectorAll('.btn-reject').forEach(b => b.addEventListener('click', () => handleRequestAction(b.getAttribute('data-id'), 'reject')));

    } catch (e) { console.error(e); }
}

async function handleRequestAction(requestId, action) {
    const comment = document.getElementById(`admin-comment-${requestId}`)?.value || '';
    try {
        const res = await fetch(`${WORKER_URL}/admin/process-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId, action, comment, adminId: currentUser.id })
        });
        if (res.ok) {
            showNotification(`Anfrage erfolgreich ${action === 'approve' ? 'angenommen' : 'abgelehnt'}.`, "success");
            fetchAdminPending();
        }
    } catch (e) { showNotification("Verarbeitungsfehler.", "error"); }
}

// ==========================================
// 8. OWNER PANEL LOGIC
// ==========================================

function loadOwnerPanelData() {
    fetchSystemRolesValues();
    fetchAdminRolesList();
    fetchChannelConfigValues();
    fetchSystemConfigValues();
    fetchTotalUsers();
    fetchSavedMessagesList();
    fetchKickLogsList();
}

// Manual Registration
async function manualRegisterUser() {
    const payload = {
        discordId: document.getElementById('manualDiscordId').value.trim(),
        discordDisplayName: document.getElementById('manualDiscordName').value.trim(),
        discordUsername: document.getElementById('manualDiscordUsername').value.trim(),
        robloxId: document.getElementById('manualRobloxId').value.trim(),
        robloxDisplayName: document.getElementById('manualRobloxName').value.trim(),
        robloxUsername: document.getElementById('manualRobloxUsername').value.trim(),
        initialGp: parseInt(document.getElementById('manualInitialGp').value) || 0
    };

    if (!payload.discordId || !payload.discordUsername || !payload.robloxId || !payload.robloxUsername) {
        setManualResult("Pflichtfelder (*) ausfüllen!", "red");
        return;
    }

    try {
        const res = await fetch(`${WORKER_URL}/owner/register-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            setManualResult("Benutzer erfolgreich registriert!", "#48bb78");
            clearManualForm();
            fetchTotalUsers();
        } else {
            const data = await res.json();
            setManualResult(`Fehler: ${data.error}`, "red");
        }
    } catch (e) { setManualResult("Netzwerkfehler.", "red"); }
}

async function manualCheckUser() {
    const discordId = document.getElementById('manualDiscordId').value.trim();
    if (!discordId) {
        setManualResult("User-ID erforderlich zum Suchen.", "orange");
        return;
    }
    try {
        const res = await fetch(`${WORKER_URL}/owner/get-user?discordId=${discordId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.user) {
                document.getElementById('manualDiscordName').value = data.user.displayName || '';
                document.getElementById('manualDiscordUsername').value = data.user.username || '';
                document.getElementById('manualRobloxId').value = data.user.robloxId || '';
                document.getElementById('manualRobloxName').value = data.user.robloxDisplayName || '';
                document.getElementById('manualRobloxUsername').value = data.user.robloxUsername || '';
                document.getElementById('manualInitialGp').value = data.user.totalGp || 0;
                setManualResult("Benutzerdaten geladen.", "#48bb78");
            }
        } else { setManualResult("Kein Eintrag gefunden.", "orange"); }
    } catch (e) { setManualResult("Fehler beim Abruf.", "red"); }
}

function clearManualForm() {
    ['manualDiscordId', 'manualDiscordName', 'manualDiscordUsername', 'manualRobloxId', 'manualRobloxName', 'manualRobloxUsername'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('manualInitialGp').value = '0';
}

function setManualResult(text, color) {
    const el = document.getElementById('manualRegisterResult');
    if (el) { el.textContent = text; el.style.color = color; }
}

async function syncUserRolesManually() {
    const btn = document.getElementById('syncRolesBtn');
    btn.disabled = true;
    try {
        const res = await fetch(`${WORKER_URL}/owner/sync-roles`, { method: 'POST' });
        if (res.ok) showNotification("Globale Rollen-Synchronisierung gestartet.", "success");
    } catch (e) { showNotification("Fehler beim Trigger.", "error"); }
    finally { btn.disabled = false; }
}

// System Roles Configuration
async function fetchSystemRolesValues() {
    try {
        const res = await fetch(`${WORKER_URL}/owner/get-system-roles`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.roles) {
            document.getElementById('sysRoleReg').value = data.roles.regRole || '';
            document.getElementById('sysRoleUnreg').value = data.roles.unregRole || '';
            document.getElementById('sysRoleGpSubmit').value = data.roles.gpSubmitRole || '';
            document.getElementById('sysRolePending').value = data.roles.pendingRole || '';
        }
    } catch (e) { console.error(e); }
}

async function saveSystemRoles() {
    const payload = {
        regRole: document.getElementById('sysRoleReg').value.trim(),
        unregRole: document.getElementById('sysRoleUnreg').value.trim(),
        gpSubmitRole: document.getElementById('sysRoleGpSubmit').value.trim(),
        pendingRole: document.getElementById('sysRolePending').value.trim()
    };
    try {
        const res = await fetch(`${WORKER_URL}/owner/save-system-roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            SYSTEM_ROLES = payload;
            GP_SUBMIT_ROLE = payload.gpSubmitRole;
            document.getElementById('systemRolesResult').textContent = "Systemrollen gespeichert!";
            showNotification("Systemrollen aktualisiert.", "success");
        }
    } catch (e) { console.error(e); }
}

// Admin / Owner Roles Adding
async function fetchAdminRolesList() {
    const list = document.getElementById('adminRolesList');
    if (!list) return;
    try {
        const res = await fetch(`${WORKER_URL}/owner/get-admin-roles`);
        if (!res.ok) return;
        const data = await res.json();
        list.innerHTML = '';

        const table = document.createElement('table');
        table.className = 'table';
        table.innerHTML = `<thead><tr><th>Role ID</th><th>Level</th><th>Action</th></tr></thead><tbody></tbody>`;
        const tbody = table.querySelector('tbody');

        data.roles.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.id}</td>
                <td><span style="color:${r.level === 'owner' ? '#ffd700' : '#cd7f32'}">${r.level.toUpperCase()}</span></td>
                <td><button class="btn-del-role btn-small" data-id="${r.id}" style="background:red; color:white; border:none; padding:4px; border-radius:4px; cursor:pointer;">Delete</button></td>
            `;
            tbody.appendChild(tr);
        });
        list.appendChild(table);

        tbody.querySelectorAll('.btn-del-role').forEach(b => b.addEventListener('click', () => deleteAdminRole(b.getAttribute('data-id'))));
    } catch (e) { console.error(e); }
}

async function handleAddAdminRole() {
    const roleId = document.getElementById('newRoleId').value.trim();
    const level = document.getElementById('rolePermissionLevel').value;
    if (!roleId) return;

    try {
        const res = await fetch(`${WORKER_URL}/owner/add-admin-role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId, level })
        });
        if (res.ok) {
            document.getElementById('newRoleId').value = '';
            fetchAdminRolesList();
            showNotification("Berechtigung hinzugefügt.", "success");
        }
    } catch (e) { console.error(e); }
}

async function deleteAdminRole(roleId) {
    if (!confirm("Rolle löschen?")) return;
    try {
        const res = await fetch(`${WORKER_URL}/owner/delete-admin-role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId })
        });
        if (res.ok) fetchAdminRolesList();
    } catch (e) { console.error(e); }
}

// Channel Configurations
async function fetchChannelConfigValues() {
    const container = document.getElementById('channelConfigList');
    if (!container) return;
    try {
        const res = await fetch(`${WORKER_URL}/owner/get-channels`);
        if (!res.ok) return;
        const data = await res.json();
        container.innerHTML = '';

        const keys = [
            { id: 'gpLogs', label: '📜 GP Review Logs Channel ID' },
            { id: 'publicLogs', label: '📢 Public Logs / Leaderboard Channel ID' },
            { id: 'errorLogs', label: '⚠️ System Error Logs Channel ID' }
        ];

        keys.forEach(k => {
            const div = document.createElement('div');
            div.className = 'channel-config-input';
            div.style.marginBottom = '12px';
            div.innerHTML = `
                <label style="display:block; font-size:14px; margin-bottom:4px; color:#aaa;">${k.label}</label>
                <input type="text" id="chan-${k.id}" value="${data.channels?.[k.id] || ''}" style="width:100%;">
            `;
            container.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

async function saveChannelConfig() {
    const payload = {
        gpLogs: document.getElementById('chan-gpLogs')?.value.trim() || '',
        publicLogs: document.getElementById('chan-publicLogs')?.value.trim() || '',
        errorLogs: document.getElementById('chan-errorLogs')?.value.trim() || ''
    };
    try {
        const res = await fetch(`${WORKER_URL}/owner/save-channels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) showNotification("Kanalkonfiguration gespeichert.", "success");
    } catch (e) { console.error(e); }
}

// System Configurations
async function fetchSystemConfigValues() {
    try {
        const res = await fetch(`${WORKER_URL}/owner/get-system-config`);
        if (!res.ok) return;
        const data = await res.json();
        const conf = data.config;
        if (conf) {
            if (conf.embedColors) {
                document.getElementById('colorApprove').value = conf.embedColors.approve;
                document.getElementById('colorReject').value = conf.embedColors.reject;
                document.getElementById('colorPending').value = conf.embedColors.pending;
                document.getElementById('colorInfo').value = conf.embedColors.info;
                document.getElementById('colorLeaderboard').value = conf.embedColors.leaderboard;
            }
            document.getElementById('loginMusicUrl').value = conf.musicUrl || '';
            document.getElementById('updateInterval').value = conf.updateInterval || 60;
            document.getElementById('maxImagesPerRequest').value = conf.limits?.maxImagesPerRequest || 3;
        }
    } catch (e) { console.error(e); }
}

async function saveSystemConfig() {
    const payload = {
        embedColors: {
            approve: document.getElementById('colorApprove').value,
            reject: document.getElementById('colorReject').value,
            pending: document.getElementById('colorPending').value,
            info: document.getElementById('colorInfo').value,
            leaderboard: document.getElementById('colorLeaderboard').value
        },
        musicUrl: document.getElementById('loginMusicUrl').value.trim(),
        updateInterval: parseInt(document.getElementById('updateInterval').value) || 60,
        limits: {
            maxImagesPerRequest: parseInt(document.getElementById('maxImagesPerRequest').value) || 3
        }
    };
    try {
        const res = await fetch(`${WORKER_URL}/owner/save-system-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            systemConfig = payload;
            showNotification("Systemkonfiguration aktualisiert.", "success");
            startAutoUpdate();
        }
    } catch (e) { console.error(e); }
}

async function fetchTotalUsers() {
    try {
        const res = await fetch(`${WORKER_URL}/owner/total-users-count`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('statTotalUsers').textContent = data.count || 0;
        }
    } catch (e) { console.error(e); }
}

// Message Builder / Vorlagen System
async function fetchSavedMessagesList() {
    const list = document.getElementById('savedMessagesList');
    if (!list) return;
    try {
        const res = await fetch(`${WORKER_URL}/owner/get-messages`);
        if (!res.ok) return;
        const data = await res.json();
        list.innerHTML = '';

        if (!data.messages || data.messages.length === 0) {
            list.innerHTML = '<p style="color:#555; text-align:center;">Keine gespeicherten Vorlagen.</p>';
            return;
        }

        data.messages.forEach(m => {
            const div = document.createElement('div');
            div.className = 'system-card';
            div.style.marginBottom = '10px';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.innerHTML = `
                <div><strong>${escapeHtml(m.name)}</strong><br><small style="color:#555;">Kanal: ${m.channelId}</small></div>
                <div style="display:flex; gap:6px;">
                    <button class="btn-load btn-small" data-id="${m.id}" style="background:#5865F2; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Load</button>
                    <button class="btn-del-msg btn-small" data-id="${m.id}" style="background:red; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Delete</button>
                </div>
            `;
            list.appendChild(div);
        });

        list.querySelectorAll('.btn-load').forEach(b => b.addEventListener('click', () => loadMessageIntoForm(b.getAttribute('data-id'), data.messages)));
        list.querySelectorAll('.btn-del-msg').forEach(b => b.addEventListener('click', () => deleteSavedMessage(b.getAttribute('data-id'))));
    } catch (e) { console.error(e); }
}

function loadMessageIntoForm(id, messages) {
    const m = messages.find(msg => msg.id === id);
    if (!m) return;
    activeMessageId = m.id;
    document.getElementById('messageName').value = m.name || '';
    document.getElementById('messageChannelId').value = m.channelId || '';
    document.getElementById('messageContent').value = m.content || '';
    document.getElementById('messageEmbedTitle').value = m.embedTitle || '';
    document.getElementById('messageEmbedDesc').value = m.embedDesc || '';
    document.getElementById('messageEmbedColor').value = m.embedColor || '#5865F2';
    showNotification("Vorlage geladen.", "info");
}

function clearMessageForm() {
    activeMessageId = null;
    ['messageName', 'messageChannelId', 'messageContent', 'messageEmbedTitle', 'messageEmbedDesc'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('messageEmbedColor').value = '#5865F2';
}

function getMessageFormData() {
    return {
        id: activeMessageId,
        name: document.getElementById('messageName').value.trim(),
        channelId: document.getElementById('messageChannelId').value.trim(),
        content: document.getElementById('messageContent').value.trim(),
        embedTitle: document.getElementById('messageEmbedTitle').value.trim(),
        embedDesc: document.getElementById('messageEmbedDesc').value.trim(),
        embedColor: document.getElementById('messageEmbedColor').value
    };
}

async function handleSaveMessage() {
    const payload = getMessageFormData();
    if (!payload.name || !payload.channelId) return;
    try {
        const res = await fetch(`${WORKER_URL}/owner/save-message-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            clearMessageForm();
            fetchSavedMessagesList();
            showNotification("Vorlage erfolgreich gespeichert.", "success");
        }
    } catch (e) { console.error(e); }
}

async function handleSendMessage() {
    const payload = getMessageFormData();
    if (!payload.channelId) return;
    try {
        const res = await fetch(`${WORKER_URL}/owner/send-custom-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showNotification("Nachricht erfolgreich an Bot übermittelt!", "success");
            clearMessageForm();
        }
    } catch (e) { console.error(e); }
}

async function deleteSavedMessage(id) {
    if (!confirm("Vorlage löschen?")) return;
    try {
        const res = await fetch(`${WORKER_URL}/owner/delete-message-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        if (res.ok) fetchSavedMessagesList();
    } catch (e) { console.error(e); }
}

// Kick Logs History
async function fetchKickLogsList() {
    const tbody = document.getElementById('kickLogsBody');
    if (!tbody) return;
    try {
        const res = await fetch(`${WORKER_URL}/owner/get-kick-logs`);
        if (!res.ok) return;
        const data = await res.json();
        tbody.innerHTML = '';

        if (!data.logs || data.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#555;">Keine Kick-Logs vorhanden.</td></tr>';
            return;
        }

        data.logs.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(l.timestamp).toLocaleString()}</td>
                <td><strong>${escapeHtml(l.targetUser)}</strong><br><small style="color:#555;">${l.targetId}</small></td>
                <td>${escapeHtml(l.executorUser)}</td>
                <td>${escapeHtml(l.reason || 'Kein Grund')}</td>
                <td>${l.dmSent ? '<span style="color:#48bb78;">Ja</span>' : '<span style="color:#f56565;">Nein</span>'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

// Maintenance & Test Mode Toggles
async function setMaintenanceMode(enable) {
    try {
        const res = await fetch(`${WORKER_URL}/owner/toggle-maintenance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: enable })
        });
        if (res.ok) {
            document.getElementById('maintenanceStatusText').textContent = enable ? "Enabled" : "Disabled";
            document.getElementById('maintenanceStatusText').style.color = enable ? "#f56565" : "#48bb78";
            document.getElementById('maintenanceOverlay').classList.toggle('hidden', !enable);
            showNotification(`Wartungsmodus ${enable ? 'aktiviert' : 'deaktiviert'}.`, "info");
        }
    } catch (e) { console.error(e); }
}

async function setTestMode(enable) {
    try {
        const res = await fetch(`${WORKER_URL}/owner/toggle-testmode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: enable })
        });
        if (res.ok) {
            document.getElementById('testModeStatusText').textContent = enable ? "Enabled" : "Disabled";
            document.getElementById('testModeStatusText').style.color = enable ? "#f56565" : "#48bb78";
            document.getElementById('testModeIndicator').classList.toggle('hidden', !enable);
            showNotification(`Testmodus ${enable ? 'aktiviert' : 'deaktiviert'}.`, "info");
        }
    } catch (e) { console.error(e); }
}

// ==========================================
// 9. EVENT LISTENERS INITIALIZATION
// ==========================================

function initEventListeners() {
    // Auth Toggles
    document.getElementById('discordLoginBtn')?.addEventListener('click', redirectToDiscord);
    document.getElementById('robloxLoginBtn')?.addEventListener('click', redirectToRoblox);
    document.getElementById('rbxLogoutBtn')?.addEventListener('click', handleRobloxLogout);
    document.getElementById('dcLogoutBtn')?.addEventListener('click', handleLogout);

    // Navigation Tabs Binding
    const tabsMap = {
        'tabBtnSpenden': 'content-spenden',
        'tabBtnLeaderboard': 'content-leaderboard',
        'tabBtnProfile': 'content-profile',
        'tabBtnAdmin': 'content-admin',
        'tabBtnOwner': 'content-owner'
    };
    Object.keys(tabsMap).forEach(btnId => {
        document.getElementById(btnId)?.addEventListener('click', () => switchTab(btnId, tabsMap[btnId]));
    });

    // GP Submission Inputs
    document.getElementById('proofImage')?.addEventListener('change', handleFileSelection);
    document.getElementById('addGPBtn')?.addEventListener('click', handleGpSubmit);

    // Leaderboard Filter
    document.getElementById('leaderboardSearch')?.addEventListener('input', filterLeaderboard);

    // Owner Setup Actions
    document.getElementById('manualRegisterBtn')?.addEventListener('click', manualRegisterUser);
    document.getElementById('manualCheckUserBtn')?.addEventListener('click', manualCheckUser);
    document.getElementById('manualClearFormBtn')?.addEventListener('click', clearManualForm);
    document.getElementById('syncRolesBtn')?.addEventListener('click', syncUserRolesManually);
    document.getElementById('saveSystemRolesBtn')?.addEventListener('click', saveSystemRoles);
    document.getElementById('addRoleBtn')?.addEventListener('click', handleAddAdminRole);
    document.getElementById('saveChannelConfigBtn')?.addEventListener('click', saveChannelConfig);
    document.getElementById('saveSystemConfigBtn')?.addEventListener('click', saveSystemConfig);
    document.getElementById('refreshUsersBtn')?.addEventListener('click', fetchTotalUsers);

    // Custom Messages Builder
    document.getElementById('saveMessageBtn')?.addEventListener('click', handleSaveMessage);
    document.getElementById('sendMessageBtn')?.addEventListener('click', handleSendMessage);
    document.getElementById('clearMessageFormBtn')?.addEventListener('click', clearMessageForm);

    // System Status Triggers
    document.getElementById('enableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(true));
    document.getElementById('disableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(false));
    document.getElementById('enableTestModeBtn')?.addEventListener('click', () => setTestMode(true));
    document.getElementById('disableTestModeBtn')?.addEventListener('click', () => setTestMode(false));
}

// ==========================================
// 10. SYSTEM ENTRY POINT (INIT)
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
                if (!currentUser.id) throw new Error("Defekte Session-Daten");
                checkRobloxLink();
            } catch (e) {
                sessionStorage.removeItem('pn_session');
                playLoginMusic(true);
            }
        } else {
            playLoginMusic(true);
        }
    }
}

// Start app
init();
