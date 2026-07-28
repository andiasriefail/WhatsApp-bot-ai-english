'use strict'

const fs = require('fs')

const OWNER_NUMBERS = ['628123456789']


const OWNER_COMMANDS = ['broadcast', 'groupbroadcast', 'send', 'stats', 'ban', 'unban', 'status', 'dstatus', 'bio', 'pp', 'creategroup', 'joingroup', 'leavegroup', 'setbio', 'setbotname', 'block', 'unblock', 'businessinfo', 'maintenance', 'listgroups', 'leaveall', 'leaveinactive', 'addme']

let bannedUsers = fs.existsSync('./bannedUsers.json')
    ? JSON.parse(fs.readFileSync('./bannedUsers.json', 'utf-8')) : []

let knownUsers = fs.existsSync('./knownUsers.json')
    ? JSON.parse(fs.readFileSync('./knownUsers.json', 'utf-8')) : []

let knownUsersFirstSeen = fs.existsSync('./knownUsersFirstSeen.json')
    ? JSON.parse(fs.readFileSync('./knownUsersFirstSeen.json', 'utf-8')) : {}

{
    const validKnownUsers = knownUsers.filter(num => typeof num === 'string' && num.length >= 8 && /^\d+$/.test(num))
    if (validKnownUsers.length !== knownUsers.length) {
        console.log(`[owner-cleanup] cleaning up ${knownUsers.length - validKnownUsers.length} invalid knownUsers entries`)
        knownUsers = validKnownUsers
        fs.writeFileSync('./knownUsers.json', JSON.stringify(knownUsers, null, 2))
    }
}

let bannedSaveLock = false
let knownUsersSaveLock = false
let knownUsersFirstSeenSaveLock = false

let maintenanceMode = false

function isMaintenanceMode() { return maintenanceMode }

const botStats = {
    startTime: Date.now(),
    totalRequests: 0
}

const MIN_VALID_PHONE_LENGTH = 8

function normalizeNumber(jidOrNumber) {
    if (!jidOrNumber) return ''
    const digits = jidOrNumber.split('@')[0].split(':')[0].replace(/\D/g, '')
    return digits.length >= MIN_VALID_PHONE_LENGTH ? digits : ''
}

function extractSenderNumber(msgKeyOrJid) {
    if (!msgKeyOrJid) return ''
    if (typeof msgKeyOrJid === 'string') return normalizeNumber(msgKeyOrJid)

    const key = msgKeyOrJid
    
    
    const realNumberJid = key.senderPn || key.participantPn || key.participantAlt || key.remoteJidAlt
    if (realNumberJid) return normalizeNumber(realNumberJid)

    return normalizeNumber(key.participant || key.remoteJid)
}

function isOwner(senderJidOrKey) {
    const num = extractSenderNumber(senderJidOrKey)
    return num !== '' && OWNER_NUMBERS.includes(num)
}

function resolveTargetJid(msg, args) {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    if (mentioned.length > 0) return mentioned[0]

    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
    if (quotedParticipant) return quotedParticipant

    const num = normalizeNumber((args || '').trim())
    if (num) return `${num}@s.whatsapp.net`

    return ''
}

function isBanned(senderJidOrKey) {
    const num = extractSenderNumber(senderJidOrKey)
    return bannedUsers.includes(num)
}

async function saveBannedUsers() {
    if (bannedSaveLock) return
    bannedSaveLock = true
    try {
        fs.writeFileSync('./bannedUsers.json', JSON.stringify(bannedUsers, null, 2))
    } finally {
        bannedSaveLock = false
    }
}

async function saveKnownUsers() {
    if (knownUsersSaveLock) return
    knownUsersSaveLock = true
    try {
        fs.writeFileSync('./knownUsers.json', JSON.stringify(knownUsers, null, 2))
    } finally {
        knownUsersSaveLock = false
    }
}

async function saveKnownUsersFirstSeen() {
    if (knownUsersFirstSeenSaveLock) return
    knownUsersFirstSeenSaveLock = true
    try {
        fs.writeFileSync('./knownUsersFirstSeen.json', JSON.stringify(knownUsersFirstSeen, null, 2))
    } finally {
        knownUsersFirstSeenSaveLock = false
    }
}

async function recordFirstSeen(msgKeyOrJid) {
    const num = extractSenderNumber(msgKeyOrJid)
    if (!num || knownUsersFirstSeen[num]) return
    knownUsersFirstSeen[num] = new Date().toISOString()
    await saveKnownUsersFirstSeen()
}

function getFirstSeen(msgKeyOrJid) {
    const num = extractSenderNumber(msgKeyOrJid)
    if (!num) return null
    return knownUsersFirstSeen[num] || null
}

async function recordKnownUser(msgKeyOrJid) {
    const num = extractSenderNumber(msgKeyOrJid)
    if (!num || knownUsers.includes(num)) return
    knownUsers.push(num)
    await saveKnownUsers()
}

function incrementRequestCount() {
    botStats.totalRequests++
}

function formatUptime(ms) {
    const totalSec = Math.floor(ms / 1000)
    const days = Math.floor(totalSec / 86400)
    const hours = Math.floor((totalSec % 86400) / 3600)
    const minutes = Math.floor((totalSec % 3600) / 60)
    const seconds = totalSec % 60
    const parts = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    parts.push(`${seconds}s`)
    return parts.join(' ')
}

async function handleBroadcastCommand(sock, from, args, quoteOpt) {
    const pesan = args.trim()
    if (!pesan) {
        await sock.sendMessage(from, { text: '❌ Format: .broadcast [message]\nExample: .broadcast Bot will be under maintenance at 10 PM tonight!' }, quoteOpt)
        return
    }
    if (knownUsers.length === 0) {
        await sock.sendMessage(from, { text: '📭 No users recorded yet for broadcast. This list fills up automatically as users send private messages to the bot.' }, quoteOpt)
        return
    }
    await sock.sendMessage(from, { text: `📤 Starting broadcast to ${knownUsers.length} user(s)...` }, quoteOpt)
    let success = 0, failed = 0
    for (const num of knownUsers) {
        const jid = `${num}@s.whatsapp.net`
        try {
            await sock.sendMessage(jid, { text: `📢 *Announcement*\n\n${pesan}` })
            success++
        } catch (e) {
            failed++
            console.log(`[owner-broadcast] failed to send to ${num}:`, e?.message)
        }
        await new Promise(r => setTimeout(r, 2000))
    }
    await sock.sendMessage(from, { text: `✅ User broadcast complete.\nSucceeded: ${success}\nFailed: ${failed}` })
}

function parseSendArgs(args) {
    const trimmed = args.trim()
    const nMatch = trimmed.match(/n-\s*([\s\S]*?)(?=\s+t-|$)/)
    const tMatch = trimmed.match(/t-\s*([\s\S]*?)(?=\s+n-|$)/)

    const rawNumbers = nMatch ? nMatch[1].trim() : ''
    const pesan = tMatch ? tMatch[1].trim() : ''

    const numbers = rawNumbers
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(tok => {
            let digits = tok.replace(/^\+/, '').replace(/[.,-]/g, '')
            if (digits.startsWith('08')) digits = '62' + digits.slice(1)
            return digits
        })
        .filter(digits => /^[1-9]\d+$/.test(digits) && digits.length >= MIN_VALID_PHONE_LENGTH && digits.length <= 15)

    return { pesan, numbers }
}

async function handleSendCommand(sock, from, args, quoteOpt) {
    const { pesan, numbers } = parseSendArgs(args)

    if (!pesan || numbers.length === 0) {
        await sock.sendMessage(from, {
            text: '❌ Format: .send n- [number1] [number2] ... t- [message]\nExample: .send n- 6281234567890 6280987654321 t- hey how are you\n\nn- followed by a list of numbers (separated by spaces or commas). Can be 08xxx (auto-converted to Indonesian mobile 62xxx) or another country code written in full (e.g. 1xxx, 44xxx). Numbers starting with 0 but not 08 will be rejected.\nt- followed by the message content.\nThe order of n- and t- can be swapped.'
        }, quoteOpt)
        return
    }

    const uniqueNumbers = [...new Set(numbers)]
    await sock.sendMessage(from, { text: `📤 Sending to ${uniqueNumbers.length} number(s)...` }, quoteOpt)

    let success = 0, failed = 0
    const failedNumbers = []
    for (const num of uniqueNumbers) {
        const pnJid = `${num}@s.whatsapp.net`
        try {
            let targetJid = pnJid
            try {
                const lid = await sock.signalRepository?.lidMapping?.getLIDForPN(pnJid)
                console.log(`[owner-send] getLIDForPN result:`, lid)
                if (lid) targetJid = lid
            } catch (lidErr) {
                console.log(`[owner-send] getLIDForPN error:`, lidErr?.message)
            }
            let onWaResult = null
            try {
                const onWaRes = await sock.onWhatsApp(pnJid)
                onWaResult = onWaRes
                console.log(`[owner-send] onWhatsApp result:`, JSON.stringify(onWaRes))
            } catch (onWaErr) {
                console.log(`[owner-send] onWhatsApp error:`, onWaErr?.message)
            }
            if (onWaResult !== null && onWaResult.length === 0) {
                failed++
                failedNumbers.push(`${num} (not registered on WhatsApp)`)
                continue
            }
            if (onWaResult?.[0]?.jid) targetJid = onWaResult[0].jid
            const sentResult = await sock.sendMessage(targetJid, { text: pesan })
            console.log(`[owner-send] sendMessage result:`, JSON.stringify(sentResult?.key))
            success++
        } catch (e) {
            failed++
            failedNumbers.push(num)
            console.log(`[owner-send] failed to send to ${num}:`, e?.message, e?.stack)
        }
        await new Promise(r => setTimeout(r, 1500))
    }

    let resultText = `✅ Done.\nSucceeded: ${success}\nFailed: ${failed}`
    if (failedNumbers.length > 0) resultText += `\n\nFailed to:\n${failedNumbers.join('\n')}`
    await sock.sendMessage(from, { text: resultText })
}

async function handleGroupBroadcastCommand(sock, from, args, quoteOpt) {
    const pesan = args.trim()
    if (!pesan) {
        await sock.sendMessage(from, { text: '❌ Format: .groupbroadcast [message]\nExample: .groupbroadcast Bot will be under maintenance at 10 PM tonight!' }, quoteOpt)
        return
    }
    let groups
    try {
        groups = await sock.groupFetchAllParticipating()
    } catch (e) {
        console.error('[owner:groupbroadcast] Failed to fetch group list:', e)
        await sock.sendMessage(from, { text: '❌ Failed to fetch group list. Please try again in a moment.' }, quoteOpt)
        return
    }
    const groupIds = Object.keys(groups || {})
    if (groupIds.length === 0) {
        await sock.sendMessage(from, { text: '📭 The bot is not in any groups yet.' }, quoteOpt)
        return
    }
    await sock.sendMessage(from, { text: `📤 Starting broadcast to ${groupIds.length} group(s)...` }, quoteOpt)
    let success = 0, failed = 0
    for (const gid of groupIds) {
        try {
            await sock.sendMessage(gid, { text: `📢 *Announcement*\n\n${pesan}` })
            success++
        } catch (e) {
            failed++
            console.log(`[owner-broadcast] failed to send to group ${gid}:`, e?.message)
        }
        await new Promise(r => setTimeout(r, 2000))
    }
    await sock.sendMessage(from, { text: `✅ Group broadcast complete.\nSucceeded: ${success}\nFailed: ${failed}` })
}

async function handleStatsCommand(sock, from, quoteOpt) {
    let groupCount = 0
    try {
        const groups = await sock.groupFetchAllParticipating()
        groupCount = Object.keys(groups || {}).length
    } catch (e) {
        console.log('[owner-stats] failed to fetch group count:', e?.message)
    }
    const mem = process.memoryUsage()
    const rssMB = (mem.rss / 1024 / 1024).toFixed(1)
    const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1)
    const uptimeStr = formatUptime(Date.now() - botStats.startTime)
    const text = `📊 *Bot Statistics*

⏱️ Uptime: ${uptimeStr}
📨 Total requests since start: ${botStats.totalRequests}
👥 Connected groups: ${groupCount}
🙋 Recorded users (for broadcast): ${knownUsers.length}
🚫 Banned users: ${bannedUsers.length}

💾 *Memory*
RSS: ${rssMB} MB
Heap Used: ${heapMB} MB
Node: ${process.version}`
    await sock.sendMessage(from, { text }, quoteOpt)
}

async function handleBanCommand(sock, from, args, quoteOpt) {
    const target = normalizeNumber(args.trim())
    if (!target) {
        await sock.sendMessage(from, { text: '❌ Format: .ban [number]\nExample: .ban 6281234567890' }, quoteOpt)
        return
    }
    if (bannedUsers.includes(target)) {
        await sock.sendMessage(from, { text: `ℹ️ ${target} is already in the banned list.` }, quoteOpt)
        return
    }
    bannedUsers.push(target)
    await saveBannedUsers()
    await sock.sendMessage(from, { text: `✅ ${target} has been banned. The bot will no longer respond to this number.` }, quoteOpt)
}

async function handleUnbanCommand(sock, from, args, quoteOpt) {
    const target = normalizeNumber(args.trim())
    if (!target) {
        await sock.sendMessage(from, { text: '❌ Format: .unban [number]\nExample: .unban 6281234567890' }, quoteOpt)
        return
    }
    if (!bannedUsers.includes(target)) {
        await sock.sendMessage(from, { text: `ℹ️ ${target} is not in the banned list.` }, quoteOpt)
        return
    }
    bannedUsers = bannedUsers.filter(n => n !== target)
    await saveBannedUsers()
    await sock.sendMessage(from, { text: `✅ ${target} has been unbanned.` }, quoteOpt)
}

async function handleBioCommand(sock, from, msg, args, quoteOpt) {
    const targetJid = resolveTargetJid(msg, args)
    if (!targetJid) {
        await sock.sendMessage(from, { text: '❌ Format: .bio [number] or tag/reply the person.\nExample: .bio 6281234567890' }, quoteOpt)
        return
    }
    try {
        const result = await sock.fetchStatus(targetJid)
        const targetNum = normalizeNumber(targetJid)
        if (!result || !result.status) {
            await sock.sendMessage(from, { text: `ℹ️ +${targetNum} has no bio, or their bio is hidden (privacy).` }, quoteOpt)
            return
        }
        const setAtStr = result.setAt ? new Date(result.setAt).toLocaleString('en-US', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '-'
        await sock.sendMessage(from, { text: `📝 *Bio +${targetNum}*\n\n${result.status}\n\n🕒 Set: ${setAtStr} WIB` }, quoteOpt)
    } catch (e) {
        console.error('[owner:bio] failed:', e)
        await sock.sendMessage(from, { text: '❌ Failed to fetch bio. Number not found or bio hidden from the bot.' }, quoteOpt)
    }
}

async function handlePpCommand(sock, from, msg, args, quoteOpt) {
    const targetJid = resolveTargetJid(msg, args)
    if (!targetJid) {
        await sock.sendMessage(from, { text: '❌ Format: .pp [number] or tag/reply the person.\nExample: .pp 6281234567890' }, quoteOpt)
        return
    }
    const targetNum = normalizeNumber(targetJid)
    try {
        const ppUrl = await sock.profilePictureUrl(targetJid, 'image')
        if (!ppUrl) {
            await sock.sendMessage(from, { text: `ℹ️ +${targetNum} has no profile photo, or it is hidden from the bot.` }, quoteOpt)
            return
        }
        await sock.sendMessage(from, { image: { url: ppUrl }, caption: `🖼️ Profile photo of +${targetNum}` }, quoteOpt)
    } catch (e) {
        console.error('[owner:pp] failed:', e)
        await sock.sendMessage(from, { text: `❌ Cannot fetch profile photo of +${targetNum}. They may not have one or it is hidden from the bot.` }, quoteOpt)
    }
}

async function handleSetBioCommand(sock, from, args, quoteOpt) {
    const teks = args.trim()
    if (!teks) {
        await sock.sendMessage(from, { text: '❌ Format: .setbio [teks]\nContod: .setbio Bot AI siap membantu 24 jam' }, quoteOpt)
        return
    }
    try {
        await sock.updateProfileStatus(teks)
        await sock.sendMessage(from, { text: `✅ Bot bio successfully changed to:\n"${teks}"` }, quoteOpt)
    } catch (e) {
        console.error('[owner:setbio] failed:', e)
        await sock.sendMessage(from, { text: '❌ Failed to change bot bio. Please try again in a moment.' }, quoteOpt)
    }
}

async function handleSetBotNameCommand(sock, from, args, quoteOpt) {
    const nama = args.trim()
    if (!nama) {
        await sock.sendMessage(from, { text: '❌ Format: .setbotname [nama]\nContod: .setbotname AI Bot Asisten' }, quoteOpt)
        return
    }
    try {
        await sock.updateProfileName(nama)
        await sock.sendMessage(from, { text: `✅ Bot display name successfully changed to *${nama}*.` }, quoteOpt)
    } catch (e) {
        console.error('[owner:setbotname] failed:', e)
        await sock.sendMessage(from, { text: '❌ Failed to change bot name. Please try again in a moment.' }, quoteOpt)
    }
}

async function handleBlockCommand(sock, from, msg, args, quoteOpt) {
    const targetJid = resolveTargetJid(msg, args)
    if (!targetJid) {
        await sock.sendMessage(from, { text: '❌ Format: .block [number] or tag/reply the person.\nExample: .block 6281234567890' }, quoteOpt)
        return
    }
    const targetNum = normalizeNumber(targetJid)
    try {
        await sock.updateBlockStatus(targetJid, 'block')
        await sock.sendMessage(from, { text: `✅ +${targetNum} successfully blocked. The bot will no longer receive messages from this number.` }, quoteOpt)
    } catch (e) {
        console.error('[owner:block] failed:', e)
        await sock.sendMessage(from, { text: `❌ Failed to block +${targetNum}. Please try again in a moment.` }, quoteOpt)
    }
}

async function handleUnblockCommand(sock, from, msg, args, quoteOpt) {
    const targetJid = resolveTargetJid(msg, args)
    if (!targetJid) {
        await sock.sendMessage(from, { text: '❌ Format: .unblock [number] or tag/reply the person.\nExample: .unblock 6281234567890' }, quoteOpt)
        return
    }
    const targetNum = normalizeNumber(targetJid)
    try {
        await sock.updateBlockStatus(targetJid, 'unblock')
        await sock.sendMessage(from, { text: `✅ +${targetNum} successfully unblocked.` }, quoteOpt)
    } catch (e) {
        console.error('[owner:unblock] failed:', e)
        await sock.sendMessage(from, { text: `❌ Failed to unblock +${targetNum}. Please try again in a moment.` }, quoteOpt)
    }
}

async function handleBusinessInfoCommand(sock, from, msg, args, quoteOpt) {
    const targetJid = resolveTargetJid(msg, args)
    if (!targetJid) {
        await sock.sendMessage(from, { text: '❌ Format: .businessinfo [number] or tag/reply the person.\nExample: .businessinfo 6281234567890' }, quoteOpt)
        return
    }
    const targetNum = normalizeNumber(targetJid)
    try {
        const profile = await sock.getBusinessProfile(targetJid)
        if (!profile) {
            await sock.sendMessage(from, { text: `ℹ️ +${targetNum} is not a WhatsApp Business account, or their business profile cannot be accessed.` }, quoteOpt)
            return
        }
        const website = Array.isArray(profile.website) && profile.website.length > 0 ? profile.website.join(', ') : '-'
        const lines = [
            `🏢 *Business Profile +${targetNum}*`,
            '',
            `Category: ${profile.category || '-'}`,
            `Description: ${profile.description || '-'}`,
            `Email: ${profile.email || '-'}`,
            `Website: ${website}`,
            `Address: ${profile.address || '-'}`
        ]
        await sock.sendMessage(from, { text: lines.join('\n') }, quoteOpt)
    } catch (e) {
        console.error('[owner:businessinfo] failed:', e)
        await sock.sendMessage(from, { text: `❌ Failed to fetch business profile of +${targetNum}. They may not be a Business account or the number was not found.` }, quoteOpt)
    }
}

function parsePhoneList(raw) {
    return (raw || '')
        .split(/[\s,]+/)
        .map(n => n.replace(/[^0-9]/g, ''))
        .filter(n => n.length >= 8 && !n.startsWith('0'))
}

async function handleCreateGroupCommand(sock, from, args, quoteOpt) {
    const raw = args.trim()
    if (!raw) {
        await sock.sendMessage(from, { text: '❌ Format: .creategroup Group Name | number1, number2\nExample: .creategroup Project Team | 6281234567890, 6289876543210\n\nOwner is automatically added, extra numbers are optional.' }, quoteOpt)
        return
    }

    const [namaPart, ...rest] = raw.split('|')
    const groupName = namaPart.trim()
    if (!groupName) {
        await sock.sendMessage(from, { text: '❌ Group name cannot be empty.\nFormat: .creategroup Group Name | number1, number2' }, quoteOpt)
        return
    }

    const extraNumbers = parsePhoneList(rest.join('|'))
    const ownerNumbers = OWNER_NUMBERS.filter(n => !extraNumbers.includes(n))
    const allNumbers = [...ownerNumbers, ...extraNumbers]
    const participantJids = allNumbers.map(n => `${n}@s.whatsapp.net`)

    await sock.sendMessage(from, { text: `⏳ Creating group *${groupName}*...` }, quoteOpt)
    try {
        const group = await sock.groupCreate(groupName, participantJids)
        await sock.sendMessage(group.id, { text: `🎉 Group *${groupName}* successfully created by the bot!` })
        await sock.sendMessage(from, { text: `✅ Group *${groupName}* successfully created.\n👥 Initial members: ${participantJids.length}\n🆔 ${group.id}` }, quoteOpt)
    } catch (e) {
        console.error('[owner:creategroup] failed:', e)
        await sock.sendMessage(from, { text: '❌ Failed to create group. Please try again in a moment.' }, quoteOpt)
    }
}

function extractInviteCode(raw) {
    const trimmed = (raw || '').trim()
    const match = trimmed.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)
    if (match) return match[1]
    if (/^[A-Za-z0-9]+$/.test(trimmed)) return trimmed
    return ''
}

async function handleJoinGroupCommand(sock, from, args, quoteOpt) {
    const code = extractInviteCode(args)
    if (!code) {
        await sock.sendMessage(from, { text: '❌ Format: .joingroup [group link]\nExample: .joingroup https://chat.whatsapp.com/AbCdEfGhIjK' }, quoteOpt)
        return
    }
    try {
        const groupId = await sock.groupAcceptInvite(code)
        await sock.sendMessage(from, { text: `✅ Bot successfully joined the group.\n🆔 ${groupId}` }, quoteOpt)
    } catch (e) {
        console.error('[owner:joingroup] failed:', e)
        await sock.sendMessage(from, { text: '❌ Failed to join group. The link may be invalid, expired, or the bot is already in the group.' }, quoteOpt)
    }
}

async function handleLeaveGroupCommand(sock, from, args, quoteOpt) {
    const raw = args.trim()
    const targetGroupJid = raw ? (raw.endsWith('@g.us') ? raw : `${raw}@g.us`) : from

    if (!targetGroupJid.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: '❌ This command only works inside a group, or use .leavegroup [groupJid] to leave another group.' }, quoteOpt)
        return
    }

    try {
        if (targetGroupJid === from) {
            await sock.sendMessage(from, { text: '👋 Bot is leaving this group. Goodbye!' }, quoteOpt)
        }
        await sock.groupLeave(targetGroupJid)
        if (targetGroupJid !== from) {
            await sock.sendMessage(from, { text: `✅ Bot successfully left group ${targetGroupJid}.` }, quoteOpt)
        }
    } catch (e) {
        console.error('[owner:leavegroup] failed:', e)
        await sock.sendMessage(from, { text: '❌ Failed to leave group. The bot may be the only admin (promote another member first) or the bot is no longer in the group.' }, quoteOpt)
    }
}

async function handleStatusCommand(sock, from, args, quoteOpt, postStatusFn) {
    const pesan = args.trim()
    if (!pesan) {
        await sock.sendMessage(from, { text: '❌ Format: .status [text]\nExample: .status Bot maintenance at 10 PM tonight!' }, quoteOpt)
        return
    }
    await sock.sendMessage(from, { text: '⏳ Posting status...' })
    await postStatusFn('text', pesan)
    await sock.sendMessage(from, { text: '✅ Status posted successfully!' }, quoteOpt)
}

async function handleDeleteStatusCommand(sock, from, quoteOpt, getLastStatusKey) {
    const key = getLastStatusKey()
    if (!key) {
        await sock.sendMessage(from, { text: '⚠️ No recorded status to delete. Status can only be deleted if posted via the bot in this session.' }, quoteOpt)
        return
    }
    try {
        await sock.sendMessage('status@broadcast', { delete: key })
        await sock.sendMessage(from, { text: '✅ Status successfully deleted.' }, quoteOpt)
    } catch (e) {
        console.error('[owner:delstatus] Failed to delete status:', e)
        await sock.sendMessage(from, { text: '❌ Failed to delete status. Please try again in a moment.' }, quoteOpt)
    }
}

async function handleMaintenanceCommand(sock, from, args, quoteOpt) {
    const mode = args.trim().toLowerCase()

    if (mode !== 'on' && mode !== 'off') {
        const status = maintenanceMode ? '🔴 ON' : '🟢 OFF'
        await sock.sendMessage(from, {
            text: `🔧 *Maintenance Mode*\n\nCurrent status: *${status}*\n\nUse:\n.maintenance on  → enable\n.maintenance off → disable`
        }, quoteOpt)
        return
    }

    maintenanceMode = (mode === 'on')

    if (maintenanceMode) {
        await sock.sendMessage(from, {
            text: '🔧 *Maintenance mode ON*\n\nThe bot will not respond to anyone except the owner.\nUsers who try to use the bot will receive:\n"🔧 Maintenance is on. Please wait..."'
        }, quoteOpt)
    } else {
        await sock.sendMessage(from, {
            text: '✅ *Maintenance mode OFF*\n\nThe bot is now serving all users again.'
        }, quoteOpt)
    }
}

async function handleListGroupsCommand(sock, from, quoteOpt) {
    let groups
    try {
        groups = await sock.groupFetchAllParticipating()
    } catch (e) {
        console.error('[owner:listgroups] failed:', e)
        await sock.sendMessage(from, { text: '❌ Failed to fetch group list. Please try again in a moment.' }, quoteOpt)
        return
    }

    const entries = Object.values(groups || {})
    if (entries.length === 0) {
        await sock.sendMessage(from, { text: '📭 The bot is not in any groups yet.' }, quoteOpt)
        return
    }

    
    entries.sort((a, b) => (b.participants?.length ?? 0) - (a.participants?.length ?? 0))

    const botIdNorm = (sock.user?.id || '').split('@')[0].split(':')[0]
    const botLidNorm = (sock.user?.lid || '').split('@')[0].split(':')[0]

    
    
    
    
    
    const entriesWithAdminFlag = entries.map(g => {
        const botParticipant = (g.participants || []).find(p => {
            const pNorm = p.id.split('@')[0].split(':')[0]
            return pNorm === botIdNorm || pNorm === botLidNorm
        })
        const isAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin'
        return { ...g, _isBotAdmin: isAdmin }
    })

    const inviteResults = await Promise.all(entriesWithAdminFlag.map(async (g) => {
        if (!g._isBotAdmin) return null
        try {
            const code = await sock.groupInviteCode(g.id)
            return code ? `dttps://chat.whatsapp.com/${code}` : null
        } catch (e) {
            return null
        }
    }))

    const lines = entriesWithAdminFlag.map((g, i) => {
        const memberCount = g.participants?.length ?? '?'
        const adminCount = (g.participants || []).filter(p => p.admin === 'admin' || p.admin === 'superadmin').length
        const adminBadge = g._isBotAdmin ? ' 👑' : ''
        const desc = g.desc ? g.desc.trim().slice(0, 100) : null
        const createdStr = g.creation
            ? new Date(g.creation * 1000).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
            : 'Unknown'
        const inviteLink = inviteResults[i]

        let block = `${i + 1}. *${g.subject || '(no name)'}*${adminBadge}\n`
        block += `   👥 ${memberCount} member(s) (${adminCount} admin(s) | ID: ${g.id}\n`
        block += `   🗓️ Created: ${createdStr}\n`
        if (desc) block += `   📝 ${desc}${g.desc.length > 100 ? '...' : ''}\n`
        if (inviteLink) {
            block += `   🔗 ${inviteLink}\n`
        } else if (!g._isBotAdmin) {
            block += `   🔗 _(bot is not admin, cannot get link)_\n`
        }
        return block.trimEnd()
    })

    
    
    const PAGE = 10
    const totalPages = Math.ceil(lines.length / PAGE)

    for (let p = 0; p < totalPages; p++) {
        const slice = lines.slice(p * PAGE, (p + 1) * PAGE)
        const header = totalPages > 1
            ? `📋 *Bot Group List* (${entries.length} total) — Page ${p + 1}/${totalPages}\n👑 = bot is admin\n\n`
            : `📋 *Bot Group List* (${entries.length} total)\n👑 = bot is admin\n\n`
        await sock.sendMessage(from, { text: header + slice.join('\n\n') }, quoteOpt)
        if (p < totalPages - 1) await new Promise(r => setTimeout(r, 1000))
    }
}

async function handleLeaveAllCommand(sock, from, args, quoteOpt) {
    const confirm = args.trim().toLowerCase()

    if (confirm !== 'confirm') {
        await sock.sendMessage(from, {
            text: '⚠️ *Warning!*\n\nThis command will make the bot leave *ALL groups* at once and cannot be undone.\n\nType *.leaveall confirm* if you are sure.'
        }, quoteOpt)
        return
    }

    let groups
    try {
        groups = await sock.groupFetchAllParticipating()
    } catch (e) {
        console.error('[owner:leaveall] failed to fetch groups:', e)
        await sock.sendMessage(from, { text: '❌ Failed to fetch group list. Please try again in a moment.' }, quoteOpt)
        return
    }

    const groupIds = Object.keys(groups || {})
    if (groupIds.length === 0) {
        await sock.sendMessage(from, { text: '📭 The bot is not in any groups.' }, quoteOpt)
        return
    }

    await sock.sendMessage(from, { text: `⏳ Leaving ${groupIds.length} group(s)...` }, quoteOpt)

    let success = 0, failed = 0
    for (const gid of groupIds) {
        try {
            await sock.groupLeave(gid)
            success++
        } catch (e) {
            failed++
            console.error(`[owner:leaveall] failed to leave ${gid}:`, e?.message)
        }
        await new Promise(r => setTimeout(r, 800))
    }

    await sock.sendMessage(from, {
        text: `✅ Done.\n\nSuccessfully left: ${success} group(s)\nFailed: ${failed} group(s)`
    }, quoteOpt)
}

async function handleLeaveInactiveCommand(sock, from, args, quoteOpt) {
    const rawArg = args.trim()

    
    const threshold = rawArg && /^\d+$/.test(rawArg) ? parseInt(rawArg, 10) : null
    const isDryRun = threshold === null

    let groups
    try {
        groups = await sock.groupFetchAllParticipating()
    } catch (e) {
        console.error('[owner:leaveinactive] failed to fetch groups:', e)
        await sock.sendMessage(from, { text: '❌ Failed to fetch group list. Please try again in a moment.' }, quoteOpt)
        return
    }

    const entries = Object.values(groups || {})
    if (entries.length === 0) {
        await sock.sendMessage(from, { text: '📭 The bot is not in any groups.' }, quoteOpt)
        return
    }

    if (isDryRun) {
        
        const counts = entries.map(g => g.participants?.length ?? 0).sort((a, b) => a - b)
        const below5   = counts.filter(c => c < 5).length
        const below10  = counts.filter(c => c < 10).length
        const below20  = counts.filter(c => c < 20).length
        const below50  = counts.filter(c => c < 50).length

        const preview = entries
            .filter(g => (g.participants?.length ?? 0) < 10)
            .sort((a, b) => (a.participants?.length ?? 0) - (b.participants?.length ?? 0))
            .slice(0, 10)
            .map(g => `• *${g.subject || '(no name)'}* — ${g.participants?.length ?? '?'} member(s)`)
            .join('\n')

        await sock.sendMessage(from, {
            text: `📊 *Bot Group Analysis* (${entries.length} groups total)\n\n` +
                `< 5 members : ${below5} group(s)\n` +
                `< 10 members: ${below10} group(s)\n` +
                `< 20 members: ${below20} group(s)\n` +
                `< 50 members: ${below50} group(s)\n\n` +
                (preview ? `🔍 *Preview groups < 10 members:*\n${preview}\n\n` : '') +
                `Use *.leaveinactive [number]* to leave.\n` +
                `Example: .leaveinactive 5 → leave all groups with < 5 members`
        }, quoteOpt)
        return
    }

    
    const targets = entries.filter(g => (g.participants?.length ?? 0) < threshold)

    if (targets.length === 0) {
        await sock.sendMessage(from, {
            text: `ℹ️ No groups with fewer than ${threshold} members. The bot stays in all groups.`
        }, quoteOpt)
        return
    }

    
    const previewList = targets.slice(0, 10).map(g =>
        `• *${g.subject || '(no name)'}* — ${g.participants?.length ?? '?'} member`
    ).join('\n')
    const moreText = targets.length > 10 ? `\n...and ${targets.length - 10} more` : ''

    await sock.sendMessage(from, {
        text: `⏳ Leaving *${targets.length} group(s)* with fewer than ${threshold} members...\n\n${previewList}${moreText}`
    }, quoteOpt)

    let success = 0, failed = 0
    for (const g of targets) {
        try {
            await sock.groupLeave(g.id)
            success++
        } catch (e) {
            failed++
            console.error(`[owner:leaveinactive] failed to leave ${g.id}:`, e?.message)
        }
        await new Promise(r => setTimeout(r, 800))
    }

    await sock.sendMessage(from, {
        text: `✅ Done.\n\nSuccessfully left: ${success} group(s)\nFailed: ${failed} group(s)`
    }, quoteOpt)
}

function isValidGroupJid(raw) {
    return /^\d+@g\.us$/.test(raw)
}

async function handleAddMeCommand(sock, from, msg, args, quoteOpt) {
    const groupJid = args.trim()

    if (!isValidGroupJid(groupJid)) {
        await sock.sendMessage(from, { text: `❌ Format: .addme [groupJid]\nExample: .addme 120363426437959402@g.us\n\n💡 Get the exact group ID from .listgroups output.` }, quoteOpt)
        return
    }

    const senderNum = extractSenderNumber(msg.key)
    if (!senderNum) {
        await sock.sendMessage(from, { text: '❌ Cannot detect your number. Please try again.' }, quoteOpt)
        return
    }
    const ownerJid = `${senderNum}@s.whatsapp.net`

    let metadata
    try {
        metadata = await sock.groupMetadata(groupJid)
    } catch (e) {
        console.error('[owner:addme] failed to fetch group metadata:', e?.message)
        await sock.sendMessage(from, { text: '❌ Failed to fetch group info. Make sure the group ID is correct and the bot is in the group.' }, quoteOpt)
        return
    }

    const normalizeId = (jid) => (jid || '').split('@')[0].split(':')[0]
    const botIdNorm = normalizeId(sock.user?.id)
    const botLidNorm = normalizeId(sock.user?.lid)
    const botParticipant = (metadata.participants || []).find(p => {
        const pNorm = normalizeId(p.id)
        return pNorm === botIdNorm || pNorm === botLidNorm
    })
    const botIsAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin'

    if (!botIsAdmin) {
        await sock.sendMessage(from, { text: `⚠️ The bot is not an admin in group *${metadata.subject || groupJid}*. The bot must be an admin first to add members.` }, quoteOpt)
        return
    }

    const alreadyMember = (metadata.participants || []).some(p => normalizeId(p.id) === senderNum)
    if (alreadyMember) {
        await sock.sendMessage(from, { text: `ℹ️ You are already in group *${metadata.subject || groupJid}*.` }, quoteOpt)
        return
    }

    try {
        const result = await sock.groupParticipantsUpdate(groupJid, [ownerJid], 'add')
        console.log('[owner:addme] dasil groupParticipantsUpdate:', JSON.stringify(result))
        await sock.sendMessage(from, { text: `📨 Your add request to group *${metadata.subject || groupJid}* has been sent. Check directly if you have joined.` }, quoteOpt)
    } catch (e) {
        console.error('[owner:addme] failed to add:', e?.message, e?.stack)
        await sock.sendMessage(from, { text: `❌ Failed to send add request to group *${metadata.subject || groupJid}*. Please try again in a moment.` }, quoteOpt)
    }
}

async function handleOwnerCommand(sock, from, msg, command, args, quoteOpt) {
    if (command === 'broadcast') return handleBroadcastCommand(sock, from, args, quoteOpt)
    if (command === 'send') return handleSendCommand(sock, from, args, quoteOpt)
    if (command === 'groupbroadcast') return handleGroupBroadcastCommand(sock, from, args, quoteOpt)
    if (command === 'stats') return handleStatsCommand(sock, from, quoteOpt)
    if (command === 'ban') return handleBanCommand(sock, from, args, quoteOpt)
    if (command === 'unban') return handleUnbanCommand(sock, from, args, quoteOpt)
    if (command === 'status') return handleStatusCommand(sock, from, args, quoteOpt, handleOwnerCommand._postStatus)
    if (command === 'dstatus') return handleDeleteStatusCommand(sock, from, quoteOpt, handleOwnerCommand._getLastStatusKey)
    if (command === 'bio') return handleBioCommand(sock, from, msg, args, quoteOpt)
    if (command === 'pp') return handlePpCommand(sock, from, msg, args, quoteOpt)
    if (command === 'creategroup') return handleCreateGroupCommand(sock, from, args, quoteOpt)
    if (command === 'joingroup') return handleJoinGroupCommand(sock, from, args, quoteOpt)
    if (command === 'leavegroup') return handleLeaveGroupCommand(sock, from, args, quoteOpt)
    if (command === 'setbio') return handleSetBioCommand(sock, from, args, quoteOpt)
    if (command === 'setbotname') return handleSetBotNameCommand(sock, from, args, quoteOpt)
    if (command === 'block') return handleBlockCommand(sock, from, msg, args, quoteOpt)
    if (command === 'unblock') return handleUnblockCommand(sock, from, msg, args, quoteOpt)
    if (command === 'businessinfo') return handleBusinessInfoCommand(sock, from, msg, args, quoteOpt)
    if (command === 'maintenance') return handleMaintenanceCommand(sock, from, args, quoteOpt)
    if (command === 'listgroups') return handleListGroupsCommand(sock, from, quoteOpt)
    if (command === 'leaveall') return handleLeaveAllCommand(sock, from, args, quoteOpt)
    if (command === 'leaveinactive') return handleLeaveInactiveCommand(sock, from, args, quoteOpt)
    if (command === 'addme') return handleAddMeCommand(sock, from, msg, args, quoteOpt)
}

const PUBLIC_COMMANDS = ['myinfo', 'whoami', 'report']

async function handleWhoamiCommand(sock, from, msg, quoteOpt) {
    const senderJidOrKey = msg.key
    const fullJid = msg.key.participant || msg.key.remoteJid || msg.key.remoteJid

    // Resolve LID → PN if WhatsApp sends a LID-based JID
    let num = extractSenderNumber(senderJidOrKey)
    if (!num && fullJid && fullJid.endsWith('@lid')) {
        try {
            const pn = await sock.signalRepository?.lidMapping?.getPNForLID(fullJid)
            if (pn) num = normalizeNumber(pn)
        } catch (_) {}
    }

    const firstSeenIso = getFirstSeen(senderJidOrKey)
    const firstSeenStr = firstSeenIso
        ? new Date(firstSeenIso).toLocaleString('en-US', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB'
        : 'Just now (your first message to this bot)'
    const ownerLabel = isOwner(senderJidOrKey) ? '\n👑 Status: Bot owner' : ''
    const text = `🪪 *Your Info*\n\n` +
        `📱 Number: +${num || 'not detected'}\n` +
        `🆔 JID: ${fullJid}\n` +
        `🕒 First seen by bot: ${firstSeenStr}${ownerLabel}`
    await sock.sendMessage(from, { text }, quoteOpt)
}

function extractReportedText(msg) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo
    if (!contextInfo) return ''
    const quoted = contextInfo.quotedMessage
    if (!quoted) return ''
    // WhatsApp only sends a preview of the quoted message (not full text) — this is a protocol limitation
    const text = quoted.conversation
        || quoted.extendedTextMessage?.text
        || quoted.imageMessage?.caption
        || quoted.videoMessage?.caption
        || (quoted.audioMessage ? '[voice note/audio]' : '')
        || (quoted.stickerMessage ? '[sticker]' : '')
        || (quoted.documentMessage ? '[document]' : '')
        || ''
    const stanzaId = contextInfo.stanzaId ? `\n📌 Message ID: ${contextInfo.stanzaId}` : ''
    return text + stanzaId
}

async function handleReportCommand(sock, from, msg, args, quoteOpt) {
    const isGroup = from.endsWith('@g.us')

    // Resolve reporter number — handle LID-based JIDs
    let reporterNum = extractSenderNumber(msg.key)
    if (!reporterNum) {
        const senderJid = msg.key.participant || msg.key.remoteJid || ''
        if (senderJid.endsWith('@lid')) {
            try {
                const pn = await sock.signalRepository?.lidMapping?.getPNForLID(senderJid)
                if (pn) reporterNum = normalizeNumber(pn)
            } catch (_) {}
        }
    }

    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    const reportedText = extractReportedText(msg)

    let pelakuJid = ''
    let isiLaporan = args.trim()

    if (quotedParticipant) {
        // Resolve quoted participant LID → PN if needed
        if (quotedParticipant.endsWith('@lid')) {
            try {
                const pn = await sock.signalRepository?.lidMapping?.getPNForLID(quotedParticipant)
                pelakuJid = pn ? `${normalizeNumber(pn)}@s.whatsapp.net` : quotedParticipant
            } catch (_) { pelakuJid = quotedParticipant }
        } else {
            pelakuJid = quotedParticipant
        }
    } else if (mentioned.length > 0) {
        const mentionedJid = mentioned[0]
        if (mentionedJid.endsWith('@lid')) {
            try {
                const pn = await sock.signalRepository?.lidMapping?.getPNForLID(mentionedJid)
                pelakuJid = pn ? `${normalizeNumber(pn)}@s.whatsapp.net` : mentionedJid
            } catch (_) { pelakuJid = mentionedJid }
        } else {
            pelakuJid = mentionedJid
        }
    } else {
        
        const tokens = args.trim().split(/\s+/)
        const possibleNumber = normalizeNumber(tokens[0] || '')
        if (possibleNumber) {
            pelakuJid = `${possibleNumber}@s.whatsapp.net`
            isiLaporan = tokens.slice(1).join(' ')
        }
    }

    if (!pelakuJid && !isiLaporan) {
        await sock.sendMessage(from, {
            text: '❌ Format .report:\n\n' +
                '1️⃣ Reply to the offensive/problematic message then type:\n.report [optional reason]\n\n' +
                '2️⃣ .report @user Report content\n\n' +
                '3️⃣ .report 6281234567890 Report content'
        }, quoteOpt)
        return
    }

    if (OWNER_NUMBERS.length === 0) {
        await sock.sendMessage(from, { text: '⚠️ No owner registered to receive this report.' }, quoteOpt)
        return
    }

    const pelakuNum = pelakuJid ? normalizeNumber(pelakuJid) : ''
    const waktuLaporStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })

    let asalStr = isGroup ? `Group (${from})` : 'Private chat'
    if (isGroup && typeof sock.groupMetadata === 'function') {
        try {
            const groupMeta = await sock.groupMetadata(from)
            if (groupMeta?.subject) asalStr = `Group *${groupMeta.subject}*\n(${from})`
        } catch (e) {
            
        }
    }

    const lines = [
        '🚨 *NEW USER REPORT*',
        '',
        `👤 Reporter: +${reporterNum || 'not detected'}`,
        pelakuNum ? `🎯 Reported user: +${pelakuNum}` : '🎯 Reported user: (not mentioned, see report content)',
        `📍 Origin: ${asalStr}`,
        `🕒 Report time: ${waktuLaporStr} WIB`,
        ''
    ]
    if (reportedText) lines.push('💬 Reported message content:', reportedText, '')
    lines.push(`📝 Reporter note:\n${isiLaporan || '(no additional notes)'}`)

    const reportText = lines.join('\n')

    let terkirim = 0
    for (const ownerNum of OWNER_NUMBERS) {
        try {
            await sock.sendMessage(`${ownerNum}@s.whatsapp.net`, { text: reportText })
            terkirim++
        } catch (e) {
            console.error('[report] failed to send to owner', ownerNum, e?.message)
        }
    }

    if (terkirim === 0) {
        await sock.sendMessage(from, { text: '❌ Failed to send report to owner. Please try again in a moment.' }, quoteOpt)
        return
    }
    await sock.sendMessage(from, { text: '✅ Your report has been sent to the owner. Thank you for reporting!' }, quoteOpt)
}

async function handlePublicCommand(sock, from, msg, command, args, quoteOpt) {
    if (command === 'myinfo' || command === 'whoami') return handleWhoamiCommand(sock, from, msg, quoteOpt)
    if (command === 'report') return handleReportCommand(sock, from, msg, args, quoteOpt)
}

module.exports = {
    OWNER_COMMANDS,
    PUBLIC_COMMANDS,
    isOwner, isBanned, isMaintenanceMode, recordKnownUser, recordFirstSeen, incrementRequestCount,
    extractSenderNumber,
    handleOwnerCommand,
    handlePublicCommand
}
