'use strict'

const fs = require('fs')

const STATS_FILE = './groupStats.json'

function getWeekIndex(anchorDate, now = new Date()) {
    const anchor = new Date(anchorDate)
    const diffMs = now.getTime() - anchor.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    return Math.max(0, Math.floor(diffDays / 7))
}

function getWeekRange(anchorDate, weekIndex) {
    const anchor = new Date(anchorDate)
    const start = new Date(anchor.getTime() + weekIndex * 7 * 86400000)
    const end = new Date(start.getTime() + 6 * 86400000)
    return { start, end }
}

function normalizeJid(jid) {
    if (!jid) return jid
    return jid.split('@')[0].split(':')[0]
}

let statsData = {}
let _saveLock = false

function _load() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            statsData = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'))
        }
    } catch (e) {
        console.error('[groupStats] failed to load groupStats.json:', e?.message)
        statsData = {}
    }
}

async function _save() {
    if (_saveLock) return
    _saveLock = true
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(statsData, null, 2))
    } catch (e) {
        console.error('[groupStats] failed to save groupStats.json:', e?.message)
    } finally {
        _saveLock = false
    }
}

_load()

function _checkAndResetWeek(groupJid) {
    if (!statsData[groupJid]) {
        const anchorDate = new Date().toISOString()
        statsData[groupJid] = { anchorDate, weekIndex: 0, weeklyMessages: {}, totalWeeklyMessages: 0 }
        return true
    }
    const entry = statsData[groupJid]
    
    
    if (!entry.anchorDate) {
        entry.anchorDate = new Date().toISOString()
        entry.weekIndex = 0
        entry.weeklyMessages = {}
        entry.totalWeeklyMessages = 0
        delete entry.weekKey
        return true
    }
    const currentWeekIndex = getWeekIndex(entry.anchorDate)
    if (entry.weekIndex !== currentWeekIndex) {
        entry.weekIndex = currentWeekIndex
        entry.weeklyMessages = {}
        entry.totalWeeklyMessages = 0
        return true 
    }
    return false
}

function recordGroupMessage(groupJid, senderJid) {
    const normalized = normalizeJid(senderJid)
    _checkAndResetWeek(groupJid)

    const group = statsData[groupJid]
    group.weeklyMessages[normalized] = (group.weeklyMessages[normalized] || 0) + 1
    group.totalWeeklyMessages = (group.totalWeeklyMessages || 0) + 1

    
    _save().catch(() => {})
}

function getGroupStatsData(groupJid) {
    _checkAndResetWeek(groupJid)
    return statsData[groupJid] || null
}

async function handleGroupStatsCommand(sock, from, msg, quoteOpt) {
    
    if (!from?.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: '⚠️ The .groupstats command can only be used inside a group.' }, quoteOpt)
        return
    }

    
    let metadata
    try {
        metadata = await sock.groupMetadata(from)
    } catch (e) {
        console.error('[groupStats] failed to fetch metadata:', e?.message)
        await sock.sendMessage(from, { text: '❌ Failed to fetch group data. Please try again in a moment.' }, quoteOpt)
        return
    }

    const totalMembers = metadata.participants?.length ?? 0
    const groupName    = metadata.subject ?? 'This Group'

    
    
    const ownerJid     = metadata.owner      
    const ownerDisplay = ownerJid
        ? `@${normalizeJid(ownerJid)}`
        : '_Unknown_'

    
    
    let createdStr = '_Unknown_'
    if (metadata.creation) {
        const createdDate = new Date(metadata.creation * 1000)
        createdStr = createdDate.toLocaleDateString('en-US', {
            day:   '2-digit',
            month: 'long',
            year:  'numeric',
            timeZone: 'UTC'
        })
    }

    
    _checkAndResetWeek(from)
    const statsNow   = statsData[from]
    const totalMsgW  = statsNow?.totalWeeklyMessages ?? 0
    const weeklyMap  = statsNow?.weeklyMessages ?? {}

    
    
    const { start: weekStartDate, end: weekEndDate } = getWeekRange(statsNow.anchorDate, statsNow.weekIndex)
    const fmtDate = (d) => d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    const weekRangeStr = `${fmtDate(weekStartDate)} – ${fmtDate(weekEndDate)}`

    
    const sorted = Object.entries(weeklyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)

    
    const mentionJids = []
    if (ownerJid) mentionJids.push(ownerJid)

    let topActiveLines = ''
    if (sorted.length === 0) {
        topActiveLines = '   _No activity this week yet_'
    } else {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
        topActiveLines = sorted.map(([normJid, count], i) => {
            const fullJid = normJid + '@s.whatsapp.net'
            if (!mentionJids.includes(fullJid)) mentionJids.push(fullJid)
            return `   ${medals[i]} @${normJid} — *${count}* messages`
        }).join('\n')
    }

    
    const adminCount  = metadata.participants?.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length ?? 0
    const memberCount = totalMembers - adminCount

    
    const text = [
        `📊 *GROUP STATISTICS*`,
        `╔══════════════════════════`,
        `║ 📛 *${groupName}*`,
        `╠══════════════════════════`,
        `║`,
        `║ 👥 *Total Members*`,
        `║   ${totalMembers} members (${adminCount} admin · ${memberCount} member)`,
        `║`,
        `║ 💬 *Messages This Week*`,
        `║   📅 ${weekRangeStr}`,
        `║   Total: *${totalMsgW}* messages`,
        `║   _(auto-reset every 7 days since the bot became active in this group)_`,
        `║`,
        `║ 🏆 *Most Active Members*`,
        topActiveLines,
        `║`,
        `║ 👑 *Group Creator*`,
        `║   ${ownerDisplay}`,
        `║`,
        `║ 🗓️ *Group Created*`,
        `║   ${createdStr}`,
        `║`,
        `╚══════════════════════════`,
        `_💡 Statistics only count messages since the bot became active_`
    ].join('\n')

    await sock.sendMessage(from, { text, mentions: mentionJids }, quoteOpt)
}

module.exports = {
    recordGroupMessage,
    getGroupStatsData,
    handleGroupStatsCommand,
    getWeekIndex,  
    getWeekRange   
}
