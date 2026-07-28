'use strict'

const fs = require('fs')

const DEBUG = process.env.DEBUG === '1'
function dlog(...a) { if (DEBUG) console.log(...a) }

const DEFAULT_GROUP_SETTINGS = {
    welcomeEnabled: true,
    welcomeText: 'Welcome @user to *@group*! 🎉\nHope you enjoy it here~\n\n👥 Total members: *@total*\n📅 Joined: @date, @time',
    leaveEnabled: true,
    leaveText: '👋 @user has left *@group*.\n\n👥 Remaining members: *@total*\n📅 Left: @date, @time',
    antilinkEnabled: false,
    filterEnabled: false,
    filterMode: 'warn',
    filterWords: [],
    filterWarnCounts: {}
}

const MAX_FILTER_WORDS = 100

const FILTER_KICK_THRESHOLD = 3

let groupSettings = fs.existsSync('./groupSettings.json')
    ? JSON.parse(fs.readFileSync('./groupSettings.json', 'utf-8')) : {}

let groupSettingsSaveLock = false

function normalizeJid(jid) {
    if (!jid) return jid
    return jid.split('@')[0].split(':')[0]
}

function getGroupSettings(groupJid) {
    if (!groupSettings[groupJid]) {
        groupSettings[groupJid] = { ...DEFAULT_GROUP_SETTINGS }
    }
    return { ...DEFAULT_GROUP_SETTINGS, ...groupSettings[groupJid] }
}

async function saveGroupSettings() {
    if (groupSettingsSaveLock) return
    groupSettingsSaveLock = true
    try {
        fs.writeFileSync('./groupSettings.json', JSON.stringify(groupSettings, null, 2))
    } finally {
        groupSettingsSaveLock = false
    }
}

function setGroupSetting(groupJid, partial) {
    const current = getGroupSettings(groupJid)
    groupSettings[groupJid] = { ...current, ...partial }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function textMatchesFilter(text, filterWords) {
    if (!text || !filterWords || filterWords.length === 0) return null
    for (const word of filterWords) {
        const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i')
        if (pattern.test(text)) return word
    }
    return null
}

function addFilterWords(groupJid, words) {
    const settings = getGroupSettings(groupJid)
    const current = new Set(settings.filterWords.map(w => w.toLowerCase()))
    const added = []
    const skipped = []
    for (const raw of words) {
        const w = raw.trim().toLowerCase()
        if (!w) continue
        if (current.has(w)) { skipped.push(w); continue }
        if (current.size + added.length >= MAX_FILTER_WORDS) { skipped.push(w); continue }
        current.add(w)
        added.push(w)
    }
    setGroupSetting(groupJid, { filterWords: Array.from(current) })
    return { added, skipped }
}

function delFilterWords(groupJid, words) {
    const settings = getGroupSettings(groupJid)
    const current = new Set(settings.filterWords.map(w => w.toLowerCase()))
    const removed = []
    const notFound = []
    for (const raw of words) {
        const w = raw.trim().toLowerCase()
        if (!w) continue
        if (current.has(w)) { current.delete(w); removed.push(w) }
        else notFound.push(w)
    }
    setGroupSetting(groupJid, { filterWords: Array.from(current) })
    return { removed, notFound }
}

function addFilterWarn(groupJid, userJid) {
    const settings = getGroupSettings(groupJid)
    const key = normalizeJid(userJid)
    const counts = { ...settings.filterWarnCounts }
    counts[key] = (counts[key] || 0) + 1
    setGroupSetting(groupJid, { filterWarnCounts: counts })
    return counts[key]
}

function resetFilterWarn(groupJid, userJid) {
    const settings = getGroupSettings(groupJid)
    const key = normalizeJid(userJid)
    const counts = { ...settings.filterWarnCounts }
    delete counts[key]
    setGroupSetting(groupJid, { filterWarnCounts: counts })
}

async function getFreshGroupMetadata(sock, groupJid) {
    const t0 = Date.now()
    try {
        const metadata = await sock.groupMetadata(groupJid)
        dlog(`[group-debug] groupMetadata OK for ${groupJid} in ${Date.now() - t0}ms, participants=${metadata?.participants?.length}`)
        return metadata
    } catch (e) {
        dlog(`[group-debug] groupMetadata FAILED for ${groupJid} after ${Date.now() - t0}ms:`, e?.message, e?.stack)
        throw e
    }
}

async function isGroupAdmin(sock, groupJid, userJid) {
    const metadata = await getFreshGroupMetadata(sock, groupJid)
    const targetId = normalizeJid(userJid)
    const participant = metadata.participants.find(p => normalizeJid(p.id) === targetId)
    dlog(`[group-debug] isGroupAdmin check targetId=${targetId} found=${!!participant} admin=${participant?.admin}`)
    if (!participant) return false
    return participant.admin === 'admin' || participant.admin === 'superadmin'
}

function isBotNumberJid(sock, jid) {
    const botId = normalizeJid(sock.user?.id)
    return normalizeJid(jid) === botId
}

async function validateAdminAction(sock, groupJid, senderJid, { requireBotAdmin = true } = {}) {
    const tStart = Date.now()
    if (!groupJid?.endsWith('@g.us')) {
        return { ok: false, reason: '⚠️ This command can only be used inside a group.' }
    }
    dlog(`[group-debug] validateAdminAction start groupJid=${groupJid} senderJid=${senderJid} sock.user.id=${sock.user?.id} sock.user.lid=${sock.user?.lid}`)
    const metadata = await getFreshGroupMetadata(sock, groupJid)
    dlog('[group-debug] all participant ids:', JSON.stringify(metadata.participants.map(p => ({ id: p.id, jid: p.jid, lid: p.lid, admin: p.admin }))))

    const senderId = normalizeJid(senderJid)
    const senderParticipant = metadata.participants.find(p => normalizeJid(p.id) === senderId)
    const senderIsAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin'
    dlog(`[group-debug] sender match: senderId=${senderId} found=${!!senderParticipant} admin=${senderParticipant?.admin} senderIsAdmin=${senderIsAdmin}`)

    if (!senderIsAdmin) {
        dlog(`[group-debug] REJECT: sender not admin. Total time ${Date.now() - tStart}ms`)
        return { ok: false, reason: '🚫 Only admins of this group. Your admin status in other groups does not apply here.', metadata }
    }

    if (requireBotAdmin) {
        const botId = normalizeJid(sock.user?.id)
        const botLid = normalizeJid(sock.user?.lid)
        const botParticipant = metadata.participants.find(p => normalizeJid(p.id) === botId || normalizeJid(p.id) === botLid || normalizeJid(p.phoneNumber) === botId)
        const botIsAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin'
        dlog(`[group-debug] bot match: botId=${botId} botLid=${botLid} found=${!!botParticipant} matchedEntry=${JSON.stringify(botParticipant)} botIsAdmin=${botIsAdmin}`)
        if (!botIsAdmin) {
            dlog(`[group-debug] REJECT: bot not admin. Total time ${Date.now() - tStart}ms`)
            return { ok: false, reason: '⚠️ The bot must be made a group admin first to run this command.', metadata }
        }
    }

    dlog(`[group-debug] validateAdminAction OK. Total time ${Date.now() - tStart}ms`)
    return { ok: true, metadata }
}

function getMentionedOrQuotedJid(msg) {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    if (mentioned.length > 0) return mentioned
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
    if (quotedParticipant) return [quotedParticipant]
    return []
}

function renderGroupTemplate(template, { userJid, groupName, totalMembers, timestamp }) {
    const userTag = '@' + normalizeJid(userJid)
    const ts = timestamp || new Date()
    const tanggal = ts.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })
    const jam = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    return template
        .replace(/@user/g, userTag)
        .replace(/@group/g, groupName || 'this group')
        .replace(/@total/g, totalMembers != null ? String(totalMembers) : '-')
        .replace(/@tanggal/g, tanggal)
        .replace(/@jam/g, jam)
}

async function fetchProfilePicSafe(sock, jid) {
    const t0 = Date.now()
    try {
        const ppUrl = await Promise.race([
            sock.profilePictureUrl(jid, 'image'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('profilePictureUrl timeout 4000ms')), 4000))
        ])
        dlog(`[group-debug] profilePictureUrl OK for ${jid} in ${Date.now() - t0}ms`)
        return ppUrl
    } catch (e) {
        dlog(`[group-debug] profilePictureUrl FAILED/timeout for ${jid} after ${Date.now() - t0}ms:`, e?.message)
        return null
    }
}

async function sendGroupGreeting(sock, groupJid, userJid, template, groupName, extra = {}) {
    const t0 = Date.now()
    const caption = renderGroupTemplate(template, { userJid, groupName, totalMembers: extra.totalMembers, timestamp: extra.timestamp })
    console.log(`[greeting] render complete for ${userJid} in ${groupJid}, caption length=${caption.length}`)
    const ppUrl = await fetchProfilePicSafe(sock, userJid)
    console.log(`[greeting] fetchProfilePicSafe done (${Date.now() - t0}ms total), ppUrl=${ppUrl ? 'ADA' : 'TIDAK ADA'}`)
    const mentions = [userJid]
    if (ppUrl) {
        try {
            const tSend = Date.now()
            await sock.sendMessage(groupJid, { image: { url: ppUrl }, caption, mentions })
            console.log(`[greeting] sendMessage (with photo) succeeded in ${Date.now() - tSend}ms, total ${Date.now() - t0}ms`)
            return
        } catch (e) {
            console.log(`[greeting] sendMessage with photo FAILED: ${e?.message}, falling back to text only`)
        }
    }
    const tSend = Date.now()
    await sock.sendMessage(groupJid, { text: caption, mentions })
    console.log(`[greeting] sendMessage (text only) succeeded in ${Date.now() - tSend}ms, total ${Date.now() - t0}ms`)
}

const GROUP_ADMIN_COMMANDS = [
    'groupstats',
    'kick', 'remove', 'add', 'promote', 'demote', 'mute', 'close', 'unmute', 'open',
    'lock', 'unlock', 'tagall', 'everyone', 'groupinfo', 'infogrup',
    'antilink', 'welcome', 'setwelcome', 'setleave', 'resetwelcome', 'leave',
    'filter', 'addfilter', 'delfilter', 'listfilter', 'clearfilter', 'resetwarn',
    'setname', 'setdesc', 'setppgroup', 'addmode', 'ephemeral',
    'getlink', 'resetlink', 'joinrequest', 'approve', 'reject',
    'communitycreate', 'communitylink', 'communityunlink', 'joinmode'
]

async function handleGroupAdminCommand(sock, from, msg, command, args, quoteOpt, { cronJobs, saveCronJobs } = {}) {
    const senderJid = msg.key.participant || msg.key.remoteJid

    const NO_BOT_ADMIN_NEEDED = [
        'groupstats', 'antilink', 'setwelcome', 'setleave', 'welcome', 'leave', 'resetwelcome', 'tagall', 'everyone', 'groupinfo', 'infogrup',
        'filter', 'addfilter', 'delfilter', 'listfilter', 'clearfilter', 'resetwarn',
        'communitycreate'
    ]
    // ─── GROUPSTATS ─────────────────────────────────────────────────────────
    // .groupstats can be used by ALL members — no admin required, bot does not
    // need to be admin. Dispatch directly to groupStats module, skip validation.
    if (command === 'groupstats') {
        const { handleGroupStatsCommand } = require('./groupStats')
        await handleGroupStatsCommand(sock, from, msg, quoteOpt)
        return
    }

    const requireBotAdmin = !NO_BOT_ADMIN_NEEDED.includes(command)

    const validation = await validateAdminAction(sock, from, senderJid, { requireBotAdmin })
    if (!validation.ok) {
        await sock.sendMessage(from, { text: validation.reason }, quoteOpt)
        return
    }
    const metadata = validation.metadata
    const groupName = metadata.subject

    if (command === 'kick' || command === 'remove') {
        const targets = getMentionedOrQuotedJid(msg)
        if (targets.length === 0) {
            await sock.sendMessage(from, { text: '❌ Tag or reply to the message of the person you want to remove.\nExample: .kick @user' }, quoteOpt)
            return
        }
        const filtered = targets.filter(t => !isBotNumberJid(sock, t))
        if (filtered.length === 0) {
            await sock.sendMessage(from, { text: '⚠️ The bot cannot remove itself.' }, quoteOpt)
            return
        }
        await sock.groupParticipantsUpdate(from, filtered, 'remove')
        await sock.sendMessage(from, { text: `✅ ${filtered.length} member(s) successfully removed from the group.` }, quoteOpt)
        return
    }

    if (command === 'add') {
        const raw = args.trim()
        if (!raw) {
            await sock.sendMessage(from, { text: '❌ Format: .add 62xxxxxxxxxx\nCan be more than one, separate with spaces or commas.\nExample: .add 6281220104010 6281234567890' }, quoteOpt)
            return
        }
        const numbers = raw.split(/[\s,]+/).map(n => n.replace(/[^0-9]/g, '')).filter(Boolean)
        if (numbers.length === 0) {
            await sock.sendMessage(from, { text: '❌ Invalid number. Use the format 62xxxxxxxxxx.' }, quoteOpt)
            return
        }
        const invalid = numbers.filter(n => n.length < 8 || n.startsWith('0'))
        if (invalid.length > 0) {
            await sock.sendMessage(from, { text: `❌ Numbers must start with a country code (e.g. 62 for Indonesia), not 0.\nInvalid: ${invalid.join(', ')}` }, quoteOpt)
            return
        }
        const jids = numbers.map(n => n + '@s.whatsapp.net')

        let validJids = jids
        try {
            const checks = await sock.onWhatsApp(...jids)
            const existingSet = new Set((checks || []).filter(c => c.exists).map(c => c.jid))
            const notRegistered = jids.filter(j => !existingSet.has(j))
            validJids = jids.filter(j => existingSet.has(j))
            if (notRegistered.length > 0) {
                const notRegNums = notRegistered.map(j => normalizeJid(j)).join(', ')
                await sock.sendMessage(from, { text: `⚠️ Numbers not registered on WhatsApp, skipped: ${notRegNums}` }, quoteOpt)
            }
            if (validJids.length === 0) return
        } catch (e) {
            console.error('[group:add] onWhatsApp check failed, continuing without validation:', e?.message)
        }

        try {
            const result = await sock.groupParticipantsUpdate(from, validJids, 'add')
            const lines = (result || []).map(r => {
                const num = normalizeJid(r.jid)
                if (r.status === '200') return `✅ +${num} successfully added.`
                if (r.status === '403') return `⚠️ +${num} cannot be added directly (privacy), invitation sent via link if available.`
                if (r.status === '408') return `⚠️ +${num} is already in the group or did not respond.`
                return `❌ +${num} failed to add (status ${r.status}).`
            })
            await sock.sendMessage(from, { text: lines.length ? lines.join('\n') : '⚠️ No response from WhatsApp for this request.' }, quoteOpt)
        } catch (e) {
            console.error('[group:add] groupParticipantsUpdate failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to add member(s). Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    if (command === 'promote') {
        const targets = getMentionedOrQuotedJid(msg)
        if (targets.length === 0) {
            await sock.sendMessage(from, { text: '❌ Tag or reply to the message of the person you want to promote.\nExample: .promote @user' }, quoteOpt)
            return
        }
        await sock.groupParticipantsUpdate(from, targets, 'promote')
        await sock.sendMessage(from, { text: `✅ ${targets.length} member(s) successfully promoted to admin.` }, quoteOpt)
        return
    }

    if (command === 'demote') {
        const targets = getMentionedOrQuotedJid(msg)
        if (targets.length === 0) {
            await sock.sendMessage(from, { text: '❌ Tag or reply to the message of the admin you want to demote.\nExample: .demote @user' }, quoteOpt)
            return
        }
        await sock.groupParticipantsUpdate(from, targets, 'demote')
        await sock.sendMessage(from, { text: `✅ ${targets.length} admin(s) successfully demoted to member.` }, quoteOpt)
        return
    }

    if (command === 'mute' || command === 'close') {
        await sock.groupSettingUpdate(from, 'announcement')
        const hoursArg = parseFloat(args.trim())
        if (cronJobs) {
            const filtered = cronJobs.filter(j => !(j.type === 'unmute' && j.jid === from))
            cronJobs.length = 0; filtered.forEach(j => cronJobs.push(j))
        }
        if (!args.trim() || isNaN(hoursArg) || hoursArg <= 0) {
            if (saveCronJobs) await saveCronJobs()
            await sock.sendMessage(from, { text: '🔇 Group locked. Only admins can send messages.\n\n💡 Tip: .mute [hours] for auto-unmute, example: .mute 3' }, quoteOpt)
            return
        }
        const unmuteAt = new Date(Date.now() + hoursArg * 60 * 60 * 1000)
        if (cronJobs) cronJobs.push({ type: 'unmute', jid: from, unmuteAt: unmuteAt.toISOString() })
        if (saveCronJobs) await saveCronJobs()
        const jamText = hoursArg === 1 ? '1 hour' : `${hoursArg} hours`
        await sock.sendMessage(from, { text: `🔇 Group locked for *${jamText}*. Only admins can send messages.\nWill auto-unlock around ${unmuteAt.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })} (WIB).` }, quoteOpt)
        return
    }

    if (command === 'unmute' || command === 'open') {
        await sock.groupSettingUpdate(from, 'not_announcement')
        if (cronJobs) {
            const hadScheduled = cronJobs.some(j => j.type === 'unmute' && j.jid === from)
            const filtered = cronJobs.filter(j => !(j.type === 'unmute' && j.jid === from))
            cronJobs.length = 0; filtered.forEach(j => cronJobs.push(j))
            if (hadScheduled && saveCronJobs) await saveCronJobs()
        }
        await sock.sendMessage(from, { text: '🔊 Group unlocked. All members can send messages.' }, quoteOpt)
        return
    }

    if (command === 'lock') {
        await sock.groupSettingUpdate(from, 'locked')
        await sock.sendMessage(from, { text: '🔒 Group settings locked. Only admins can change group info.' }, quoteOpt)
        return
    }

    if (command === 'unlock') {
        await sock.groupSettingUpdate(from, 'unlocked')
        await sock.sendMessage(from, { text: '🔓 Group settings unlocked. All members can change group info.' }, quoteOpt)
        return
    }

    if (command === 'tagall' || command === 'everyone') {
        const allJids = metadata.participants.map(p => p.id)
        const listText = metadata.participants.map(p => `• @${normalizeJid(p.id)}`).join('\n')
        const caption = (args ? `📢 ${args}\n\n` : '📢 *Tag all group members*\n\n') + listText
        await sock.sendMessage(from, { text: caption, mentions: allJids }, quoteOpt)
        return
    }

    if (command === 'groupinfo' || command === 'infogrup') { // 'infogrup' kept for backward compat
        const adminCount = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length
        const info = `📋 *Group Info*\n\n` +
            `Name: ${metadata.subject}\n` +
            `Total members: ${metadata.participants.length}\n` +
            `Total admins: ${adminCount}\n` +
            `Send mode: ${metadata.announce ? 'Admins only (locked)' : 'All members'}\n` +
            `Group settings: ${metadata.restrict ? 'Only admins can change' : 'All members can change'}`
        await sock.sendMessage(from, { text: info }, quoteOpt)
        return
    }

    if (command === 'antilink') {
        const mode = args.trim().toLowerCase()
        if (mode !== 'on' && mode !== 'off') {
            const settings = getGroupSettings(from)
            await sock.sendMessage(from, { text: `🔗 Antilink currently: *${settings.antilinkEnabled ? 'ON' : 'OFF'}*\nUse: .antilink on or .antilink off` }, quoteOpt)
            return
        }
        setGroupSetting(from, { antilinkEnabled: mode === 'on' })
        await saveGroupSettings()
        await sock.sendMessage(from, { text: `✅ Antilink set to *${mode.toUpperCase()}*.` }, quoteOpt)
        return
    }

    if (command === 'welcome') {
        const mode = args.trim().toLowerCase()
        if (mode !== 'on' && mode !== 'off') {
            const settings = getGroupSettings(from)
            await sock.sendMessage(from, { text: `👋 Welcome message currently: *${settings.welcomeEnabled ? 'ON' : 'OFF'}*\nUse: .welcome on or .welcome off` }, quoteOpt)
            return
        }
        setGroupSetting(from, { welcomeEnabled: mode === 'on' })
        await saveGroupSettings()
        await sock.sendMessage(from, { text: `✅ Welcome message set to *${mode.toUpperCase()}*.` }, quoteOpt)
        return
    }

    if (command === 'leave') {
        const mode = args.trim().toLowerCase()
        if (mode !== 'on' && mode !== 'off') {
            const settings = getGroupSettings(from)
            await sock.sendMessage(from, { text: `👋 Leave message currently: *${settings.leaveEnabled ? 'ON' : 'OFF'}*\nUse: .leave on or .leave off` }, quoteOpt)
            return
        }
        setGroupSetting(from, { leaveEnabled: mode === 'on' })
        await saveGroupSettings()
        await sock.sendMessage(from, { text: `✅ Leave message set to *${mode.toUpperCase()}*.` }, quoteOpt)
        return
    }

    if (command === 'setwelcome') {
        if (!args.trim()) {
            await sock.sendMessage(from, { text: '❌ Format: .setwelcomemsg [text]\nPlaceholders: @user (mention member), @group (group name), @total (member count), @date, @time\nExample: .setwelcomemsg Hello @user, welcome to @group! Total members: @total' }, quoteOpt)
            return
        }
        setGroupSetting(from, { welcomeText: args, welcomeEnabled: true })
        await saveGroupSettings()
        const metadata = await getFreshGroupMetadata(sock, from)
        const totalMembers = metadata?.participants?.length
        await sock.sendMessage(from, { text: '✅ Welcome text saved and welcome enabled.\n\nPreview:\n' + renderGroupTemplate(args, { userJid: senderJid, groupName, totalMembers }) }, quoteOpt)
        return
    }

    if (command === 'setleave') {
        if (!args.trim()) {
            await sock.sendMessage(from, { text: '❌ Format: .setleavemsg [text]\nPlaceholders: @user, @group, @total (member count), @date, @time\nExample: .setleavemsg @user has left @group. Remaining members: @total' }, quoteOpt)
            return
        }
        setGroupSetting(from, { leaveText: args, leaveEnabled: true })
        await saveGroupSettings()
        const metadata = await getFreshGroupMetadata(sock, from)
        const totalMembers = metadata?.participants?.length
        await sock.sendMessage(from, { text: '✅ Leave text saved and leave message enabled.\n\nPreview:\n' + renderGroupTemplate(args, { userJid: senderJid, groupName, totalMembers }) }, quoteOpt)
        return
    }

    if (command === 'resetwelcome') {
        setGroupSetting(from, { welcomeText: DEFAULT_GROUP_SETTINGS.welcomeText, leaveText: DEFAULT_GROUP_SETTINGS.leaveText })
        await saveGroupSettings()
        await sock.sendMessage(from, { text: '✅ Welcome & leave text reset to default.' }, quoteOpt)
        return
    }

    if (command === 'filter') {
        const sub = args.trim().toLowerCase()
        const settings = getGroupSettings(from)
        if (sub === 'on' || sub === 'off') {
            setGroupSetting(from, { filterEnabled: sub === 'on' })
            await saveGroupSettings()
            await sock.sendMessage(from, { text: `✅ Keyword filter set to *${sub.toUpperCase()}*.` }, quoteOpt)
            return
        }
        if (sub.startsWith('mode')) {
            const mode = sub.replace('mode', '').trim()
            if (mode !== 'warn' && mode !== 'kick') {
                await sock.sendMessage(from, { text: '❌ Mode must be *warn* or *kick*.\nExample: .filter mode kick' }, quoteOpt)
                return
            }
            setGroupSetting(from, { filterMode: mode })
            await saveGroupSettings()
            const modeDesc = mode === 'kick' ? `delete message + warning, auto-kick at violation #${FILTER_KICK_THRESHOLD}` : 'delete message + warning only (no kick)'
            await sock.sendMessage(from, { text: `✅ Filter mode set to *${mode.toUpperCase()}* (${modeDesc}).` }, quoteOpt)
            return
        }
        await sock.sendMessage(from, {
            text: `🔍 Keyword filter currently: *${settings.filterEnabled ? 'ON' : 'OFF'}*\nMode: *${settings.filterMode.toUpperCase()}*\nWord count: ${settings.filterWords.length}/${MAX_FILTER_WORDS}\n\nUse:\n.filter on / .filter off\n.filter mode warn / .filter mode kick`
        }, quoteOpt)
        return
    }

    if (command === 'addfilter') {
        if (!args.trim()) {
            await sock.sendMessage(from, { text: '❌ Format: .addfilter word1, word2, word3' }, quoteOpt)
            return
        }
        const words = args.split(',').map(w => w.trim()).filter(Boolean)
        const { added, skipped } = addFilterWords(from, words)
        await saveGroupSettings()
        let text = ''
        if (added.length) text += `✅ Added: ${added.join(', ')}\n`
        if (skipped.length) text += `⚠️ Skipped (already exists / ${MAX_FILTER_WORDS} word limit reached): ${skipped.join(', ')}`
        await sock.sendMessage(from, { text: text.trim() || '⚠️ No words were added.' }, quoteOpt)
        return
    }

    if (command === 'delfilter') {
        if (!args.trim()) {
            await sock.sendMessage(from, { text: '❌ Format: .delfilter word1, word2' }, quoteOpt)
            return
        }
        const words = args.split(',').map(w => w.trim()).filter(Boolean)
        const { removed, notFound } = delFilterWords(from, words)
        await saveGroupSettings()
        let text = ''
        if (removed.length) text += `✅ Removed: ${removed.join(', ')}\n`
        if (notFound.length) text += `⚠️ Not found in list: ${notFound.join(', ')}`
        await sock.sendMessage(from, { text: text.trim() || '⚠️ No words were removed.' }, quoteOpt)
        return
    }

    if (command === 'listfilter') {
        const settings = getGroupSettings(from)
        if (settings.filterWords.length === 0) {
            await sock.sendMessage(from, { text: '📋 Filter list is empty. Add with .addfilter word1, word2' }, quoteOpt)
            return
        }
        const list = settings.filterWords.map((w, i) => `${i + 1}. ${w}`).join('\n')
        await sock.sendMessage(from, { text: `📋 *Filter word list* (${settings.filterWords.length}/${MAX_FILTER_WORDS}):\n${list}` }, quoteOpt)
        return
    }

    if (command === 'clearfilter') {
        setGroupSetting(from, { filterWords: [] })
        await saveGroupSettings()
        await sock.sendMessage(from, { text: '✅ All filter words have been removed.' }, quoteOpt)
        return
    }

    if (command === 'resetwarn') {
        const targets = getMentionedOrQuotedJid(msg)
        if (targets.length === 0) {
            await sock.sendMessage(from, { text: '❌ Tag or reply to the message of the person whose warning you want to reset.\nExample: .resetwarn @user' }, quoteOpt)
            return
        }
        targets.forEach(t => resetFilterWarn(from, t))
        await saveGroupSettings()
        await sock.sendMessage(from, { text: `✅ Filter warning for ${targets.length} person(s) has been reset.` }, quoteOpt)
        return
    }

    if (command === 'setname') {
        if (!args.trim()) {
            await sock.sendMessage(from, { text: '❌ Format: .setname [new group name]' }, quoteOpt)
            return
        }
        try {
            await sock.groupUpdateSubject(from, args.trim())
            await sock.sendMessage(from, { text: `✅ Group name changed to *${args.trim()}*.` }, quoteOpt)
        } catch (e) {
            console.error('[group:setname] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to change group name. Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    if (command === 'setdesc') {
        if (!args.trim()) {
            await sock.sendMessage(from, { text: '❌ Format: .setdesc [new group description]' }, quoteOpt)
            return
        }
        try {
            await sock.groupUpdateDescription(from, args.trim())
            await sock.sendMessage(from, { text: '✅ Group description successfully changed.' }, quoteOpt)
        } catch (e) {
            console.error('[group:setdesc] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to change group description. Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    if (command === 'setppgroup') {

        await sock.sendMessage(from, { text: '⚠️ An internal error occurred while processing the image.' }, quoteOpt)
        return
    }

    if (command === 'addmode') {
        const mode = args.trim().toLowerCase()
        if (mode !== 'admin' && mode !== 'all') {
            await sock.sendMessage(from, { text: '❌ Format: .addmode admin or .addmode all\n\nadmin = only admins can add members\nall = all members can add members' }, quoteOpt)
            return
        }
        try {
            await sock.groupMemberAddMode(from, mode === 'admin' ? 'admin_add' : 'all_member_add')
            await sock.sendMessage(from, { text: `✅ Member add mode set to *${mode === 'admin' ? 'admins only' : 'all members'}*.` }, quoteOpt)
        } catch (e) {
            console.error('[group:addmode] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to change member add mode. Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    if (command === 'ephemeral') {
        const mode = args.trim().toLowerCase()
        const map = { '24h': 86400, '7d': 604800, '90d': 7776000, 'off': 0 }
        if (!(mode in map)) {
            await sock.sendMessage(from, { text: '❌ Format: .ephemeral 24h / 7d / 90d / off' }, quoteOpt)
            return
        }
        try {
            await sock.groupToggleEphemeral(from, map[mode])
            await sock.sendMessage(from, { text: mode === 'off' ? '✅ Disappearing messages turned off.' : `✅ Disappearing messages set to *${mode}*.` }, quoteOpt)
        } catch (e) {
            console.error('[group:ephemeral] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to change disappearing messages. Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    if (command === 'getlink') {
        try {
            const code = await sock.groupInviteCode(from)
            await sock.sendMessage(from, { text: `🔗 Group link:\nhttps://chat.whatsapp.com/${code}` }, quoteOpt)
        } catch (e) {
            console.error('[group:getlink] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to get group link. Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    if (command === 'resetlink') {
        try {
            const code = await sock.groupRevokeInvite(from)
            await sock.sendMessage(from, { text: `✅ Old link is no longer valid.\n\n🔗 New link:\nhttps://chat.whatsapp.com/${code}` }, quoteOpt)
        } catch (e) {
            console.error('[group:resetlink] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to reset group link. Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    if (command === 'joinrequest') {
        try {
            const list = await sock.groupRequestParticipantsList(from)
            if (!list || list.length === 0) {
                await sock.sendMessage(from, { text: '📋 No pending join requests at this time.' }, quoteOpt)
                return
            }
            const lines = list.map((r, i) => `${i + 1}. @${normalizeJid(r.jid)}`).join('\n')
            await sock.sendMessage(from, {
                text: `📋 *Join requests* (${list.length}):\n${lines}\n\nUse .approve @user or .reject @user, or .approve all / .reject all`,
                mentions: list.map(r => r.jid)
            }, quoteOpt)
        } catch (e) {
            console.error('[group:joinrequest] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to get join request list. Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    if (command === 'approve' || command === 'reject') {
        const action = command === 'approve' ? 'approve' : 'reject'
        const actionLabel = action === 'approve' ? 'approved' : 'rejected'
        try {
            let targets
            if (args.trim().toLowerCase() === 'all') {
                const list = await sock.groupRequestParticipantsList(from)
                targets = (list || []).map(r => r.jid)
                if (targets.length === 0) {
                    await sock.sendMessage(from, { text: '📋 No pending join requests at this time.' }, quoteOpt)
                    return
                }
            } else {
                targets = getMentionedOrQuotedJid(msg)
                if (targets.length === 0) {
                    await sock.sendMessage(from, { text: `❌ Tag the person to ${actionLabel}, or use .${command} all for everyone.\nExample: .${command} @user` }, quoteOpt)
                    return
                }
            }
            await sock.groupRequestParticipantsUpdate(from, targets, action)
            await sock.sendMessage(from, { text: `✅ ${targets.length} join request(s) successfully ${actionLabel}.` }, quoteOpt)
        } catch (e) {
            console.error(`[group:${command}] failed:`, e)
            await sock.sendMessage(from, { text: `❌ Failed to process join request. Please try again in a moment.` }, quoteOpt)
        }
        return
    }

    // ─── COMMUNITYCREATE ────────────────────────────────────────────────────
    // Create a NEW community. Not tied to the group where this command is typed
    // — that group is just used as the "place to type the command", the community
    // is empty (no linked groups) until .communitylink is used from a group
    // that should be added. API: communityCreate(subject, body)
    // — body is the community description, left empty by default.
    if (command === 'communitycreate') {
        const nama = args.trim()
        if (!nama) {
            await sock.sendMessage(from, { text: '❌ Format: .communitycreate [name]\nExample: .communitycreate Coffee Lovers Community' }, quoteOpt)
            return
        }
        try {
            const community = await sock.communityCreate(nama, '')
            if (!community || !community.id) {
                await sock.sendMessage(from, { text: '❌ Failed to create community. Please try again in a moment.' }, quoteOpt)
                return
            }
            await sock.sendMessage(from, { text: `🎉 Community *${nama}* successfully created.\n🆔 ${community.id}\n\nUse .communitylink ${community.id} in the group you want to add to this community.` }, quoteOpt)
        } catch (e) {
            console.error('[group:communitycreate] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to create community. Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    // ─── COMMUNITYLINK ──────────────────────────────────────────────────────
    // Link THIS GROUP (from) to the community whose JID is given in the argument.
    // API: communityLinkGroup(groupJid, parentCommunityJid)
    if (command === 'communitylink') {
        const raw = args.trim()
        if (!raw) {
            await sock.sendMessage(from, { text: '❌ Format: .communitylink [community_id]\nExample: .communitylink 120363012345678901@g.us\n\n💡 community_id is obtained from .communitycreate output.' }, quoteOpt)
            return
        }
        const communityJid = raw.includes('@') ? raw : `${raw}@g.us`
        try {
            await sock.communityLinkGroup(from, communityJid)
            await sock.sendMessage(from, { text: `✅ This group has been linked to the community.\n🆔 ${communityJid}` }, quoteOpt)
        } catch (e) {
            console.error('[group:communitylink] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to link group to community. Make sure community_id is correct and the bot is an admin in that community.' }, quoteOpt)
        }
        return
    }

    // ─── COMMUNITYUNLINK ────────────────────────────────────────────────────
    // Unlink THIS GROUP from the community currently hosting it. metadata.linkedParent
    // contains the JID of the community currently hosting this group (empty/undefined
    // if this group is not part of any community).
    // API: communityUnlinkGroup(groupJid, parentCommunityJid)
    if (command === 'communityunlink') {
        const communityJid = metadata.linkedParent
        if (!communityJid) {
            await sock.sendMessage(from, { text: 'ℹ️ This group is not currently part of any community.' }, quoteOpt)
            return
        }
        try {
            await sock.communityUnlinkGroup(from, communityJid)
            await sock.sendMessage(from, { text: `✅ This group has been unlinked from the community.\n🆔 ${communityJid}` }, quoteOpt)
        } catch (e) {
            console.error('[group:communityunlink] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to unlink group from community. Please try again in a moment.' }, quoteOpt)
        }
        return
    }

    // ─── JOINMODE ───────────────────────────────────────────────────────────
    // Toggle mandatory approval for joining this group. API: groupJoinApprovalMode(jid, mode)
    if (command === 'joinmode') {
        const mode = args.trim().toLowerCase()
        if (mode !== 'on' && mode !== 'off') {
            const currentlyOn = !!metadata.joinApprovalMode
            await sock.sendMessage(from, { text: `🔐 Join approval mode currently: *${currentlyOn ? 'ON' : 'OFF'}*\nUse: .joinmode on or .joinmode off` }, quoteOpt)
            return
        }
        try {
            await sock.groupJoinApprovalMode(from, mode)
            await sock.sendMessage(from, { text: mode === 'on'
                ? '✅ Join approval enabled. New join requests must be approved by an admin (see .joinrequest).'
                : '✅ Join approval disabled. Anyone can join directly via link without approval.' }, quoteOpt)
        } catch (e) {
            console.error('[group:joinmode] failed:', e)
            await sock.sendMessage(from, { text: '❌ Failed to change join approval mode. Please try again in a moment.' }, quoteOpt)
        }
        return
    }
}


module.exports = {
    GROUP_ADMIN_COMMANDS,
    DEFAULT_GROUP_SETTINGS,
    MAX_FILTER_WORDS,
    FILTER_KICK_THRESHOLD,
    normalizeJid,
    getGroupSettings,
    setGroupSetting,
    saveGroupSettings,
    getFreshGroupMetadata,
    isGroupAdmin,
    isBotNumberJid,
    validateAdminAction,
    getMentionedOrQuotedJid,
    renderGroupTemplate,
    sendGroupGreeting,
    textMatchesFilter,
    addFilterWarn,
    resetFilterWarn,
    handleGroupAdminCommand
}
