// ==========================================
// SWORD ART ONLINE - GP PANEL V2
// ==========================================

// ========== CONFIGURATION ==========
const CONFIG = {
    DISCORD_CLIENT_ID: '1503179151073345678',
    ROBLOX_CLIENT_ID: '1529843549493669743',
    BACKEND_URL: 'https://gentle-queen-63f0.keulecolin2005.workers.dev',
    REDIRECT_URI: 'https://corleonecity.github.io/SwordArtOnline/',
    OWNER_ID: '917426398120005653'
};

// Global state
let currentUser = null;
let userRoles = [];
let selectedFiles = [];
let testMode = false;
let allUsers = {};
let systemConfig = {
    embedColors: { approve: '#48bb78', reject: '#f56565', pending: '#cd7f32', info: '#5865f2' },
    maxImages: 3
};

// Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, onValue, get, set, update, push, remove } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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

// ========== UTILITIES ==========
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getDbKey(username) {
    return username ? username.replace(/[.#$\[\]]/g, '_') : 'unknown';
}

// ========== PERMISSIONS ==========
function hasPermission(requiredRoles = []) {
    if (!currentUser) return false;
    if (currentUser.id === CONFIG.OWNER_ID) return true;
    return requiredRoles.some(role => userRoles.includes(role));
}

function canSubmitGP() {
    const gpSubmitRole = document.getElementById('gpSubmitRoleId')?.value || '';
    return hasPermission([gpSubmitRole]);
}

// ========== UI HELPERS ==========
function showScreen(screenName) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('robloxScreen').classList.add('hidden');
    document.getElementById('noPermScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    
    document.getElementById(screenName).classList.remove('hidden');
}

function switchTab(tabId) {
    // Hide all tabs
    document.getElementById('donateTab').classList.add('hidden');
    document.getElementById('leaderboardTab').classList.add('hidden');
    document.getElementById('profileTab').classList.add('hidden');
    document.getElementById('adminTab').classList.add('hidden');
    document.getElementById('ownerTab').classList.add('hidden');
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabId).classList.remove('hidden');
    
    // Add active class to corresponding button
    const tabMap = {
        'donateTab': 'tabDonate',
        'leaderboardTab': 'TabLeaderboard',
        'profileTab': 'tabProfile',
        'adminTab': 'tabAdmin',
        'ownerTab': 'tabOwner'
    };
    
    const btnId = tabMap[tabId];
    if (btnId) {
        document.getElementById(btnId).classList.add('active');
    }
    
    // Refresh data when switching tabs
    if (tabId === 'leaderboardTab') loadLeaderboard();
    if (tabId === 'profileTab') loadProfile();
    if (tabId === 'adminTab') loadPendingRequests();
    if (tabId === 'ownerTab') {
        loadRolesList();
        loadChannelsConfig();
        loadKickLogs();
    }
}

// ========== DISCORD & ROBLOX AUTH ==========
async function handleDiscordLogin(code) {
    try {
        const res = await fetch(`${CONFIG.BACKEND_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: CONFIG.REDIRECT_URI })
        });
        
        const data = await res.json();
        
        if (!data.isAuthorized || !data.isMember) {
            showScreen('noPermScreen');
            return;
        }
        
        currentUser = data.user;
        sessionStorage.setItem('sao_user', JSON.stringify(currentUser));
        window.history.replaceState({}, '', CONFIG.REDIRECT_URI);
        
        // Check if Roblox is linked
        const dbKey = getDbKey(currentUser.username);
        const snap = await get(ref(db, `users/${dbKey}`));
        
        if (snap.exists() && snap.val().robloxId) {
            await loadUserRoles();
            showDashboard();
        } else {
            showScreen('robloxScreen');
        }
        
    } catch (error) {
        console.error('Discord login error:', error);
        showToast('Login fehlgeschlagen!', 'error');
    }
}

async function handleRobloxLogin(code) {
    try {
        const savedUser = sessionStorage.getItem('sao_user');
        if (!savedUser) {
            showScreen('loginScreen');
            return;
        }
        
        currentUser = JSON.parse(savedUser);
        
        const res = await fetch(`${CONFIG.BACKEND_URL}/roblox-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: CONFIG.REDIRECT_URI })
        });
        
        const data = await res.json();
        
        if (data.success && data.robloxUser) {
            const robloxName = data.robloxUser.nickname || data.robloxUser.name;
            const robloxUsername = data.robloxUser.preferred_username || data.robloxUser.name;
            const robloxId = data.robloxUser.sub;
            const discordName = currentUser.global_name || currentUser.username;
            
            const dbKey = getDbKey(currentUser.username);
            const userRef = ref(db, `users/${dbKey}`);
            const snap = await get(userRef);
            const currentGP = snap.exists() ? snap.val().totalGP || 0 : 0;
            
            await set(userRef, {
                discordName: discordName,
                discordUsername: currentUser.username,
                robloxName: robloxName,
                robloxUsername: robloxUsername,
                robloxId: robloxId,
                totalGP: currentGP,
                id: currentUser.id,
                hasLeftServer: false,
                lastLogin: Date.now()
            });
            
            await loadUserRoles();
            showDashboard();
            showToast('Roblox erfolgreich verbunden!', 'success');
        }
        
    } catch (error) {
        console.error('Roblox login error:', error);
        showToast('Roblox Verbindung fehlgeschlagen!', 'error');
    }
}

async function loadUserRoles() {
    if (!currentUser) return;
    
    try {
        const res = await fetch(`${CONFIG.BACKEND_URL}/user-roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        
        if (res.ok) {
            const data = await res.json();
            userRoles = data.roles || [];
        }
    } catch (error) {
        console.error('Error loading roles:', error);
        userRoles = [];
    }
    
    updateUIByPermissions();
}

function updateUIByPermissions() {
    const isAdmin = hasPermission([]) && (currentUser?.id === CONFIG.OWNER_ID || userRoles.some(r => r === '1503609455466643547'));
    const isOwner = currentUser?.id === CONFIG.OWNER_ID;
    
    const adminTab = document.getElementById('tabAdmin');
    const ownerTab = document.getElementById('tabOwner');
    const noPermWarning = document.getElementById('noPermWarning');
    const donateForm = document.getElementById('donateForm');
    
    if (adminTab) adminTab.classList.toggle('hidden', !isAdmin);
    if (ownerTab) ownerTab.classList.toggle('hidden', !isOwner);
    
    if (!canSubmitGP()) {
        if (noPermWarning) noPermWarning.classList.remove('hidden');
        if (donateForm) donateForm.classList.add('hidden');
    } else {
        if (noPermWarning) noPermWarning.classList.add('hidden');
        if (donateForm) donateForm.classList.remove('hidden');
    }
}

// ========== DASHBOARD ==========
function showDashboard() {
    showScreen('mainApp');
    
    // Update header
    document.getElementById('userName').textContent = currentUser.global_name || currentUser.username;
    document.getElementById('userDiscordTag').textContent = `@${currentUser.username}`;
    
    if (currentUser.avatar) {
        document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
    }
    
    // Load all data
    loadLeaderboard();
    loadProfile();
    loadSystemConfig();
    loadTestMode();
    loadMaintenanceStatus();
    
    // Default tab
    switchTab('donateTab');
}

// ========== LEADERBOARD ==========
async function loadLeaderboard() {
    const usersRef = ref(db, 'users');
    onValue(usersRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        allUsers = data;
        renderLeaderboard();
    });
}

function renderLeaderboard() {
    const searchTerm = document.getElementById('leaderboardSearch')?.value.toLowerCase() || '';
    const tbody = document.getElementById('leaderboardBody');
    
    let usersArray = Object.values(allUsers)
        .filter(u => u.totalGP && u.totalGP > 0)
        .sort((a, b) => b.totalGP - a.totalGP);
    
    if (searchTerm) {
        usersArray = usersArray.filter(u => 
            (u.discordName?.toLowerCase().includes(searchTerm)) ||
            (u.discordUsername?.toLowerCase().includes(searchTerm)) ||
            (u.robloxName?.toLowerCase().includes(searchTerm))
        );
    }
    
    if (usersArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Keine GP gefunden</td></tr>';
        document.getElementById('totalGP').textContent = '0';
        return;
    }
    
    let totalGP = 0;
    tbody.innerHTML = usersArray.map((u, i) => {
        totalGP += u.totalGP;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        return `
            <tr>
                <td>${medal}</td>
                <td><strong>${escapeHtml(u.discordName || '?')}</strong><br><small>@${escapeHtml(u.discordUsername || '?')}</small></td>
                <td>${escapeHtml(u.robloxName || '?')}<br><small>@${escapeHtml(u.robloxUsername || '?')}</small></td>
                <td class="stats-value" style="font-size:1rem">${u.totalGP.toLocaleString()} GP</td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('totalGP').textContent = totalGP.toLocaleString();
}

// ========== PROFILE ==========
function loadProfile() {
    const requestsRef = ref(db, 'requests');
    onValue(requestsRef, (snapshot) => {
        const data = snapshot.val();
        const tbody = document.getElementById('profileBody');
        
        if (!data || !currentUser) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Keine Anträge</td></tr>';
            return;
        }
        
        const userRequests = Object.values(data)
            .filter(r => r.userId === currentUser.id)
            .sort((a, b) => b.timestamp - a.timestamp);
        
        if (userRequests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Keine Anträge</td></tr>';
            return;
        }
        
        tbody.innerHTML = userRequests.map(req => {
            let statusClass = 'status-pending';
            let statusText = '⏳ Ausstehend';
            
            if (req.status === 'approved') {
                statusClass = 'status-approved';
                statusText = '✅ Genehmigt';
            } else if (req.status === 'rejected') {
                statusClass = 'status-rejected';
                statusText = '❌ Abgelehnt';
            }
            
            const date = new Date(req.timestamp).toLocaleDateString('de-DE');
            
            return `
                <tr>
                    <td>${date}</td>
                    <td><strong>+${req.amount.toLocaleString()} GP</strong></td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                    <td>${escapeHtml(req.adminComment || '-')}</td>
                </tr>
            `;
        }).join('');
    });
}

// ========== GP SUBMIT ==========
async function submitGP() {
    if (!canSubmitGP()) {
        showToast('Keine Berechtigung für GP-Anträge!', 'error');
        return;
    }
    
    const amount = parseInt(document.getElementById('amount').value);
    
    if (isNaN(amount) || amount <= 0) {
        showToast('Bitte einen gültigen Betrag eingeben!', 'error');
        return;
    }
    
    if (selectedFiles.length === 0) {
        showToast('Bitte mindestens einen Screenshot hochladen!', 'error');
        return;
    }
    
    const maxImages = parseInt(document.getElementById('maxImages')?.value) || systemConfig.maxImages;
    if (selectedFiles.length > maxImages) {
        showToast(`Maximal ${maxImages} Bilder erlaubt!`, 'error');
        return;
    }
    
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wird gesendet...';
    
    try {
        const dbKey = getDbKey(currentUser.username);
        const userSnap = await get(ref(db, `users/${dbKey}`));
        const userData = userSnap.val() || {};
        
        const requestData = {
            dbKey: dbKey,
            userId: currentUser.id,
            discordName: currentUser.global_name || currentUser.username,
            discordUsername: currentUser.username,
            robloxName: userData.robloxName || '?',
            robloxUsername: userData.robloxUsername || '?',
            robloxId: userData.robloxId || '1',
            amount: amount,
            status: 'pending',
            timestamp: Date.now()
        };
        
        const newReqRef = push(ref(db, 'requests'));
        const requestId = newReqRef.key;
        await set(newReqRef, { ...requestData, id: requestId });
        
        // Send to Discord
        const formData = new FormData();
        const adminRoles = await getAdminRolesFromFB();
        const adminRoleId = adminRoles[0] || '1503609455466643547';
        
        const embed = {
            title: "💎 Neue GP Spende",
            color: parseInt(systemConfig.embedColors.pending.replace('#', ''), 16),
            fields: [
                { name: "💬 Discord", value: `<@${currentUser.id}>`, inline: true },
                { name: "🎮 Roblox", value: userData.robloxName || '?', inline: true },
                { name: "💰 Betrag", value: `+${amount.toLocaleString()} GP`, inline: false },
                { name: "🆔 ID", value: `\`${requestId}\``, inline: true }
            ],
            timestamp: new Date().toISOString()
        };
        
        const components = [{
            type: 1,
            components: [
                { type: 2, style: 3, label: "✅ Genehmigen", custom_id: `approve_${requestId}` },
                { type: 2, style: 4, label: "❌ Ablehnen", custom_id: `reject_${requestId}` }
            ]
        }];
        
        formData.append('payload_json', JSON.stringify({
            content: `<@&${adminRoleId}>`,
            embeds: [embed],
            components: components
        }));
        
        for (let i = 0; i < selectedFiles.length; i++) {
            formData.append(`file${i}`, selectedFiles[i], `proof_${i+1}.png`);
        }
        
        const res = await fetch(`${CONFIG.BACKEND_URL}/send-gp-request-with-buttons`, {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.messageId) {
                await update(ref(db, `requests/${requestId}`), { discordMessageId: data.messageId });
            }
            showToast('GP Antrag erfolgreich eingereicht!', 'success');
            
            // Reset form
            document.getElementById('amount').value = '';
            selectedFiles = [];
            updatePreview();
            switchTab('profileTab');
        } else {
            showToast('Antrag gespeichert, aber Discord Benachrichtigung fehlgeschlagen', 'warning');
        }
        
    } catch (error) {
        console.error('Submit error:', error);
        showToast('Fehler beim Senden des Antrags!', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Antrag abschicken';
    }
}

async function getAdminRolesFromFB() {
    const snap = await get(ref(db, 'config/admin_roles'));
    const data = snap.val();
    return data?.adminRoles || [];
}

// ========== IMAGE PREVIEW ==========
function updatePreview() {
    const container = document.getElementById('previewContainer');
    const fileCount = document.getElementById('fileCount');
    
    fileCount.textContent = `${selectedFiles.length} Datei(en)`;
    
    container.innerHTML = selectedFiles.map((file, index) => `
        <div class="preview-item">
            <img src="${URL.createObjectURL(file)}" alt="Preview">
            <button onclick="removeFile(${index})">×</button>
        </div>
    `).join('');
}

window.removeFile = (index) => {
    selectedFiles.splice(index, 1);
    updatePreview();
};

document.getElementById('fileInput')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const maxImages = parseInt(document.getElementById('maxImages')?.value) || systemConfig.maxImages;
    
    if (selectedFiles.length + files.length > maxImages) {
        showToast(`Maximal ${maxImages} Bilder erlaubt!`, 'error');
        return;
    }
    
    selectedFiles = [...selectedFiles, ...files];
    updatePreview();
    e.target.value = '';
});

// ========== ADMIN FUNCTIONS ==========
function loadPendingRequests() {
    const requestsRef = ref(db, 'requests');
    onValue(requestsRef, (snapshot) => {
        const data = snapshot.val();
        const tbody = document.getElementById('adminBody');
        
        if (!data) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Keine ausstehenden Anträge</td></tr>';
            return;
        }
        
        const pending = Object.values(data).filter(r => r.status === 'pending');
        
        if (pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Keine ausstehenden Anträge</td></tr>';
            return;
        }
        
        tbody.innerHTML = pending.map(req => `
            <tr>
                <td><strong>${escapeHtml(req.discordName)}</strong><br><small>@${escapeHtml(req.discordUsername)}</small></td>
                <td>${escapeHtml(req.robloxName)}</td>
                <td class="stats-value" style="color:var(--warning)">+${req.amount.toLocaleString()} GP</td>
                <td>
                    <div style="display:flex;flex-direction:column;gap:0.5rem">
                        <input type="text" id="comment_${req.id}" placeholder="Kommentar (optional)" style="font-size:0.75rem">
                        <div style="display:flex;gap:0.5rem">
                            <button class="btn btn-secondary" style="padding:0.25rem 0.75rem;background:var(--success)" onclick="processRequest('${req.id}', 'approve')">
                                ✅ Ja
                            </button>
                            <button class="btn btn-secondary" style="padding:0.25rem 0.75rem;background:var(--danger)" onclick="processRequest('${req.id}', 'reject')">
                                ❌ Nein
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    });
}

window.processRequest = async (requestId, action) => {
    const commentInput = document.getElementById(`comment_${requestId}`);
    const comment = commentInput?.value || '';
    
    if (testMode) {
        showToast(`🔬 TESTMODUS: ${action === 'approve' ? 'Genehmigt' : 'Abgelehnt'} (simuliert)`, 'warning');
        await update(ref(db, `requests/${requestId}`), {
            status: action === 'approve' ? 'approved' : 'rejected',
            adminComment: comment,
            processedAt: Date.now(),
            testMode: true
        });
        return;
    }
    
    if (!confirm(`${action === 'approve' ? 'Genehmigen' : 'Ablehnen'}?${comment ? `\n\nKommentar: ${comment}` : ''}`)) return;
    
    try {
        const reqSnap = await get(ref(db, `requests/${requestId}`));
        const reqData = reqSnap.val();
        
        if (!reqData) {
            showToast('Antrag nicht gefunden!', 'error');
            return;
        }
        
        await update(ref(db, `requests/${requestId}`), {
            status: action === 'approve' ? 'approved' : 'rejected',
            adminComment: comment,
            processedAt: Date.now(),
            processedBy: currentUser.id
        });
        
        if (action === 'approve') {
            const userSnap = await get(ref(db, `users/${reqData.dbKey}`));
            const currentGP = userSnap.val()?.totalGP || 0;
            const newGP = currentGP + reqData.amount;
            await update(ref(db, `users/${reqData.dbKey}`), { totalGP: newGP });
        }
        
        showToast(`Antrag ${action === 'approve' ? 'genehmigt' : 'abgelehnt'}!`, 'success');
        
    } catch (error) {
        console.error('Process error:', error);
        showToast('Fehler bei der Verarbeitung!', 'error');
    }
};

// ========== OWNER FUNCTIONS ==========
async function loadRolesList() {
    const container = document.getElementById('rolesList');
    const snap = await get(ref(db, 'config/admin_roles'));
    const data = snap.val() || { adminRoles: [], ownerRoles: [] };
    
    const adminRoles = data.adminRoles || [];
    const ownerRoles = data.ownerRoles || [];
    
    let html = '';
    
    for (const role of adminRoles) {
        html += `
            <div class="role-item">
                <div><span class="role-name">Admin Rolle</span><br><code class="role-id">${role}</code></div>
                <button class="remove-role" onclick="removeRole('${role}', 'admin')">Entfernen</button>
            </div>
        `;
    }
    
    for (const role of ownerRoles) {
        html += `
            <div class="role-item">
                <div><span class="role-name">Owner Rolle</span><br><code class="role-id">${role}</code></div>
                <button class="remove-role" onclick="removeRole('${role}', 'owner')">Entfernen</button>
            </div>
        `;
    }
    
    if (html === '') html = '<p class="text-center">Keine Rollen konfiguriert</p>';
    container.innerHTML = html;
}

window.removeRole = async (roleId, type) => {
    const snap = await get(ref(db, 'config/admin_roles'));
    const data = snap.val() || { adminRoles: [], ownerRoles: [] };
    
    if (type === 'admin') {
        data.adminRoles = data.adminRoles.filter(r => r !== roleId);
    } else {
        data.ownerRoles = data.ownerRoles.filter(r => r !== roleId);
    }
    
    await set(ref(db, 'config/admin_roles'), data);
    showToast('Rolle entfernt!', 'success');
    loadRolesList();
};

window.addRole = async () => {
    const roleId = document.getElementById('newRoleId').value.trim();
    const roleType = document.getElementById('roleType').value;
    
    if (!roleId) {
        showToast('Bitte eine Rollen-ID eingeben!', 'error');
        return;
    }
    
    const snap = await get(ref(db, 'config/admin_roles'));
    const data = snap.val() || { adminRoles: [], ownerRoles: [] };
    
    if (roleType === 'admin' && !data.adminRoles.includes(roleId)) {
        data.adminRoles.push(roleId);
    } else if (roleType === 'owner' && !data.ownerRoles.includes(roleId)) {
        data.ownerRoles.push(roleId);
    }
    
    await set(ref(db, 'config/admin_roles'), data);
    showToast('Rolle hinzugefügt!', 'success');
    document.getElementById('newRoleId').value = '';
    loadRolesList();
    loadUserRoles();
};

async function loadChannelsConfig() {
    const container = document.getElementById('channelsList');
    const snap = await get(ref(db, 'config/channels'));
    const config = snap.val() || {};
    
    const channels = [
        { key: 'CH_GP_REQUESTS', name: 'GP Anträge Channel', desc: 'Neue GP Anträge werden hier gepostet' },
        { key: 'CH_GP_PROCESSED', name: 'GP Verarbeitet Channel', desc: 'Genehmigte/Abgelehnte Anträge' },
        { key: 'CH_LOGIN_LOGS', name: 'Login Logs', desc: 'Benutzer Login Benachrichtigungen' },
        { key: 'CH_LEAVE_LOGS', name: 'Leave Logs', desc: 'Benutzer verlassen Benachrichtigungen' },
        { key: 'CH_USER_INFO', name: 'User Info Board', desc: 'Mitglieder Info Board' },
        { key: 'CH_PANEL_INFO', name: 'Panel Info Board', desc: 'Registration Info Board' },
        { key: 'CH_LEADERBOARD', name: 'Leaderboard Channel', desc: 'GP Leaderboard' }
    ];
    
    container.innerHTML = channels.map(ch => `
        <div class="channel-item">
            <label class="channel-label">${ch.name}</label>
            <div class="channel-desc">${ch.desc}</div>
            <input type="text" id="ch_${ch.key}" placeholder="Channel ID" value="${config[ch.key] || ''}">
        </div>
    `).join('');
}

async function saveChannels() {
    const channels = ['CH_GP_REQUESTS', 'CH_GP_PROCESSED', 'CH_LOGIN_LOGS', 'CH_LEAVE_LOGS', 'CH_USER_INFO', 'CH_PANEL_INFO', 'CH_LEADERBOARD'];
    const newConfig = {};
    
    for (const ch of channels) {
        const input = document.getElementById(`ch_${ch}`);
        if (input && input.value.trim()) {
            newConfig[ch] = input.value.trim();
        }
    }
    
    await set(ref(db, 'config/channels'), newConfig);
    showToast('Channel Konfiguration gespeichert!', 'success');
}

async function loadKickLogs() {
    const logsRef = ref(db, 'logs/kicks');
    onValue(logsRef, (snapshot) => {
        const data = snapshot.val();
        const tbody = document.getElementById('kickLogsBody');
        
        if (!data) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center">Keine Logs</td></tr>';
            return;
        }
        
        const logs = Object.values(data).sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
        
        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${new Date(log.timestamp).toLocaleDateString('de-DE')}</td>
                <td>${escapeHtml(log.kickedUserName || log.kickedUserId)}</td>
                <td>${escapeHtml(log.reason || '-')}</td>
            </tr>
        `).join('');
    });
}

async function saveSystemConfig() {
    const newConfig = {
        embedColors: {
            approve: document.getElementById('colorApprove').value,
            reject: document.getElementById('colorReject').value,
            pending: document.getElementById('colorPending').value
        },
        maxImages: parseInt(document.getElementById('maxImages').value)
    };
    
    await set(ref(db, 'config/system'), newConfig);
    systemConfig = newConfig;
    showToast('System Konfiguration gespeichert!', 'success');
}

async function loadSystemConfig() {
    const snap = await get(ref(db, 'config/system'));
    const data = snap.val();
    if (data) {
        systemConfig = data;
        if (document.getElementById('colorApprove')) {
            document.getElementById('colorApprove').value = data.embedColors?.approve || '#48bb78';
            document.getElementById('colorReject').value = data.embedColors?.reject || '#f56565';
            document.getElementById('colorPending').value = data.embedColors?.pending || '#cd7f32';
            document.getElementById('maxImages').value = data.maxImages || 3;
        }
    }
}

async function saveGpSubmitRole() {
    const roleId = document.getElementById('gpSubmitRoleId').value.trim();
    if (!roleId) {
        showToast('Bitte eine Rollen-ID eingeben!', 'error');
        return;
    }
    
    await set(ref(db, 'config/system/gpSubmitRole'), roleId);
    showToast('GP Submit Rolle gespeichert!', 'success');
    updateUIByPermissions();
}

async function loadGpSubmitRole() {
    const snap = await get(ref(db, 'config/system/gpSubmitRole'));
    if (snap.exists() && document.getElementById('gpSubmitRoleId')) {
        document.getElementById('gpSubmitRoleId').value = snap.val();
    }
}

async function loadTestMode() {
    const snap = await get(ref(db, 'config/testMode'));
    if (snap.exists()) {
        testMode = snap.val().enabled === true;
        const badge = document.getElementById('testModeBadge');
        const statusSpan = document.getElementById('testModeStatus');
        
        if (testMode) {
            badge.classList.remove('hidden');
            if (statusSpan) statusSpan.innerHTML = '<strong style="color:var(--warning)">Aktiv</strong>';
        } else {
            badge.classList.add('hidden');
            if (statusSpan) statusSpan.innerHTML = '<strong>Inaktiv</strong>';
        }
    }
}

async function setTestMode(enabled) {
    await set(ref(db, 'config/testMode'), { enabled });
    testMode = enabled;
    loadTestMode();
    showToast(`Testmodus ${enabled ? 'aktiviert' : 'deaktiviert'}!`, enabled ? 'warning' : 'success');
}

async function loadMaintenanceStatus() {
    const snap = await get(ref(db, 'config/maintenance'));
    const overlay = document.getElementById('maintenanceOverlay');
    const statusSpan = document.getElementById('maintenanceStatus');
    
    if (snap.exists() && snap.val().enabled) {
        overlay.classList.remove('hidden');
        if (statusSpan) statusSpan.innerHTML = 'Status: <strong style="color:var(--warning)">Aktiv</strong>';
    } else {
        overlay.classList.add('hidden');
        if (statusSpan) statusSpan.innerHTML = 'Status: <strong>Inaktiv</strong>';
    }
}

async function setMaintenanceMode(enabled) {
    await set(ref(db, 'config/maintenance'), { enabled });
    loadMaintenanceStatus();
    showToast(`Wartungsmodus ${enabled ? 'aktiviert' : 'deaktiviert'}!`, 'warning');
}

// ========== LOGOUT ==========
function logoutAll() {
    sessionStorage.removeItem('sao_user');
    window.location.href = CONFIG.REDIRECT_URI;
}

async function logoutRoblox() {
    if (!currentUser) return;
    const dbKey = getDbKey(currentUser.username);
    await update(ref(db, `users/${dbKey}`), {
        robloxId: null,
        robloxName: null,
        robloxUsername: null
    });
    showToast('Roblox getrennt! Bitte neu verbinden.', 'success');
    showScreen('robloxScreen');
}

// ========== EVENT LISTENERS ==========
document.getElementById('discordLoginBtn')?.addEventListener('click', () => {
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${CONFIG.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&response_type=code&scope=identify%20guilds&state=discord`;
});

document.getElementById('robloxLoginBtn')?.addEventListener('click', () => {
    window.location.href = `https://apis.roblox.com/oauth/v1/authorize?client_id=${CONFIG.ROBLOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=roblox`;
});

document.getElementById('logoutAllBtn')?.addEventListener('click', logoutAll);
document.getElementById('logoutRbxBtn')?.addEventListener('click', logoutRoblox);
document.getElementById('submitBtn')?.addEventListener('click', submitGP);
document.getElementById('addRoleBtn')?.addEventListener('click', addRole);
document.getElementById('saveChannelsBtn')?.addEventListener('click', saveChannels);
document.getElementById('saveSystemBtn')?.addEventListener('click', saveSystemConfig);
document.getElementById('saveGpRoleBtn')?.addEventListener('click', saveGpSubmitRole);
document.getElementById('enableTestModeBtn')?.addEventListener('click', () => setTestMode(true));
document.getElementById('disableTestModeBtn')?.addEventListener('click', () => setTestMode(false));
document.getElementById('enableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(true));
document.getElementById('disableMaintenanceBtn')?.addEventListener('click', () => setMaintenanceMode(false));

// Tab listeners
document.getElementById('tabDonate')?.addEventListener('click', () => switchTab('donateTab'));
document.getElementById('TabLeaderboard')?.addEventListener('click', () => switchTab('leaderboardTab'));
document.getElementById('tabProfile')?.addEventListener('click', () => switchTab('profileTab'));
document.getElementById('tabAdmin')?.addEventListener('click', () => switchTab('adminTab'));
document.getElementById('tabOwner')?.addEventListener('click', () => switchTab('ownerTab'));

// Search listener
document.getElementById('leaderboardSearch')?.addEventListener('input', renderLeaderboard);

// ========== INIT ==========
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
    const savedUser = sessionStorage.getItem('sao_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        loadUserRoles();
        
        // Check if still in server
        fetch(`${CONFIG.BACKEND_URL}/check-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        }).then(async res => {
            if (res.ok) {
                const data = await res.json();
                if (data.isMember) {
                    // Check Roblox link
                    const dbKey = getDbKey(currentUser.username);
                    const snap = await get(ref(db, `users/${dbKey}`));
                    if (snap.exists() && snap.val().robloxId) {
                        showDashboard();
                    } else {
                        showScreen('robloxScreen');
                    }
                } else {
                    showScreen('noPermScreen');
                }
            } else {
                showScreen('loginScreen');
            }
        }).catch(() => {
            showScreen('loginScreen');
        });
    } else {
        showScreen('loginScreen');
    }
}

// Load configs on start
loadGpSubmitRole();
loadSystemConfig();
