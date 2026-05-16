// ==========================================
// SWORD ART ONLINE - COMPLETE CLOUDFLARE WORKER
// FIXED: Bild bleibt im Embed + Transcript-Ping (nur Creator)
// ADDED: /guild-roles, /save-role-permissions
// ==========================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// ==========================================
// 1. HELPER FUNCTIONS
// ==========================================

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

function interactionResponse(content, isEphemeral = true) {
    return new Response(JSON.stringify({
        type: 4,
        data: { content, flags: isEphemeral ? 64 : 0 }
    }), { headers: { "Content-Type": "application/json" } });
}

function hexToUint8Array(hex) {
    let arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return arr;
}

async function verifyDiscordRequest(request, env) {
    const signature = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');
    if (!signature || !timestamp) return false;
    
    const body = await request.clone().text();
    const message = new TextEncoder().encode(timestamp + body);
    
    try {
        let key = await crypto.subtle.importKey(
            'raw', 
            hexToUint8Array(env.DISCORD_PUBLIC_KEY), 
            { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }, 
            false, 
            ['verify']
        ).catch(() => null);
        if (!key) {
            key = await crypto.subtle.importKey(
                'raw', 
                hexToUint8Array(env.DISCORD_PUBLIC_KEY), 
                { name: 'Ed25519' }, 
                false, 
                ['verify']
            );
        }
        
        let isValid = await crypto.subtle.verify('NODE-ED25519', key, hexToUint8Array(signature), message).catch(() => false);
        if (!isValid) isValid = await crypto.subtle.verify('Ed25519', key, hexToUint8Array(signature), message);
        return isValid;
    } catch(e) { 
        return false;
    }
}

async function discordFetch(endpoint, options, env) {
    const url = endpoint.startsWith('http') ? endpoint : `https://discord.com/api/v10/${endpoint}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
            ...options.headers,
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Discord API ${res.status}: ${text.substring(0, 200)}`);
    }
    return res;
}

async function sendDiscordMessage(channelId, content, embeds, env) {
    if (!channelId) return false;
    try {
        const body = {};
        if (content) body.content = content;
        if (embeds && embeds.length > 0) body.embeds = embeds;
        const response = await discordFetch(`channels/${channelId}/messages`, {
            method: 'POST',
            body: JSON.stringify(body)
        }, env);
        return response.ok;
    } catch (e) {
        console.error("sendDiscordMessage error:", e);
        return false;
    }
}

// ==========================================
// 2. FIREBASE CONFIG HELPERS
// ==========================================

async function getGuildId(env) {
    try {
        const res = await fetch(`${env.FIREBASE_DB_URL}/config/guildId.json`);
        const data = await res.json();
        if (data && data.id) return data.id;
    } catch(e) {}
    return env.REQUIRED_GUILD_ID || null;
}

async function getAdminRoles(env) {
    try {
        const res = await fetch(`${env.FIREBASE_DB_URL}/config/admin_roles.json`);
        const data = await res.json();
        return {
            adminRoles: data?.adminRoles || [],
            ownerRoles: data?.ownerRoles || []
        };
    } catch (e) {
        return { adminRoles: [], ownerRoles: [] };
    }
}

async function getChannelConfig(env) {
    try {
        const res = await fetch(`${env.FIREBASE_DB_URL}/config/channels.json`);
        const data = await res.json();
        return data || {};
    } catch (e) {
        return {};
    }
}

async function getRoleConfig(env) {
    try {
        const res = await fetch(`${env.FIREBASE_DB_URL}/config/roles.json`);
        const data = await res.json();
        return data || {};
    } catch (e) {
        return {};
    }
}

async function logKickToFirebase(kickData, env) {
    try {
        await fetch(`${env.FIREBASE_DB_URL}/logs/kicks.json`, {
            method: 'POST',
            body: JSON.stringify({ ...kickData, timestamp: Date.now() })
        });
        return true;
    } catch (e) {
        console.error("Failed to log kick:", e);
        return false;
    }
}

async function isMaintenanceMode(env) {
    try {
        const res = await fetch(`${env.FIREBASE_DB_URL}/config/maintenance.json`);
        const data = await res.json();
        return data?.enabled === true;
    } catch (e) {
        return false;
    }
}

// ==========================================
// 3. NEUE FUNKTIONEN: GUILD ROLES & PERMISSIONS
// ==========================================

async function getGuildRoles(env) {
    const guildId = await getGuildId(env);
    if (!guildId) throw new Error("Guild ID not configured");
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    if (!res.ok) throw new Error(`Failed to fetch roles: ${res.status}`);
    const roles = await res.json();
    return roles.filter(r => r.id !== guildId && !r.managed).map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position
    }));
}

async function handleGuildRoles(env) {
    try {
        const roles = await getGuildRoles(env);
        return jsonResponse({ success: true, roles });
    } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
    }
}

async function handleSaveRolePermissions(request, env) {
    try {
        const { roleId, permissions } = await request.json();
        if (!roleId) return jsonResponse({ error: "Missing roleId" }, 400);
        const url = `${env.FIREBASE_DB_URL}/config/role_permissions/${roleId}.json`;
        await fetch(url, { method: 'PUT', body: JSON.stringify(permissions) });
        return jsonResponse({ success: true });
    } catch (e) {
        return jsonResponse({ error: e.message }, 500);
    }
}

// ==========================================
// 4. UPDATE GP MESSAGE (Bild bleibt im Embed)
// ==========================================

async function handleUpdateGPMessage(request, env) {
    try {
        const { requestId, adminId, adminName } = await request.json();
        if (!requestId) return jsonResponse({ error: "Missing requestId" }, 400);

        const reqRes = await fetch(`${env.FIREBASE_DB_URL}/requests/${requestId}.json`);
        if (!reqRes.ok) return jsonResponse({ error: "Request not found" }, 404);
        const reqData = await reqRes.json();
        if (!reqData) return jsonResponse({ error: "Request not found" }, 404);

        const discordMessageId = reqData.discordMessageId;
        if (!discordMessageId) return jsonResponse({ error: "No Discord message ID associated" }, 404);

        const status = reqData.status;
        if (status !== 'approved' && status !== 'rejected') {
            return jsonResponse({ error: "Request not yet processed" }, 400);
        }

        const channels = await getChannelConfig(env);
        const gpRequestsChannel = channels.CH_GP_REQUESTS;
        if (!gpRequestsChannel) return jsonResponse({ error: "GP Requests channel not configured" }, 500);

        const actionText = status === 'approved' ? '✅ APPROVED' : '❌ REJECTED';
        const embedColor = status === 'approved' ? 0x48bb78 : 0xf56565;
        const { discordName, discordUsername, userId, robloxName, robloxUsername, robloxId, amount, adminComment, processedByName } = reqData;
        
        const updatedEmbed = {
            title: "💎 GP Donation Request",
            url: "https://corleonecity.github.io/SwordArtOnline/",
            color: embedColor,
            fields: [
                { name: "💬 Discord", value: `**Name:** ${discordName}\n**Tag:** @${discordUsername}\n**Ping:** <@${userId}>`, inline: true },
                { name: "🎮 Roblox", value: `**Name:** ${robloxName}\n**User:** @${robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${robloxId}/profile)`, inline: true },
                { name: "💰 Amount", value: `**+${amount.toLocaleString()} GP**`, inline: false },
                { name: "📊 Status", value: actionText, inline: true },
                { name: "🛡️ Processed By", value: `<@${adminId}> (${adminName || processedByName || 'Admin'})`, inline: true }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: "SwordArtOnline GP System" }
        };
        
        if (adminComment) updatedEmbed.fields.push({ name: "💬 Admin Comment", value: adminComment, inline: false });
        
        let keepAttachments = [];
        let imageUrl = null;
        const msgRes = await fetch(`https://discord.com/api/v10/channels/${gpRequestsChannel}/messages/${discordMessageId}`, {
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
        });
        
        if (msgRes.ok) {
            const msg = await msgRes.json();
            if (msg.attachments && msg.attachments.length > 0) {
                keepAttachments = msg.attachments.map(att => ({ id: att.id }));
                imageUrl = msg.attachments[0].proxy_url || msg.attachments[0].url;
                updatedEmbed.image = { url: imageUrl };
            }
        }

        const patchRes = await fetch(`https://discord.com/api/v10/channels/${gpRequestsChannel}/messages/${discordMessageId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
            },
            body: JSON.stringify({
                embeds: [updatedEmbed],
                components: [],
                attachments: keepAttachments
            })
        });
        if (!patchRes.ok) {
            const errorText = await patchRes.text();
            return jsonResponse({ error: "Failed to update Discord message", details: errorText }, 500);
        }
        return jsonResponse({ success: true });
    } catch (e) {
        console.error("handleUpdateGPMessage error:", e);
        return jsonResponse({ error: e.message }, 500);
    }
}

// ==========================================
// 5. GP REQUEST WITH BUTTONS
// ==========================================

async function handleGPRequestWithButtons(request, env) {
    try {
        const formData = await request.formData();
        const payloadJson = formData.get('payload_json');
        if (!payloadJson) return jsonResponse({ error: "Missing payload_json" }, 400);
        const payload = JSON.parse(payloadJson);
        const files = [];
        for (let i = 0; i < 10; i++) {
            const file = formData.get(`file${i}`);
            if (file && file instanceof Blob) files.push(file);
        }
        
        const channels = await getChannelConfig(env);
        const gpRequestsChannel = channels.CH_GP_REQUESTS;
        if (!gpRequestsChannel) return jsonResponse({ error: "GP Requests channel not configured" }, 500);
        
        const formDataToSend = new FormData();
        formDataToSend.append('payload_json', JSON.stringify({
            content: payload.content,
            embeds: payload.embeds,
            components: payload.components
        }));
        for (let i = 0; i < files.length; i++) {
            formDataToSend.append(`file${i}`, files[i], `proof_${i+1}.png`);
        }
        
        const response = await fetch(`https://discord.com/api/v10/channels/${gpRequestsChannel}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
            body: formDataToSend
        });
        
        if (response.ok) {
            const data = await response.json();
            return jsonResponse({ success: true, messageId: data.id });
        } else {
            const errorText = await response.text();
            return jsonResponse({ error: "Failed to send Discord message", details: errorText }, 500);
        }
    } catch (e) {
        return jsonResponse({ error: e.message }, 500);
    }
}

// ==========================================
// 6. DISCORD BUTTON INTERACTIONS
// ==========================================

async function handleButtonInteraction(interaction, env) {
    const customId = interaction.data.custom_id;
    const parts = customId.split('_');
    const action = parts[0];
    const requestId = parts.slice(1).join('_');
    
    const userId = interaction.member.user.id;
    const memberRoles = interaction.member.roles || [];
    
    const { adminRoles } = await getAdminRoles(env);
    const hasPermission = (userId === env.OWNER_USER_ID) || memberRoles.some(role => adminRoles.includes(role));
    if (!hasPermission) {
        return interactionResponse("❌ You don't have permission to approve/reject requests!", true);
    }
    
    let reqData = null;
    const reqRes = await fetch(`${env.FIREBASE_DB_URL}/requests/${requestId}.json`);
    if (reqRes.ok) reqData = await reqRes.json();
    if (!reqData) return interactionResponse(`❌ Request not found! ID: ${requestId}`, true);
    if (reqData.status !== 'pending') return interactionResponse(`❌ This request has already been ${reqData.status}!`, true);
    
    if (action === 'reject') {
        return new Response(JSON.stringify({
            type: 9,
            data: {
                title: "Reject GP Request",
                custom_id: `modal_reject_${requestId}`,
                components: [{
                    type: 1,
                    components: [{
                        type: 4, custom_id: "reason", label: "Reason for rejection",
                        style: 2, required: true, placeholder: "Why is this request being rejected?",
                        min_length: 1, max_length: 500
                    }]
                }]
            }
        }), { headers: { "Content-Type": "application/json" } });
    } else {
        return new Response(JSON.stringify({
            type: 9,
            data: {
                title: "Approve GP Request",
                custom_id: `modal_approve_${requestId}`,
                components: [{
                    type: 1,
                    components: [{
                        type: 4, custom_id: "comment", label: "Comment (optional)",
                        style: 2, required: false, placeholder: "Add a comment (optional)", max_length: 500
                    }]
                }]
            }
        }), { headers: { "Content-Type": "application/json" } });
    }
}

async function handleModalSubmit(interaction, env) {
    const customId = interaction.data.custom_id;
    const parts = customId.split('_');
    const modalType = parts[1];
    const requestId = parts.slice(2).join('_');
    
    const adminId = interaction.member.user.id;
    const adminName = interaction.member.user.global_name || interaction.member.user.username;
    let comment = "";
    if (interaction.data.components?.[0]?.components?.[0]) {
        comment = interaction.data.components[0].components[0].value || "";
    }
    
    let reqData = null;
    const reqRes = await fetch(`${env.FIREBASE_DB_URL}/requests/${requestId}.json`);
    if (reqRes.ok) reqData = await reqRes.json();
    if (!reqData) return interactionResponse("❌ Request not found!", true);
    if (reqData.status !== 'pending') return interactionResponse(`❌ This request has already been ${reqData.status}!`, true);
    
    const action = modalType === 'approve' ? 'approve' : 'reject';
    const userId = reqData.userId;
    const amount = reqData.amount;
    const dbKey = reqData.dbKey;
    
    await fetch(`${env.FIREBASE_DB_URL}/requests/${requestId}.json`, {
        method: 'PATCH',
        body: JSON.stringify({
            status: action === 'approve' ? 'approved' : 'rejected',
            adminComment: comment,
            processedAt: Date.now(),
            processedBy: adminId,
            processedByName: adminName
        })
    });
    
    let newTotal = 0;
    if (action === 'approve') {
        const userRes = await fetch(`${env.FIREBASE_DB_URL}/users/${dbKey}.json`);
        const userData = await userRes.json();
        newTotal = (userData?.totalGP || 0) + amount;
        await fetch(`${env.FIREBASE_DB_URL}/users/${dbKey}.json`, {
            method: 'PATCH',
            body: JSON.stringify({ totalGP: newTotal })
        });
    }
    
    const discordMessageId = reqData.discordMessageId;
    const channels = await getChannelConfig(env);
    const gpRequestsChannel = channels.CH_GP_REQUESTS;
    if (discordMessageId && gpRequestsChannel) {
        const actionText = action === 'approve' ? '✅ APPROVED' : '❌ REJECTED';
        const embedColor = action === 'approve' ? 0x48bb78 : 0xf56565;
        const updatedEmbed = {
            title: "💎 GP Donation Request",
            url: "https://corleonecity.github.io/SwordArtOnline/",
            color: embedColor,
            fields: [
                { name: "💬 Discord", value: `**Name:** ${reqData.discordName}\n**Tag:** @${reqData.discordUsername}\n**Ping:** <@${userId}>`, inline: true },
                { name: "🎮 Roblox", value: `**Name:** ${reqData.robloxName}\n**User:** @${reqData.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${reqData.robloxId}/profile)`, inline: true },
                { name: "💰 Amount", value: `**+${amount.toLocaleString()} GP**`, inline: false },
                { name: "📊 Status", value: actionText, inline: true },
                { name: "🛡️ Processed By", value: `<@${adminId}>`, inline: true }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: "SwordArtOnline GP System" }
        };
        if (comment) updatedEmbed.fields.push({ name: "💬 Admin Comment", value: comment, inline: false });
        
        let keepAttachments = [];
        let imageUrl = null;
        const msgRes = await fetch(`https://discord.com/api/v10/channels/${gpRequestsChannel}/messages/${discordMessageId}`, {
            headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
        });
        if (msgRes.ok) {
            const msg = await msgRes.json();
            if (msg.attachments && msg.attachments.length > 0) {
                keepAttachments = msg.attachments.map(att => ({ id: att.id }));
                imageUrl = msg.attachments[0].proxy_url || msg.attachments[0].url;
                updatedEmbed.image = { url: imageUrl };
            }
        }
        await fetch(`https://discord.com/api/v10/channels/${gpRequestsChannel}/messages/${discordMessageId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
            body: JSON.stringify({ embeds: [updatedEmbed], components: [], attachments: keepAttachments })
        });
    }
    
    const processedChannel = channels.CH_GP_PROCESSED;
    if (processedChannel) {
        const allUsersRes = await fetch(`${env.FIREBASE_DB_URL}/users.json`);
        const allUsers = await allUsersRes.json();
        let rank = "?";
        if (allUsers) {
            const sorted = Object.values(allUsers).filter(u => u.totalGP > 0).sort((a,b) => b.totalGP - a.totalGP);
            const index = sorted.findIndex(u => u.id === userId);
            rank = index !== -1 ? (index + 1).toString() : "?";
        }
        const embed = {
            title: action === 'approve' ? '✅ GP Donation Approved' : '❌ GP Donation Rejected',
            url: "https://corleonecity.github.io/SwordArtOnline/",
            color: action === 'approve' ? 0x48bb78 : 0xf56565,
            fields: [
                { name: "💬 Discord", value: `**Name:** ${reqData.discordName}\n**Tag:** @${reqData.discordUsername}\n**Ping:** <@${userId}>`, inline: true },
                { name: "🎮 Roblox", value: `**Name:** ${reqData.robloxName}\n**User:** @${reqData.robloxUsername}\n**Profile:** [Click Here](https://www.roblox.com/users/${reqData.robloxId}/profile)`, inline: true },
                { name: "💰 Amount", value: action === 'approve' ? `+${amount.toLocaleString()} GP` : `-${amount.toLocaleString()} GP`, inline: false },
                { name: "📊 New Total", value: `${newTotal.toLocaleString()} GP`, inline: true },
                { name: "🏆 Rank", value: `#${rank}`, inline: true },
                { name: "🛡️ Processed By", value: `<@${adminId}>`, inline: false }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: "SwordArtOnline GP System" }
        };
        if (comment) embed.fields.push({ name: "💬 Admin Comment", value: comment, inline: false });
        await fetch(`https://discord.com/api/v10/channels/${processedChannel}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` },
            body: JSON.stringify({ content: `<@${userId}>`, embeds: [embed] })
        });
    }
    
    return interactionResponse(`✅ Request ${action === 'approve' ? 'approved' : 'rejected'}!`, true);
}

// ==========================================
// 7. TICKET SYSTEM
// ==========================================

async function handleTicketDropdown(interaction) {
    return new Response(JSON.stringify({
        type: 9,
        data: {
            title: "Create Ticket",
            custom_id: "modal_ticket_placeholder",
            components: [
                { type: 1, components: [{ type: 4, custom_id: "reason", label: "Reason", style: 1, required: true, placeholder: "Why are you opening a ticket?" }] },
                { type: 1, components: [{ type: 4, custom_id: "details1", label: "Details (optional)", style: 2, required: false }] },
                { type: 1, components: [{ type: 4, custom_id: "details2", label: "Additional details (optional)", style: 2, required: false }] }
            ]
        }
    }), { headers: { "Content-Type": "application/json" } });
}

async function handleTicketModal(interaction, env) {
    const selectedType = interaction.data.custom_id.replace("modal_ticket_", "");
    const isMod = selectedType === "cat_mod";
    const channelConfig = await getChannelConfig(env);
    const roleConfig = await getRoleConfig(env);
    const guildId = await getGuildId(env);
    if (!guildId) return interactionResponse("❌ Server ID not configured. Please contact admin.", true);
    
    const parentId = isMod ? channelConfig.ticketCatMod : channelConfig.ticketCatAdmin;
    const modRoleId = roleConfig.ticketModRole;
    const adminPingRoleId = roleConfig.adminPingRoleId;
    
    if (!parentId) return interactionResponse("❌ Ticket category not configured. Please contact an admin.", true);
    if ((isMod && !modRoleId) || (!isMod && !adminPingRoleId)) return interactionResponse("❌ Required role for ticket not configured.", true);
    
    const userId = interaction.member.user.id;
    const username = interaction.member.user.username;
    const reason = interaction.data.components[0]?.components[0]?.value || "No reason provided.";
    const d1 = interaction.data.components[1]?.components[0]?.value || "-";
    const d2 = interaction.data.components[2]?.components[0]?.value || "-";
    
    try {
        const channelRes = await discordFetch(`guilds/${guildId}/channels`, {
            method: 'POST',
            body: JSON.stringify({
                name: `ticket-${username}`,
                type: 0,
                parent_id: parentId,
                topic: `Creator ID: ${userId}`,
                permission_overwrites: [
                    { id: guildId, type: 0, deny: "1024" },
                    { id: userId, type: 1, allow: "1024" },
                    { id: isMod ? modRoleId : adminPingRoleId, type: 0, allow: "1024" }
                ]
            })
        }, env);
        const newChannel = await channelRes.json();
        const welcomeText = isMod
            ? `Welcome <@${userId}>, your ticket has been created. <@&${modRoleId}> will take care of it shortly.`
            : `Welcome <@${userId}>, your ticket has been created. <@&${adminPingRoleId}> will take care of it shortly.`;
        
        await discordFetch(`channels/${newChannel.id}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                content: welcomeText,
                embeds: [{ color: 0x2b2d31, fields: [{ name: "Reason", value: reason }, { name: "Details", value: d1 }, { name: "Additional Information", value: d2 }] }],
                components: [{ type: 1, components: [{ type: 2, custom_id: "ticket_btn_claim", label: "Claim Ticket", style: 1 }, { type: 2, custom_id: "ticket_btn_close", label: "Close", style: 4 }] }]
            })
        }, env);
        return interactionResponse(`✅ Ticket created: <#${newChannel.id}>`, true);
    } catch (err) {
        return interactionResponse(`❌ Error: ${err.message}`, true);
    }
}

async function handleTicketButton(interaction, env) {
    const btn = interaction.data.custom_id;
    const channelId = interaction.channel_id;
    const clickerId = interaction.member.user.id;
    const clickerName = interaction.member.user.username;
    
    const channelConfig = await getChannelConfig(env);
    const transcriptChannel = channelConfig.ticketTranscriptCh;

    try {
        if (btn === "ticket_btn_claim") {
            await discordFetch(`channels/${channelId}`, { method: 'PATCH', body: JSON.stringify({ name: `claimed-${clickerName}` }) }, env);
            return interactionResponse(`✅ Ticket claimed by <@${clickerId}>.`, true);
        }
        if (btn === "ticket_btn_close") {
            const chRes = await discordFetch(`channels/${channelId}`, {}, env);
            const chData = await chRes.json();
            let creatorId = clickerId;
            if (chData.topic && chData.topic.includes("Creator ID:")) creatorId = chData.topic.split(":")[1].trim();
            await discordFetch(`channels/${channelId}/permissions/${creatorId}`, { method: 'PUT', body: JSON.stringify({ deny: "1024", type: 1 }) }, env);
            await discordFetch(`channels/${channelId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    embeds: [{ title: "Ticket Closed", description: `Closed by <@${clickerId}>`, color: 0xf56565 }],
                    components: [{
                        type: 1, 
                        components: [
                            { type: 2, custom_id: "ticket_btn_transcript", label: "Transcript", style: 2 },
                            { type: 2, custom_id: "ticket_btn_open", label: "Reopen", style: 3 },
                            { type: 2, custom_id: "ticket_btn_delete", label: "Delete", style: 4 }
                        ]
                    }]
                })
            }, env);
            return new Response(JSON.stringify({ type: 6 }), { headers: { "Content-Type": "application/json" } });
        }
        if (btn === "ticket_btn_open") {
            const chRes = await discordFetch(`channels/${channelId}`, {}, env);
            const chData = await chRes.json();
            let creatorId = clickerId;
            if (chData.topic && chData.topic.includes("Creator ID:")) creatorId = chData.topic.split(":")[1].trim();
            await discordFetch(`channels/${channelId}/permissions/${creatorId}`, { method: 'PUT', body: JSON.stringify({ allow: "1024", type: 1 }) }, env);
            await discordFetch(`channels/${channelId}/messages/${interaction.message.id}`, { method: 'DELETE' }, env);
            return interactionResponse(`Ticket reopened. <@${creatorId}> can now see the channel.`, true);
        }
        if (btn === "ticket_btn_delete") {
            await discordFetch(`channels/${channelId}`, { method: 'DELETE' }, env);
            return new Response(JSON.stringify({ type: 6 }), { headers: { "Content-Type": "application/json" } });
        }
        if (btn === "ticket_btn_transcript" && transcriptChannel) {
            let channelName = channelId;
            try {
                const chInfoRes = await discordFetch(`channels/${channelId}`, {}, env);
                if (chInfoRes.ok) {
                    const chInfo = await chInfoRes.json();
                    channelName = chInfo.name;
                }
            } catch(e) {}
            
            const msgsRes = await discordFetch(`channels/${channelId}/messages?limit=100`, {}, env);
            const msgs = await msgsRes.json();
            let transcript = `Transcript of #${channelName} (${channelId})\n\n`;
            msgs.reverse().forEach(m => {
                transcript += `[${new Date(m.timestamp).toLocaleString()}] ${m.author.username}: ${m.content}\n`;
            });
            
            const chRes = await discordFetch(`channels/${channelId}`, {}, env);
            const chData = await chRes.json();
            let creatorId = clickerId;
            if (chData.topic && chData.topic.includes("Creator ID:")) creatorId = chData.topic.split(":")[1].trim();

            const formData = new FormData();
            const embed = {
                title: "📜 Ticket Transcript",
                description: `Transcript for **#${channelName}** requested by <@${clickerId}>`,
                color: 0x5865F2,
                fields: [
                    { name: "Ticket Creator", value: `<@${creatorId}>`, inline: true },
                    { name: "Closed by", value: clickerName, inline: true },
                    { name: "Time", value: new Date().toLocaleString(), inline: true }
                ],
                footer: { text: `Channel ID: ${channelId}` },
                timestamp: new Date().toISOString()
            };
            formData.append("payload_json", JSON.stringify({
                content: `<@${creatorId}>`,
                embeds: [embed]
            }));
            formData.append("files[0]", new Blob([transcript], { type: "text/plain" }), `transcript-${channelId}.txt`);
            await fetch(`https://discord.com/api/v10/channels/${transcriptChannel}/messages`, {
                method: 'POST',
                headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
                body: formData
            });
            return interactionResponse("Transcript saved! The ticket creator has been notified.", true);
        }
        return interactionResponse("Unknown button action.", true);
    } catch (err) {
        return interactionResponse(`❌ Error: ${err.message}`, true);
    }
}

// ==========================================
// 8. KICK, ADMIN, MAINTENANCE COMMANDS
// ==========================================

async function handleKickCommand(interaction, env) {
    const userId = interaction.member.user.id;
    const memberRoles = interaction.member.roles || [];
    const { adminRoles } = await getAdminRoles(env);
    const hasPermission = (userId === env.OWNER_USER_ID) || memberRoles.some(role => adminRoles.includes(role));
    if (!hasPermission) return interactionResponse("❌ You do not have permission to use this command.", true);
    const targetUserId = interaction.data.options?.find(o => o.name === "user")?.value;
    const reason = interaction.data.options?.find(o => o.name === "reason")?.value || "No reason provided";
    const kickedByUserName = interaction.member.user.global_name || interaction.member.user.username;
    if (!targetUserId) return interactionResponse("❌ Please specify a user to kick.", true);
    const guildId = await getGuildId(env);
    if (!guildId) return interactionResponse("❌ Server ID not configured.", true);
    try {
        let dmSent = false, kickedUserName = "Unknown";
        try {
            const targetUserRes = await discordFetch(`users/${targetUserId}`, {}, env);
            const targetUser = await targetUserRes.json();
            kickedUserName = targetUser.global_name || targetUser.username;
        } catch(e) {}
        try {
            const dmChannelRes = await discordFetch(`users/@me/channels`, { method: 'POST', body: JSON.stringify({ recipient_id: targetUserId }) }, env);
            const dmChannel = await dmChannelRes.json();
            await discordFetch(`channels/${dmChannel.id}/messages`, { method: 'POST', body: JSON.stringify({ embeds: [{ title: "⚠️ You have been kicked", description: `You have been kicked from the server.\n\n**Reason:** ${reason}\n\nTo contact an administrator, please use the /admin command.`, color: 0xf56565, timestamp: new Date().toISOString(), footer: { text: "SwordArtOnline" } }] }) }, env);
            dmSent = true;
        } catch(dmError) {}
        await discordFetch(`guilds/${guildId}/members/${targetUserId}`, { method: 'DELETE' }, env);
        await logKickToFirebase({ kickedUserId: targetUserId, kickedUserName, kickedByUserId: userId, kickedByUserName, reason, dmSent }, env);
        let responseMessage = `✅ <@${targetUserId}> has been kicked.\n📝 **Reason:** ${reason}`;
        if (!dmSent) responseMessage += "\n⚠️ Could not send DM (user may have DMs disabled).";
        return interactionResponse(responseMessage, true);
    } catch (err) {
        return interactionResponse(`❌ Error kicking user: ${err.message}`, true);
    }
}

async function handleAdminCommand(interaction, env) {
    const isDM = !interaction.guild_id;
    let userId, userName, userTag;
    if (isDM) {
        userId = interaction.user?.id || interaction.member?.user?.id;
        userName = interaction.user?.global_name || interaction.user?.username || "Unknown";
        userTag = interaction.user?.username || "Unknown";
    } else {
        userId = interaction.member.user.id;
        userName = interaction.member.user.global_name || interaction.member.user.username;
        userTag = interaction.member.user.username;
    }
    const userMessage = interaction.data.options?.find(o => o.name === "message")?.value;
    if (!userMessage) return interactionResponse("❌ Please provide a message.", true);
    const channels = await getChannelConfig(env);
    const botDmLogsChannel = channels.CH_BOT_DM_LOGS;
    const roleConfig = await getRoleConfig(env);
    const adminPingRoleId = roleConfig.adminPingRoleId;
    const embed = {
        title: "📨 New Admin Contact Message",
        url: "https://corleonecity.github.io/SwordArtOnline/",
        color: 0x5865F2,
        fields: [
            { name: "👤 Name", value: userName, inline: true },
            { name: "🏷️ Tag", value: `@${userTag}`, inline: true },
            { name: "🔔 Ping", value: `<@${userId}>`, inline: true },
            { name: "📍 Source", value: isDM ? "Direct Message" : `Server: ${interaction.guild_id}`, inline: false },
            { name: "💬 Message", value: userMessage.length > 1024 ? userMessage.substring(0, 1021) + "..." : userMessage }
        ],
        footer: { text: `User ID: ${userId}` },
        timestamp: new Date().toISOString()
    };
    const avatar = interaction.user?.avatar || interaction.member?.user?.avatar;
    if (avatar) embed.thumbnail = { url: avatar.startsWith('a_') ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.gif` : `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png` };
    if (botDmLogsChannel && adminPingRoleId) {
        await sendDiscordMessage(botDmLogsChannel, `<@&${adminPingRoleId}> New message from <@${userId}>`, [embed], env);
    }
    return interactionResponse("✅ Your message has been forwarded to the admin team. They will contact you if needed.", isDM ? false : true);
}

async function handleMaintenanceCommand(interaction, env) {
    const userId = interaction.member.user.id;
    if (userId !== env.OWNER_USER_ID) return interactionResponse("❌ Only the server owner can use this command!", true);
    const option = interaction.data.options?.[0];
    if (!option) return interactionResponse("❌ Please specify `on` or `off`. Usage: `/maintenance on` or `/maintenance off`", true);
    const subCommand = option.name;
    if (subCommand === "on") {
        await fetch(`${env.FIREBASE_DB_URL}/config/maintenance.json`, { method: 'PUT', body: JSON.stringify({ enabled: true, setBy: userId, setAt: Date.now() }) });
        return interactionResponse("🔧 **Maintenance Mode ENABLED**\nThe system is now in maintenance mode.", true);
    } else if (subCommand === "off") {
        await fetch(`${env.FIREBASE_DB_URL}/config/maintenance.json`, { method: 'PUT', body: JSON.stringify({ enabled: false, setBy: userId, setAt: Date.now() }) });
        return interactionResponse("✅ **Maintenance Mode DISABLED**\nThe system is now back online.", true);
    }
    return interactionResponse("❌ Unknown subcommand.", true);
}

async function handleManualTrigger(interaction, env) {
    try {
        await Promise.all([checkLeftUsers(env), updateInfoBoards(env), updateLeaderboardBoard(env)]);
        await discordFetch(`webhooks/${env.DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, { method: 'PATCH', body: JSON.stringify({ content: "✅ **System update completed — boards have been refreshed.**" }) }, env);
    } catch (err) {
        await discordFetch(`webhooks/${env.DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, { method: 'PATCH', body: JSON.stringify({ content: `❌ **Error:** ${err.message}` }) }, env);
    }
}

// ==========================================
// 9. BACKGROUND JOBS
// ==========================================

async function sendOrUpdateMessage(channelId, embedsArray, boardType, env) {
    if (!channelId) return;
    try {
        let storedMessageId = null;
        const storedRes = await fetch(`${env.FIREBASE_DB_URL}/config/message_ids/${boardType}.json`);
        if (storedRes.ok) storedMessageId = await storedRes.json();
        if (storedMessageId) {
            const updateRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${storedMessageId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }, body: JSON.stringify({ embeds: embedsArray })
            });
            if (updateRes.ok) return;
            else await fetch(`${env.FIREBASE_DB_URL}/config/message_ids/${boardType}.json`, { method: 'PUT', body: JSON.stringify(null) });
        }
        const sendRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }, body: JSON.stringify({ embeds: embedsArray })
        });
        if (sendRes.ok) {
            const newMessage = await sendRes.json();
            await fetch(`${env.FIREBASE_DB_URL}/config/message_ids/${boardType}.json`, { method: 'PUT', body: JSON.stringify(newMessage.id) });
        }
    } catch(e) { console.error("sendOrUpdateMessage error:", e); }
}

async function checkLeftUsers(env) {
    try {
        const usersRes = await fetch(`${env.FIREBASE_DB_URL}/users.json`);
        const users = await usersRes.json();
        if (!users) return;
        const channels = await getChannelConfig(env);
        const leaveLogsChannel = channels.CH_LEAVE_LOGS;
        const { adminRoles } = await getAdminRoles(env);
        const adminRoleId = adminRoles[0];
        const guildId = await getGuildId(env);
        if (!leaveLogsChannel || !adminRoleId || !guildId) return;
        for (const [userKey, userData] of Object.entries(users)) {
            if (userData.hasLeftServer === true || !userData.id) continue;
            const checkRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userData.id}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
            if (checkRes.status === 404) {
                const embed = { title: "🚨 User has left the server!", url: "https://corleonecity.github.io/SwordArtOnline/", color: 0xf56565, fields: [
                    { name: "💬 Discord", value: `**Display:** ${userData.discordName || "Unknown"}\n**User:** @${userData.discordUsername || "Unknown"}\n**Ping:** <@${userData.id}>`, inline: true },
                    { name: "🎮 Roblox", value: `**Display:** ${userData.robloxName || "Unknown"}\n**User:** @${userData.robloxUsername || "Unknown"}\n**Profile:** [Click Here](https://www.roblox.com/user.aspx?username=${userData.robloxUsername || ""})`, inline: true }
                ], timestamp: new Date().toISOString(), footer: { text: "SwordArtOnline Panel" } };
                await sendDiscordMessage(leaveLogsChannel, `<@&${adminRoleId}>`, [embed], env);
                await fetch(`${env.FIREBASE_DB_URL}/users/${userKey}.json`, { method: 'PATCH', body: JSON.stringify({ hasLeftServer: true }) });
            }
        }
    } catch (err) { console.error("checkLeftUsers error:", err); }
}

async function updateInfoBoards(env) {
    try {
        const guildId = await getGuildId(env);
        if (!guildId) return;
        const membersRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
        if (!membersRes.ok) throw new Error(`Member fetch failed: ${membersRes.status}`);
        const members = await membersRes.json();
        const roleConfig = await getRoleConfig(env);
        const guildMemberRole = roleConfig.ROLE_GUILD_MEMBER;
        const pendingGuildRole = roleConfig.ROLE_PENDING_GUILD;
        const panelRegRole = roleConfig.ROLE_PANEL_REG;
        const panelUnregRole = roleConfig.ROLE_PANEL_UNREG;
        if (!guildMemberRole && !pendingGuildRole && !panelRegRole && !panelUnregRole) return;
        let guildMembers = [], pendingGuild = [], panelReg = [], panelUnreg = [];
        for (const m of members) {
            if (guildMemberRole && m.roles.includes(guildMemberRole)) guildMembers.push(`<@${m.user.id}>`);
            if (pendingGuildRole && m.roles.includes(pendingGuildRole)) pendingGuild.push(`<@${m.user.id}>`);
            if (panelRegRole && m.roles.includes(panelRegRole)) panelReg.push(`<@${m.user.id}>`);
            if (panelUnregRole && m.roles.includes(panelUnregRole)) panelUnreg.push(`<@${m.user.id}>`);
        }
        const channels = await getChannelConfig(env);
        const userInfoChannel = channels.CH_USER_INFO;
        const panelInfoChannel = channels.CH_PANEL_INFO;
        if (userInfoChannel && (guildMemberRole || pendingGuildRole)) {
            await sendOrUpdateMessage(userInfoChannel, [{
                title: "🛡️ Guild User Info", url: "https://corleonecity.github.io/SwordArtOnline/", color: 0x5865F2,
                description: `**👥 Guild Members (${guildMembers.length})**\n${guildMembers.join('\n') || '*None*'}\n\n**⏳ Pending (${pendingGuild.length})**\n${pendingGuild.join('\n') || '*None*'}`,
                timestamp: new Date().toISOString(), footer: { text: "Live Member Sync" }
            }], "user_info", env);
        }
        if (panelInfoChannel && (panelRegRole || panelUnregRole)) {
            await sendOrUpdateMessage(panelInfoChannel, [{
                title: "💻 Panel Registration Info", url: "https://corleonecity.github.io/SwordArtOnline/", color: 0x48bb78,
                description: `**✅ Registered Users (${panelReg.length})**\n${panelReg.join('\n') || '*None*'}\n\n**❌ Unregistered Users (${panelUnreg.length})**\n${panelUnreg.join('\n') || '*None*'}`,
                timestamp: new Date().toISOString(), footer: { text: "Live Registration Sync" }
            }], "panel_info", env);
        }
    } catch (err) { console.error("updateInfoBoards error:", err); }
}

async function updateLeaderboardBoard(env) {
    try {
        const res = await fetch(`${env.FIREBASE_DB_URL}/users.json`);
        const users = await res.json();
        if (!users) return;
        let usersArray = Object.values(users).filter(u => u.totalGP > 0).sort((a,b) => b.totalGP - a.totalGP).slice(0,10);
        let descriptionStr = usersArray.length === 0 ? "*No verified donations yet.*" : usersArray.map((u,i) => {
            let emoji = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🏅";
            return `${emoji} **${i+1}.** <@${u.id}> | **${u.totalGP.toLocaleString()} GP**`;
        }).join('\n');
        const channels = await getChannelConfig(env);
        const leaderboardChannel = channels.CH_LEADERBOARD;
        if (leaderboardChannel) {
            await sendOrUpdateMessage(leaderboardChannel, [{
                title: "🏆 Top 10 GP Donators", url: "https://corleonecity.github.io/SwordArtOnline/", color: 0xffd700,
                description: descriptionStr, timestamp: new Date().toISOString(), footer: { text: "Live Leaderboard Sync" }
            }], "leaderboard", env);
        }
    } catch (err) { console.error("updateLeaderboardBoard error:", err); }
}

// ==========================================
// 10. OAUTH & API ROUTES
// ==========================================

async function handleToken(request, env) {
    const { code, redirect_uri } = await request.json();
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return jsonResponse({ isAuthorized: false });
    const userRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const user = await userRes.json();
    const guildId = await getGuildId(env);
    if (!guildId) return jsonResponse({ error: "Server ID not configured. Please set it in the Owner Panel." }, 500);
    const guildRes = await fetch("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const guilds = await guildRes.json();
    const isMember = Array.isArray(guilds) ? guilds.some(g => g.id === guildId) : false;
    return jsonResponse({ isAuthorized: true, isMember, user });
}

async function handleCheckMember(request, env) {
    const { userId, updateRoles } = await request.json();
    const roleConfig = await getRoleConfig(env);
    const guildId = await getGuildId(env);
    if (!guildId) return jsonResponse({ error: "Server ID not configured" }, 500);
    if (updateRoles && roleConfig.ROLE_PANEL_REG && roleConfig.ROLE_PANEL_UNREG) {
        await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleConfig.ROLE_PANEL_REG}`, { method: 'PUT', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
        await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleConfig.ROLE_PANEL_UNREG}`, { method: 'DELETE', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    }
    const checkRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    return jsonResponse({ isMember: checkRes.ok });
}

async function handleRobloxToken(request, env) {
    const { code, redirect_uri } = await request.json();
    const tokenRes = await fetch("https://roblox.com/oauth/v1/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: env.ROBLOX_CLIENT_ID, client_secret: env.ROBLOX_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return jsonResponse({ success: false });
    const userRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const user = await userRes.json();
    return jsonResponse({ success: true, robloxUser: user });
}

async function handleUserRoles(request, env) {
    try {
        const { userId } = await request.json();
        if (!userId) return jsonResponse({ error: "Missing userId", roles: [] }, 400);
        const guildId = await getGuildId(env);
        if (!guildId) return jsonResponse({ error: "Server ID not configured" }, 500);
        const memberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
        if (memberRes.ok) {
            const memberData = await memberRes.json();
            return jsonResponse({ roles: memberData.roles || [], success: true });
        } else return jsonResponse({ roles: [], success: false, error: "User not found or API error" }, memberRes.status);
    } catch (e) { return jsonResponse({ roles: [], error: e.message }, 500); }
}

async function handleRoleName(request, env) {
    try {
        const { roleId, guildId } = await request.json();
        if (!roleId || !guildId) return jsonResponse({ error: "Missing roleId or guildId" }, 400);
        const roleRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
        if (!roleRes.ok) return jsonResponse({ error: "Failed to fetch roles" }, roleRes.status);
        const roles = await roleRes.json();
        const role = roles.find(r => r.id === roleId);
        return jsonResponse({ name: role ? role.name : roleId, color: role?.color, success: !!role });
    } catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleUpdateNickname(request, env) {
    try {
        const { userId, nickname, guildId } = await request.json();
        if (!userId || !guildId) return jsonResponse({ error: "Missing userId or guildId" }, 400);
        const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
            method: 'PATCH', headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ nick: nickname || null })
        });
        if (response.ok) return jsonResponse({ success: true, nickname });
        else return jsonResponse({ error: `Failed to update nickname: ${response.status}` }, response.status);
    } catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleSendChannelMessage(request, env) {
    try {
        const { channelId, content, embeds } = await request.json();
        if (!channelId) return jsonResponse({ error: "Missing channelId" }, 400);
        if (!content && (!embeds || embeds.length === 0)) return jsonResponse({ error: "Missing content or embeds" }, 400);
        const body = {};
        if (content) body.content = content;
        if (embeds && embeds.length > 0) body.embeds = embeds;
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }, body: JSON.stringify(body)
        });
        if (response.ok) { const data = await response.json(); return jsonResponse({ success: true, messageId: data.id }); }
        else { const error = await response.text(); return jsonResponse({ error: `Failed to send: ${error}` }, response.status); }
    } catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleUpdateMessage(request, env) {
    try {
        const { channelId, messageId, content, embeds } = await request.json();
        if (!channelId || !messageId) return jsonResponse({ error: "Missing channelId or messageId" }, 400);
        const body = {};
        if (content) body.content = content;
        if (embeds && embeds.length > 0) body.embeds = embeds;
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }, body: JSON.stringify(body)
        });
        if (response.ok) return jsonResponse({ success: true, messageId });
        else if (response.status === 404) return jsonResponse({ error: "Message not found", code: 404 }, 404);
        else { const error = await response.text(); return jsonResponse({ error: `Failed to update: ${error}` }, response.status); }
    } catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleUpdateStatus(request, env) {
    try {
        const { status } = await request.json();
        if (!status) return jsonResponse({ error: "Missing status" }, 400);
        console.log(`Bot status would be set to: ${status}`);
        return jsonResponse({ success: true });
    } catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function registerCommands(env) {
    try {
        const commands = [
            { name: "kick", description: "Kick a user from the server and send them a DM", options: [{ name: "user", description: "The user to kick", type: 6, required: true }, { name: "reason", description: "Reason for the kick (will be sent via DM)", type: 3, required: true }] },
            { name: "admin", description: "Send a message to the admin team", options: [{ name: "message", description: "Your message to the admin team", type: 3, required: true }] },
            { name: "maintenance", description: "Toggle maintenance mode (Owner only)", options: [{ name: "on", description: "Enable maintenance mode", type: 1 }, { name: "off", description: "Disable maintenance mode", type: 1 }] }
        ];
        const res = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_CLIENT_ID}/commands`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }, body: JSON.stringify(commands)
        });
        if (res.ok) console.log("✅ Slash commands registered successfully!");
        else console.error("❌ Failed to register commands:", await res.text());
    } catch (e) { console.error("registerCommands error:", e); }
}

async function handleSetup(env) {
    try {
        const channelConfig = await getChannelConfig(env);
        const ticketMenuChannel = channelConfig.ticketMenuChannel;
        if (ticketMenuChannel) {
            await discordFetch(`channels/${ticketMenuChannel}/messages`, {
                method: 'POST', body: JSON.stringify({
                    embeds: [{ title: "All Tickets", description: "Select a ticket type below.", color: 0x2b2d31, footer: { text: "Ticket System" } }],
                    components: [{ type: 1, components: [{ type: 3, custom_id: "ticket_create_dropdown", placeholder: "Select Ticket Type...", options: [{ label: "Moderator Support", value: "cat_mod", emoji: { name: "🛡️" } }, { label: "Admin Support", value: "cat_admin", emoji: { name: "👑" } }] }] }]
                })
            }, env);
        }
        await registerCommands(env);
        return new Response("Setup successful!", { status: 200 });
    } catch (err) { return new Response(`Setup error: ${err.message}`, { status: 500 }); }
}

// ==========================================
// 11. MAIN WORKER HANDLER
// ==========================================

export default {
    async fetch(request, env, ctx) {
        if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
        const url = new URL(request.url);
        const path = url.pathname;
        
        if (path !== "/interactions" && path !== "/setup" && path !== "/test") {
            const maintenance = await isMaintenanceMode(env);
            if (maintenance) return jsonResponse({ error: "System is in maintenance mode.", maintenance: true }, 503);
        }
        
        if (path === "/test") return new Response("Worker is running!", { status: 200 });
        if (path === "/setup") return handleSetup(env);
        
        if (path === "/guild-roles" && request.method === "GET") return handleGuildRoles(env);
        if (path === "/save-role-permissions" && request.method === "POST") return handleSaveRolePermissions(request, env);
        
        if (path === "/user-roles" && request.method === "POST") return handleUserRoles(request, env);
        if (path === "/role-name" && request.method === "POST") return handleRoleName(request, env);
        if (path === "/update-nickname" && request.method === "POST") return handleUpdateNickname(request, env);
        if (path === "/send-channel-message" && request.method === "POST") return handleSendChannelMessage(request, env);
        if (path === "/update-message" && request.method === "POST") return handleUpdateMessage(request, env);
        if (path === "/update-status" && request.method === "POST") return handleUpdateStatus(request, env);
        if (path === "/send-gp-request-with-buttons" && request.method === "POST") return handleGPRequestWithButtons(request, env);
        if (path === "/update-gp-message" && request.method === "POST") return handleUpdateGPMessage(request, env);
        if (path === "/interactions" && request.method === "POST") {
            const isValid = await verifyDiscordRequest(request, env);
            if (!isValid) return new Response("Invalid signature", { status: 401 });
            const body = await request.json();
            if (body.type === 1) return new Response(JSON.stringify({ type: 1 }), { headers: { "Content-Type": "application/json" } });
            if (body.type === 3 && body.data.custom_id && (body.data.custom_id.startsWith("approve_") || body.data.custom_id.startsWith("reject_"))) return handleButtonInteraction(body, env);
            if (body.type === 5 && body.data.custom_id && (body.data.custom_id.startsWith("modal_approve_") || body.data.custom_id.startsWith("modal_reject_"))) return handleModalSubmit(body, env);
            if (body.type === 2 && body.data.name === "kick") return handleKickCommand(body, env);
            if (body.type === 2 && body.data.name === "admin") return handleAdminCommand(body, env);
            if (body.type === 2 && body.data.name === "maintenance") return handleMaintenanceCommand(body, env);
            if (body.type === 3 && body.data.custom_id === "manual_trigger_update") { ctx.waitUntil(handleManualTrigger(body, env)); return interactionResponse("🔄 Starting update…", true); }
            if (body.type === 3 && body.data.custom_id === "ticket_create_dropdown") return handleTicketDropdown(body);
            if (body.type === 5 && body.data.custom_id.startsWith("modal_ticket_")) return handleTicketModal(body, env);
            if (body.type === 3 && body.data.custom_id.startsWith("ticket_btn_")) return handleTicketButton(body, env);
            return interactionResponse("Unknown interaction.", true);
        }
        
        if (path === "/token" && request.method === "POST") return handleToken(request, env);
        if (path === "/check-member" && request.method === "POST") return handleCheckMember(request, env);
        if (path === "/roblox-token" && request.method === "POST") return handleRobloxToken(request, env);
        return jsonResponse({ error: "Not Found" }, 404);
    },
    async scheduled(event, env, ctx) {
        ctx.waitUntil(Promise.all([checkLeftUsers(env), updateInfoBoards(env), updateLeaderboardBoard(env)]));
    }
};
