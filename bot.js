'use strict'

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys')
const fs = require('fs')
const cron = require('node-cron')

const DEBUG = process.env.DEBUG === '1'
function dlog(...a) { if (DEBUG) console.log(...a) }

const {
    maskSensitiveData, addHistory,
    callAI, generateImage, generateVideo, getValidProviders,
    hasValidKeys, clearHistory,
    imageToSticker, videoToSticker, textToSticker
} = require('./modules/ai')

const { fetchGempaID, fetchGempaUSGS, fetchEarthquakeUSGS } = require('./modules/earthquake')

const { handleDownload, cleanupDownload, activeDownloads, checkUrlSafety, REJECT_MESSAGE: URL_REJECT_MESSAGE } = require('./modules/downloader')

const { getShortStoryRandom, getRhymeRandom, getPoemRandom } = require('./modules/literature')
const { getQuizRandom, checkJawaban } = require('./modules/quiz')

const { getMotivationRandom, getFunFactRandom, getReflectionRandom, getPhilosophicalRandom } = require('./modules/inspiration')

const {
    INDONESIA_ALIAS,
    geocodeCity, reverseGeocode, fetchWeather, formatWeatherMessage,
    handleWeatherCommand, handleLocationWeather
} = require('./modules/weather')

const {
    GROUP_ADMIN_COMMANDS, DEFAULT_GROUP_SETTINGS,
    normalizeJid, getGroupSettings, setGroupSetting, saveGroupSettings,
    isGroupAdmin, isBotNumberJid,
    getFreshGroupMetadata, sendGroupGreeting,
    handleGroupAdminCommand,
    textMatchesFilter, addFilterWarn, resetFilterWarn,
    FILTER_KICK_THRESHOLD
} = require('./modules/group')

const {
    OWNER_COMMANDS, PUBLIC_COMMANDS,
    isOwner, isBanned, isMaintenanceMode, recordKnownUser, recordFirstSeen, incrementRequestCount,
    handleOwnerCommand, handlePublicCommand
} = require('./modules/owner')

const { createQueue } = require('./modules/queue')

const { sendListMessage, sendButtons, sendInteractiveMessage } = require('./modules/interactive')

const { handleStickerFromQuoted, handleStickerMessage, handleImageStickerCaption } = require('./modules/sticker')
const { detectAndBuildPayload, buildVCard, generateQR, decodeQRFromBuffer } = require('./modules/qr')

const BOT_NAME   = 'AI Bot'

const CRON_STATIC = []

const userLastBotMsg = {}
const userLastBotMsgOrder = []
const MAX_LAST_MSG_USERS = 500

function touchLastBotMsgOrder(jid) {
    const idx = userLastBotMsgOrder.indexOf(jid)
    if (idx !== -1) userLastBotMsgOrder.splice(idx, 1)
    userLastBotMsgOrder.push(jid)
}

function evictOldestLastBotMsgIfNeeded() {
    while (userLastBotMsgOrder.length > MAX_LAST_MSG_USERS) {
        const oldest = userLastBotMsgOrder.shift()
        delete userLastBotMsg[oldest]
    }
}

function getLastBotMsg(jid) {
    return userLastBotMsg[jid] || null
}

function setLastBotMsg(jid, key) {
    if (key === null) {
        userLastBotMsg[jid] = null
        return
    }
    userLastBotMsg[jid] = key
    touchLastBotMsgOrder(jid)
    evictOldestLastBotMsgIfNeeded()
}

const stickerQueue  = createQueue()
const mediaGenQueue = createQueue()

const userActiveTask = {}
const answeredQuiz = new Set() // key: stanzaId of question, each question can only be answered once

function getActiveToolLabel(jid) {
    const t = userActiveTask[jid]
    if (!t) return null
    const labels = { sticker: 'sticker', download: 'download', mediaGen: 'generate gambar/video' }
    return labels[t.tool] || t.tool
}

function claimActiveTask(jid, tool, cancelFn) {
    if (userActiveTask[jid]) return false
    userActiveTask[jid] = { tool, cancel: cancelFn }
    return true
}

function releaseActiveTask(jid) {
    delete userActiveTask[jid]
}

async function runDownloadCommand(sock, from, msg, args, mode, usageText) {
    const url = args.trim()
    if (!url || !url.startsWith('http')) { await sock.sendMessage(from, { text: usageText }); await sock.sendPresenceUpdate('paused', from); return }
    if (!isOwner(msg.key) && userActiveTask[from]) { await sock.sendMessage(from, { text: `⚠️ You still have an active *${getActiveToolLabel(from)}* process.\nType *.cp* to cancel it first.` }); await sock.sendPresenceUpdate('paused', from); return }
    if (!isOwner(msg.key)) claimActiveTask(from, 'download', () => { cleanupDownload(from) })
    try { await handleDownload(sock, from, url, mode) } finally { if (!isOwner(msg.key)) releaseActiveTask(from) }
    await sock.sendPresenceUpdate('paused', from)
}

async function runQueuedTool(sock, from, msgKey, queue, tool, task) {
    if (isOwner(msgKey)) {

        const controller = new AbortController()
        return task({ signal: controller.signal, registerKill: () => {} })
    }

    if (userActiveTask[from]) {
        const label = getActiveToolLabel(from)
        const hint = userActiveTask[from].tool === 'download' ? '.canceldownload' : '.cancelprocess'
        await sock.sendMessage(from, {
            text: `⚠️ You still have an active/pending *${label}* process.\n\nType *${hint}* to cancel it before using another tool.`
        })
        return undefined
    }

    const controller = new AbortController()
    let killFn = null
    let queueId = null
    const registerKill = (fn) => { killFn = fn }
    const cancel = () => { if (queueId !== null) queue.cancelWaiting(queueId); controller.abort(); if (killFn) killFn() }

    claimActiveTask(from, tool, cancel)

    const { id, promise } = queue.add(() => task({ signal: controller.signal, registerKill }))
    queueId = id

    let queueMsgKey = null
    let listenerCleaned = false

    const deleteQueueMsg = async () => {
        if (!queueMsgKey) return
        const key = queueMsgKey
        queueMsgKey = null
        try { await sock.sendMessage(from, { delete: key }) } catch (_) {}
    }

    let onAdvance
    const cleanupListener = () => {
        if (listenerCleaned) return
        listenerCleaned = true
        queue.offAdvance(onAdvance)
    }

    onAdvance = async () => {
        if (listenerCleaned) return
        const pos = queue.position(queueId)
        if (pos > 0) {

            if (queueMsgKey) {
                try {
                    await sock.sendMessage(from, {
                        text: `⏳ Queue position ${pos}, please wait...`,
                        edit: queueMsgKey
                    })
                } catch (_) {}
            }
        } else {

            cleanupListener()
            await deleteQueueMsg()
        }
    }

    const initialPos = queue.position(queueId)
    if (initialPos > 0) {

        try {
            const sent = await sock.sendMessage(from, { text: `⏳ Queue position ${initialPos}, please wait...` })
            queueMsgKey = sent?.key || null
        } catch (_) {}
        queue.onAdvance(onAdvance)
    }

    try {
        return await promise
    } catch (e) {
        if (e.message === 'CANCELLED_WHILE_WAITING' || e.name === 'AbortError') {
            cleanupListener()
            await deleteQueueMsg()
            return undefined
        }
        throw e
    } finally {
        cleanupListener()
        releaseActiveTask(from)
    }
}

async function runUnqueuedTool(task) {
    const controller = new AbortController()
    return task({ signal: controller.signal, registerKill: () => {} })
}

const userTimezones = fs.existsSync('./userTimezone.json')
    ? JSON.parse(fs.readFileSync('./userTimezone.json', 'utf-8')) : {}
let cronJobs = fs.existsSync('./cronJobs.json')
    ? JSON.parse(fs.readFileSync('./cronJobs.json', 'utf-8')) : []

let cronStarted = false
let cronSaveLock = false
const activeCronTasks = new Map()

const GROUP_CACHE_TTL_MS = 5 * 60 * 1000
const groupMetadataCache = new Map()

function getCachedGroupMetadata(groupJid) {
    const cached = groupMetadataCache.get(groupJid)
    if (!cached) return null
    if (Date.now() - cached.timestamp > GROUP_CACHE_TTL_MS) return null
    return cached.data
}

function setCachedGroupMetadata(groupJid, data) {
    groupMetadataCache.set(groupJid, { data, timestamp: Date.now() })
}

async function refreshGroupMetadataCache(sock, groupJid, reason) {
    const t0 = Date.now()
    try {
        const metadata = await sock.groupMetadata(groupJid)
        setCachedGroupMetadata(groupJid, metadata)
        console.log(`[group-cache] refreshed (${reason}) for ${groupJid} in ${Date.now() - t0}ms, participants=${metadata?.participants?.length}`)
        return metadata
    } catch (e) {
        console.log(`[group-cache] refresh FAILED (${reason}) for ${groupJid} after ${Date.now() - t0}ms:`, e?.message)
        return null
    }
}

const TIMEZONE_MAP = {
    'WIB':'Asia/Jakarta','WITA':'Asia/Makassar','WIT':'Asia/Jayapura',
    'MYT':'Asia/Kuala_Lumpur','SGT':'Asia/Singapore','PHT':'Asia/Manila',
    'BNT':'Asia/Brunei','ICT':'Asia/Bangkok','MMT':'Asia/Rangoon',
    'CST':'Asia/Shanghai','JST':'Asia/Tokyo','KST':'Asia/Seoul',
    'PYT':'Asia/Pyongyang','HKT':'Asia/Hong_Kong','TWN':'Asia/Taipei',
    'IST':'Asia/Kolkata','PKT':'Asia/Karachi','BDT':'Asia/Dhaka',
    'NPT':'Asia/Kathmandu','SLT':'Asia/Colombo','GST':'Asia/Dubai',
    'AST':'Asia/Riyadh','IRST':'Asia/Tehran','TRT':'Europe/Istanbul',
    'IDT':'Asia/Jerusalem','GMT':'Europe/London','BST':'Europe/London',
    'UTC':'UTC','CET':'Europe/Paris','CEST':'Europe/Paris',
    'EET':'Europe/Helsinki','MSK':'Europe/Moscow','AMS':'Europe/Amsterdam',
    'ROM':'Europe/Rome','MAD':'Europe/Madrid','EST':'America/New_York',
    'EDT':'America/New_York','CST_US':'America/Chicago','MST':'America/Denver',
    'PST':'America/Los_Angeles','PDT':'America/Los_Angeles','BRT':'America/Sao_Paulo',
    'ART':'America/Argentina/Buenos_Aires','CLT':'America/Santiago','COT':'America/Bogota',
    'AEST':'Australia/Sydney','AEDT':'Australia/Sydney','ACST':'Australia/Adelaide',
    'AWST':'Australia/Perth','NZST':'Pacific/Auckland','HST':'Pacific/Honolulu',
    'CAT':'Africa/Harare','EAT':'Africa/Nairobi','WAT':'Africa/Lagos','SAST':'Africa/Johannesburg'
}

const ALLOWED_IMAGE_MIME = ['image/jpeg','image/png','image/webp','image/gif']
const ALLOWED_VIDEO_MIME = ['video/mp4','video/3gpp','video/quicktime','video/x-matroska']
const ALLOWED_AUDIO_MIME = ['audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/ogg; codecs=opus']
const ALLOWED_DOC_MIME   = ['application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain']
const MAX_FILE_SIZE = 20 * 1024 * 1024

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15',

    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
]

const FALLBACK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

function getRandomUA() {
    if (!USER_AGENTS.length) return FALLBACK_USER_AGENT
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] || FALLBACK_USER_AGENT
}

function shouldQuote(msg) { return !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage }
function extractUrls(text) { return text.match(/https?:\/\/[^\s]+/g) || [] }

function getMsgType(msg) {
    const MEDIA_MSG_TYPES = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage']
    const keys = Object.keys(msg.message || {})
    const found = keys.find(k => MEDIA_MSG_TYPES.includes(k))
    if (found) return found
    if (keys.includes('conversation')) return 'conversation'
    if (keys.includes('extendedTextMessage')) return 'extendedTextMessage'
    if (keys.includes('listResponseMessage')) return 'listResponseMessage'
    if (keys.includes('interactiveResponseMessage')) return 'interactiveResponseMessage'
    if (keys.includes('templateButtonReplyMessage')) return 'templateButtonReplyMessage'
    if (keys.includes('reactionMessage')) return 'reactionMessage'
    if (keys.includes('pollUpdateMessage')) return 'pollUpdateMessage'
    return keys[0] || ''
}

function validateMime(mime, allowedList) {
    if (!mime) return false
    const normalized = mime.toLowerCase().trim()
    return allowedList.some(a => normalized.startsWith(a) || normalized === a)
}

function getFileSizeFromMsg(msg, msgType) {
    try {
        const m = msg.message
        if (msgType === 'imageMessage')    return m.imageMessage?.fileLength || 0
        if (msgType === 'videoMessage')    return m.videoMessage?.fileLength || 0
        if (msgType === 'audioMessage')    return m.audioMessage?.fileLength || 0
        if (msgType === 'documentMessage') return m.documentMessage?.fileLength || 0
    } catch(e) {}
    return 0
}

async function saveCronJobs() {
    while (cronSaveLock) { await new Promise(r => setTimeout(r, 50)) }
    cronSaveLock = true
    try { fs.writeFileSync('./cronJobs.json', JSON.stringify(cronJobs, null, 2)) }
    finally { cronSaveLock = false }
}

function scheduleDynamicCron(sock, job) {
    if (job.type === 'reminder' || job.type === 'unmute') return
    const task = cron.schedule(job.schedule, async () => {
        try { await sock.sendMessage(job.jid, { text: job.message }) } catch(e) {}
    }, { timezone: job.timezone || 'Asia/Jakarta' })
    activeCronTasks.set(job, task)
}

function stopAndRemoveDynamicCron(job) {
    const task = activeCronTasks.get(job)
    if (task) { task.stop(); activeCronTasks.delete(job) }
}

function startCronJobs(sock) {
    if (cronStarted) return
    cronStarted = true
    for (const job of CRON_STATIC) {
        cron.schedule(job.schedule, async () => {
            try { await sock.sendMessage(job.target, { text: job.message }) } catch(e) {}
        }, { timezone: job.timezone || 'Asia/Jakarta' })
    }
    for (const job of cronJobs) { scheduleDynamicCron(sock, job) }
    cron.schedule('* * * * *', async () => {
        const now = new Date()
        const remaining = []
        for (const reminder of cronJobs.filter(j => j.type === 'reminder')) {
            const userTz = userTimezones[reminder.jid] || 'Asia/Jakarta'
            const userNow = new Date(now.toLocaleString('en-US', { timeZone: userTz }))
            if (userNow >= new Date(reminder.sendAt)) {
                try { await sock.sendMessage(reminder.jid, { text: `⏰ Reminder: ${reminder.message}` }) } catch(e) {}
            } else {
                remaining.push(reminder)
            }
        }
        const remainingUnmutes = []
        for (const job of cronJobs.filter(j => j.type === 'unmute')) {
            if (now.getTime() >= new Date(job.unmuteAt).getTime()) {
                try {
                    await sock.groupSettingUpdate(job.jid, 'not_announcement')
                    await sock.sendMessage(job.jid, { text: '🔊 Mute time expired. Group automatically unlocked, all members can send messages again.' })
                } catch(e) {}
            } else {
                remainingUnmutes.push(job)
            }
        }
        const staticCrons = cronJobs.filter(j => j.type !== 'reminder' && j.type !== 'unmute')
        cronJobs = [...staticCrons, ...remaining, ...remainingUnmutes]
        await saveCronJobs()
    })
}

async function fetchUrlContent(url) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': getRandomUA(), 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' },
            signal: AbortSignal.timeout(8000)
        })
        const html = await res.text()
        return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000)
    } catch(e) { return null }
}

async function searchDuckDuckGo(query) {
    try {
        const encoded = encodeURIComponent(query)
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
            headers: { 'User-Agent': getRandomUA(), 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8', 'Referer': 'https://duckduckgo.com/', 'Connection': 'keep-alive', 'Cache-Control': 'no-cache' },
            signal: AbortSignal.timeout(10000)
        })
        const html = await res.text()
        const results = []
        const titleMatches = [...html.matchAll(/<a class="result__a"[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/g)]
        const snippetMatches = [...html.matchAll(/<a class="result__snippet"[^>]*>([^<]+)<\/a>/g)]
        for (let i = 0; i < Math.min(titleMatches.length, 5); i++) {
            const title = titleMatches[i]?.[1]?.trim() || ''
            const snippet = snippetMatches[i]?.[1]?.trim() || ''
            if (title) results.push(`${i + 1}. ${title}\n${snippet}`)
        }
        return results.length > 0 ? results.join('\n\n') : null
    } catch(e) { return null }
}

async function searchGoogle(query) {
    try {
        const encoded = encodeURIComponent(query)
        const res = await fetch(`https://api.harzrestapi.web.id/api/v2/search/google?q=${encoded}&apikey=FREE`, {
            headers: { 'User-Agent': getRandomUA(), 'Accept': 'application/json', 'Referer': 'https://api.harzrestapi.web.id/', 'Connection': 'keep-alive' },
            signal: AbortSignal.timeout(8000)
        })
        const data = await res.json()
        if (data.success && data.result && data.result.length > 0) {
            return data.result.map(r => `${r.id}. ${r.title}\n${r.snippet}\n${r.url}`).join('\n\n')
        }
        return await searchDuckDuckGo(query)
    } catch(e) { return await searchDuckDuckGo(query) }
}



const { pollStore, executePoll, handlePollVote } = require('./modules/poll')

let lastStatusKey = null

async function postStatus(sock, type, content, backgroundColor = '#075E54') {
    const contacts = []
    let sentStatus = null
    if (type === 'text') sentStatus = await sock.sendMessage('status@broadcast', { text: content, backgroundColor, font: 2 }, { statusJidList: contacts, broadcast: true })
    else if (type === 'image') sentStatus = await sock.sendMessage('status@broadcast', { image: { url: content }, caption: '' }, { statusJidList: contacts, broadcast: true })
    else if (type === 'video') sentStatus = await sock.sendMessage('status@broadcast', { video: { url: content }, caption: '' }, { statusJidList: contacts, broadcast: true })
    if (sentStatus?.key) lastStatusKey = sentStatus.key
}

function parseLocalPoll(text) {
    const split = text.split('?')
    if (split.length >= 2) {
        const question = split[0].trim() + '?'
        const options = split[1].split(',').map(o => o.trim()).filter(o => o.length > 0)
        if (options.length >= 2) return { question, options }
    }
    const parts = text.split(',')
    if (parts.length >= 3) {
        const question = parts[0].trim()
        const options = parts.slice(1).map(o => o.trim()).filter(o => o.length > 0)
        if (options.length >= 2) return { question, options }
    }
    return null
}

function parseLocalIntent(text, msg) {
    const t = text.toLowerCase().trim()
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    if ((t.includes('sticker') || t.includes('stiker')) && !!quoted?.imageMessage) return { intent: 'make_sticker' }
    if ((t.includes('sticker') || t.includes('stiker')) && !!quoted?.videoMessage) return { intent: 'make_video_sticker' }
    const tsMatch = t.match(/^(create|make)\s+sticker\s+(.+)/i)
    if (tsMatch) return { intent: 'make_text_sticker', text: tsMatch[2] }
    if (t === 'menu' || t === 'help') return { intent: 'show_menu' }
    if (t.includes('poll') || t.includes('voting') || t.includes('vote')) {
        const parsed = parseLocalPoll(text)
        if (parsed) return { intent: 'send_poll', ...parsed }
    }
    if (/https?:\/\/[^\s]+/.test(text)) return { intent: 'url_content', url: extractUrls(text)[0] }
    return null
}

async function handleLocalFallback(sock, from, msg, text, msgType) {
    const quoteOpt = shouldQuote(msg) ? { quoted: msg } : {}
    if (text) {
        const local = parseLocalIntent(text, msg)
        if (local) {
            if (local.intent === 'make_sticker' || local.intent === 'make_video_sticker') {
                const done = await handleStickerFromQuoted(sock, from, msg, runQueuedTool, stickerQueue, imageToSticker, videoToSticker)
                if (!done) await sock.sendMessage(from, { text: 'Reply to an image or video to create a sticker!' })
                return
            }
            if (local.intent === 'make_text_sticker') {
                await sock.sendMessage(from, { text: '⏳ Creating text sticker...' })
                const stickerBuffer = await runQueuedTool(sock, from, msg.key, stickerQueue, 'sticker',
                    ({ registerKill }) => textToSticker(local.text, (proc) => registerKill(() => proc.kill('SIGTERM'))))
                if (stickerBuffer) await sock.sendMessage(from, { sticker: stickerBuffer })
                return
            }
            if (local.intent === 'show_menu') {
                await sock.sendMessage(from, { text: buildMenuText() })
                if (isOwner(msg.key)) await sock.sendMessage(from, { text: buildOwnerMenuText() })
                return
            }
            if (local.intent === 'send_poll') {
                await executePoll(sock, from, local.question, local.options)
                return
            }
            if (local.intent === 'url_content') {
                const safety = await checkUrlSafety(local.url)
                if (!safety.safe) {
                    console.warn('[url_content] URL ditolak (SSRF guard):', safety.reason)
                    await sock.sendMessage(from, { text: URL_REJECT_MESSAGE })
                    return
                }
                await sock.sendMessage(from, { text: '⏳ Fetching URL content...' })
                const content = await fetchUrlContent(local.url)
                if (content) {
                    const snippet = content.slice(0, 1000)
                    await sock.sendMessage(from, { text: `📄 URL content:\n\n${snippet}${content.length > 1000 ? '\n\n_(truncated, AI is currently unavailable to summarise)_' : ''}` }, quoteOpt)
                } else {
                    await sock.sendMessage(from, { text: '❌ Could not fetch content from that URL.' })
                }
                return
            }
        }
    }
    if (msgType === 'imageMessage') { await sock.sendMessage(from, { text: '⚠️ AI is currently unavailable. Send with the caption "sticker" to create a sticker.' }, quoteOpt); return }
    if (msgType === 'audioMessage') { await sock.sendMessage(from, { text: '⚠️ AI is currently unavailable. Cannot transcribe voice notes right now.' }); return }
    await sock.sendMessage(from, {
        text: '⚠️ AI is currently unavailable. Features still available:\n.sticker — create sticker\n.ts [text] — text sticker\n.poll Question? A, B, C — create poll\n.weather [city] — check weather\n.earthquakeid [city] — Indonesia earthquake info\n.earthquake [region] — worldwide earthquake info\n.menu — view menu'
    }, quoteOpt)
}

async function handleFunctionResult(sock, from, msg, result, userText = '') {
    const quoteOpt = shouldQuote(msg) ? { quoted: msg } : {}

    if (result.name === 'download_media') {
        if (!isOwner(msg.key) && userActiveTask[from]) {
            await sock.sendMessage(from, { text: `⚠️ You still have an active *${getActiveToolLabel(from)}* process.\nType *.cp* to cancel it first.` })
            return
        }
        if (!isOwner(msg.key)) claimActiveTask(from, 'download', () => { cleanupDownload(from) })
        try { await handleDownload(sock, from, result.args.url, result.args.type || 'video') }
        finally { if (!isOwner(msg.key)) releaseActiveTask(from) }
        return
    }
    if (result.name === 'generate_image') {
        await sock.sendMessage(from, { text: '🎨 Generating image...' })
        const imgBuffer = await runQueuedTool(sock, from, msg.key, mediaGenQueue, 'mediaGen',
            ({ signal }) => generateImage(result.args.prompt, signal))
        if (!imgBuffer) { await sock.sendMessage(from, { text: '❌ Failed to generate image. Image provider not configured or currently unavailable.' }, quoteOpt); return }
        await sock.sendMessage(from, { image: imgBuffer, caption: `🖼️ ${result.args.prompt}` })
        return
    }
    if (result.name === 'generate_video') {
        await sock.sendMessage(from, { text: '🎬 Generating video...' })
        const vidBuffer = await runQueuedTool(sock, from, msg.key, mediaGenQueue, 'mediaGen',
            ({ signal }) => generateVideo(result.args.prompt, signal))
        if (!vidBuffer) { await sock.sendMessage(from, { text: '❌ Failed to generate video. Video provider not configured or currently unavailable.' }, quoteOpt); return }
        await sock.sendMessage(from, { video: vidBuffer, caption: `🎬 ${result.args.prompt}` })
        return
    }
    if (result.name === 'create_qr_code') {
        const detected = detectAndBuildPayload(result.args.data || '')
        console.log(`[bot:create_qr_code] input="${result.args.data}" → type="${detected.type}" payload="${detected.payload}"`)
        await sock.sendMessage(from, { text: `⏳ Generating QR code (${detected.type})...` })
        const qrBuffer = await runQueuedTool(sock, from, msg.key, mediaGenQueue, 'mediaGen',
            ({ signal }) => generateQR(detected.payload, signal))
        if (!qrBuffer) { await sock.sendMessage(from, { text: '❌ Failed to generate QR code. Please try again.' }, quoteOpt); return }
        await sock.sendMessage(from, { image: qrBuffer, caption: `✅ QR code generated (${detected.type})` })
        return
    }
    if (result.name === 'scan_qr_code') {
        const quotedImg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
        let qrSourceBuffer = null
        try {
            if (msg.message?.imageMessage) {
                qrSourceBuffer = await downloadMediaMessage(msg, 'buffer', {})
            } else if (quotedImg) {
                const fakeMsg = { message: { imageMessage: quotedImg }, key: { remoteJid: from } }
                qrSourceBuffer = await downloadMediaMessage(fakeMsg, 'buffer', {})
            }
        } catch (e) {
            console.error('[bot:scan_qr_code] failed to download image:', e?.message)
        }
        if (!qrSourceBuffer) {
            await sock.sendMessage(from, { text: '❌ No image found to scan. Send or reply to a QR code image first.' }, quoteOpt)
            return
        }
        await sock.sendMessage(from, { text: '⏳ Scanning QR code...' })
        const decoded = await runQueuedTool(sock, from, msg.key, mediaGenQueue, 'mediaGen',
            () => decodeQRFromBuffer(qrSourceBuffer))
        if (decoded === undefined) return
        if (decoded === null) {
            await sock.sendMessage(from, { text: '❌ No QR code found in that image. Try a clearer or larger image.' }, quoteOpt)
        } else {
            await sock.sendMessage(from, { text: `✅ *QR Code Content:*\n\n${decoded}` }, quoteOpt)
        }
        return
    }
    if (result.name === 'make_sticker') {
        const done = await handleStickerFromQuoted(sock, from, msg, runQueuedTool, stickerQueue, imageToSticker, videoToSticker)
        if (!done) await sock.sendMessage(from, { text: 'Reply to an image or video to turn it into a sticker!' })
    } else if (result.name === 'make_text_sticker') {
        await sock.sendMessage(from, { text: '⏳ Creating text sticker...' })
        const stickerBuffer = await runQueuedTool(sock, from, msg.key, stickerQueue, 'sticker',
            ({ registerKill }) => textToSticker(result.args.text, (proc) => registerKill(() => proc.kill('SIGTERM'))))
        if (stickerBuffer) await sock.sendMessage(from, { sticker: stickerBuffer })
    } else if (result.name === 'send_poll') {
        await executePoll(sock, from, result.args.question, result.args.options)
    } else if (result.name === 'post_status') {
        if (!isOwner(msg.key)) { await sock.sendMessage(from, { text: '🚫 The status posting feature can only be used by the owner.' }, quoteOpt); return }
        await sock.sendMessage(from, { text: '⏳ Posting status...' })
        await postStatus(sock, result.args.type, result.args.content, result.args.backgroundColor)
        await sock.sendMessage(from, { text: '✅ Status posted successfully!' })
    } else if (result.name === 'forward_message') {
        await sock.sendMessage(from, { text: result.args.text })
    } else if (result.name === 'show_menu') {
        await sock.sendMessage(from, { text: buildMenuText() })
        if (isOwner(msg.key)) await sock.sendMessage(from, { text: buildOwnerMenuText() })
    } else if (result.name === 'react_message') {
        try {
            await sock.sendMessage(from, { react: { text: result.args.emoji, key: msg.key } })
        } catch(_) {}

        if (result.args.reply) {
            const sentMsg = await sock.sendMessage(from, { text: result.args.reply }, quoteOpt)
            setLastBotMsg(from, sentMsg.key)
        }
    } else if (result.name === 'send_gif') {
        try {
            await sock.sendMessage(from, { video: { url: result.args.url }, gifPlayback: true, caption: result.args.caption || '' })
        } catch(e) { await sock.sendMessage(from, { text: result.args.caption || '🎬' }) }
    } else if (result.name === 'edit_message') {
        if (getLastBotMsg(from)) {
            await sock.sendMessage(from, { text: result.args.new_text, edit: getLastBotMsg(from) })
            addHistory(from, 'model', result.args.new_text)
        }
    } else if (result.name === 'delete_message') {
        if (getLastBotMsg(from)) {
            await sock.sendMessage(from, { delete: getLastBotMsg(from) })
            setLastBotMsg(from, null)
        }
    } else if (result.name === 'search_web') {
        await sock.sendMessage(from, { text: '🔍 Mencari...' })
        const searchResult = await searchGoogle(result.args.query)
        if (searchResult) {
            const summary = await callAI(from, `Search results for "${result.args.query}":\n\n${searchResult}\n\nSummarise and answer the user's question based on these results naturally in the same language as the user.`, null, null, '', BOT_NAME)
            if (summary && summary.type === 'text') {
                const sentMsg = await sock.sendMessage(from, { text: summary.text }, quoteOpt)
                setLastBotMsg(from, sentMsg.key)
            } else {
                await sock.sendMessage(from, { text: `🔍 Hasil pencarian:\n\n${searchResult.slice(0, 1500)}` }, quoteOpt)
            }
        } else {
            await sock.sendMessage(from, { text: '❌ Search failed.' })
        }
    } else if (result.name === 'get_weather') {
        await sock.sendMessage(from, { text: '🌤️ Fetching weather data...' })
        const cityInput = result.args.city || ''
        const resolved = INDONESIA_ALIAS[cityInput.toLowerCase()] || cityInput
        const weatherMsg = await runUnqueuedTool(async ({ signal }) => {
            const geo = await geocodeCity(resolved, signal)
            if (!geo) return { error: `❌ Sorry, I couldn't find location data for *${cityInput}*.` }
            const weatherData = await fetchWeather(geo.lat, geo.lon, signal)
            if (!weatherData) return { error: `❌ Weather data for *${cityInput}* is currently unavailable.` }
            return { text: formatWeatherMessage(geo, weatherData) }
        })
        if (!weatherMsg) return
        if (weatherMsg.error) { const sentMsg = await sock.sendMessage(from, { text: weatherMsg.error }, quoteOpt); setLastBotMsg(from, sentMsg.key); return }
        const sentMsg = await sock.sendMessage(from, { text: weatherMsg.text }, quoteOpt)
        setLastBotMsg(from, sentMsg.key)
        if (userText) { addHistory(from, 'user', maskSensitiveData(userText)); addHistory(from, 'model', weatherMsg.text) }
    } else if (result.name === 'delete_status') {
        await sock.sendMessage(from, { text: `🚫 Sorry, I'm just an AI — I can't delete a WhatsApp status that has already been posted.` }, quoteOpt)
    } else if (result.name === 'clear_history') {
        clearHistory(from)
        setLastBotMsg(from, null)
        await sock.sendMessage(from, { text: '🗑️ Our conversation history has been cleared. Starting fresh!' })
    } else if (result.name === 'get_earthquake') {
        await sock.sendMessage(from, { text: '🌋 Fetching earthquake data...' })
        const hasil = await runUnqueuedTool(
            ({ signal }) => fetchGempaID(result.args.region || null, signal))
        if (!hasil) return
        const sentMsg = await sock.sendMessage(from, { text: hasil }, quoteOpt)
        setLastBotMsg(from, sentMsg.key)
        if (userText) { addHistory(from, 'user', maskSensitiveData(userText)); addHistory(from, 'model', hasil) }
    } else if (result.name === 'get_earthquake_global') {
        await sock.sendMessage(from, { text: '🌍 Fetching earthquake data...' })
        const hasil = await runUnqueuedTool(
            ({ signal }) => fetchEarthquakeUSGS(result.args.region || null, signal))
        if (!hasil) return
        const sentMsg = await sock.sendMessage(from, { text: hasil }, quoteOpt)
        setLastBotMsg(from, sentMsg.key)
        if (userText) { addHistory(from, 'user', maskSensitiveData(userText)); addHistory(from, 'model', hasil) }
    } else {

        await sock.sendMessage(from, { text: `🚫 Sorry, I can't do that — this feature is not yet available.` }, quoteOpt)
    }
}

function buildMenuText() {
    return `╔═══════════════════╗
  🤖 *${BOT_NAME}*
╚═══════════════════╝

🤖 *AI & CHAT*
_Just type a message — no command needed (mention the bot in groups)_
• .reset - Reset AI chat history
• .imagine [description] - Generate AI image
• .createimage [description] - Generate AI image
• .createvideo [description] - Generate AI video

🎨 *MEDIA & STICKERS*
• .sticker / .s - Create sticker from image/video
• .textsticker / .ts [text] - Sticker from text
• .setgroupphoto - Set group photo (reply image)
• .cqr [text/url/wifi/geo] - Generate QR code
• .sqr - Scan QR code (reply/send image or .sqr [url])

📥 *DOWNLOADER*
• .download / .dl [url] - Download video
• .mp3 [url] - Download audio/music
• .ytmp3 [url] - YouTube audio
• .ytmp4 [url] - YouTube video
• .tiktok [url] - TikTok video
• .spotify [url] - Spotify audio
• .canceldownload / .cdl - Cancel active download
• .cancelprocess / .cp - Cancel active process

🌍 *INFO & WEATHER*
• .weather [city] - Weather info
• .earthquakeid [city] - Latest Indonesia earthquake
• .earthquake [city/region] - Latest worldwide earthquake

⏰ *SCHEDULER*
• .reminder [HH:MM] [TZ] [message] - Set reminder
• .cron [schedule] [message] - Set cron job
• .dreminder [number/all] - Delete reminder
• .dcron [number/all] - Delete cron job
• .settimezone [timezone] - Set timezone

🎮 *FUN & GAMES*
• .poll [question]|[option] - Create poll
• .quiz [category] - Play quiz
• .riddle - Random riddle
• .answer - Riddle answer

📚 *LITERATURE*
• .poem - Random poem
• .story - Random short story
• .rhyme - Random rhyme

✨ *INSPIRATION*
• .motivation - Random motivation
• .funfact - Random fun fact
• .reflection - Random reflection
• .philosophical - Philosophical thought

👥 *GROUP* _(admin only)_
• .kick / .remove @user - Remove member
• .add [number] - Add member
• .promote @user - Promote to admin
• .demote @user - Demote from admin
• .mute [hours] / .unmute - Lock/unlock group chat
• .lock / .unlock - Lock/unlock group settings
• .tageveryone / .tagall [message] - Tag all members
• .antilink on/off - Anti-link toggle
• .welcome on/off - Welcome message toggle
• .setwelcomemsg [text] - Set welcome text
• .leave on/off - Leave message toggle
• .setleavemsg [text] - Set leave text
• .resetgreeting - Reset welcome & leave text
• .filter on/off - Word filter toggle
• .filteradd [word] - Add filter word
• .filterdel [word] - Remove filter word
• .filterlist - View filter words
• .filterclear - Clear all filter words
• .warnreset @user - Reset filter warning
• .groupinfo - Group info
• .gstats - Group statistics
• .groupname [name] - Change group name
• .groupdesc [text] - Change group description
• .memberaddmode admin/all - Who can add members
• .ephemeral - Toggle disappearing messages
• .grouplink - Get group invite link
• .groupresetlink - Reset group invite link
• .joinrequests - View join requests
• .approve / .reject @user - Approve/reject join
• .approvalmode on/off - Join approval toggle
• .newcommunity [name] - Create community
• .linkgroup [communityJid] - Link group to community
• .unlinkgroup - Unlink group from community

ℹ️ *GENERAL*
• .myinfo / .whoami - Your JID & info
• .report [message] - Report a user to owner

_Type any command above to use it._`
}

function buildOwnerMenuText() {
    return `👑 *OWNER COMMANDS*
━━━━━━━━━━━━━━━
• .bc [message] - Broadcast to all users
• .gbc [message] - Broadcast to all groups
• .send n- [number] t- [message] - Send to number
• .stats - Bot statistics
• .ban / .unban [number] - Ban/unban user
• .block / .unblock [number] - Block/unblock
• .bio [number] - View WhatsApp bio
• .pp [number] - View profile photo
• .setbio [text] - Set bot bio
• .setbotname [name] - Set bot display name
• .businessinfo [number] - Business info
• .groups - List all groups
• .creategroup [name]|[number] - Create group
• .joingroup [link] - Join group via link
• .leavegroup - Leave this group
• .leaveallgroups - Leave all groups
• .leaveidle [n] - Leave groups < n members
• .addme [groupJid] - Add owner to group
• .status [text] - Post WhatsApp status
• .deletestatus - Delete last status
• .maintain on/off - Maintenance mode`
}


const BOT_START_TIME = Math.floor(Date.now() / 1000)

// Checks whether Baileys can actually generate image thumbnails on this system.
// Baileys needs sharp or jimp to build thumbnails for every image it sends (including
// QR codes from .cqr). Two independent things can break this silently:
//   1. sharp fails to load (common on Android/Termux — no prebuilt libvips binary for arm64)
//   2. Older Baileys builds (rc13 and earlier) have a bug checking for jimp: they test
//      `typeof Jimp === 'object'`, but Jimp has always been exported as a class, so
//      `typeof` returns 'function' — the check never passes and Baileys falls through to
//      "No image processing library available", even with jimp correctly installed.
// This doesn't crash the bot or block sending — the message still goes through — but the
// image arrives without a thumbnail, and on some clients (including WhatsApp's own QR
// scanner) that malformed delivery is enough to make the image unreadable.
function checkImageThumbnailSupport() {
    let sharpOk = false
    try { require('sharp'); sharpOk = true } catch (_) {}

    let jimpOk = false
    try {
        const { Jimp } = require('jimp')
        jimpOk = typeof Jimp === 'function'
    } catch (_) {}

    if (sharpOk || jimpOk) return

    console.warn('\n⚠️  WARNING: No working image processing library found for Baileys.')
    console.warn('   Images sent by the bot (including .cqr QR codes) may fail to scan')
    console.warn('   or display correctly, since Baileys cannot build a thumbnail for them.')
    console.warn('   Fix: npm install jimp')
    console.warn('   If it still fails after installing jimp, your Baileys version likely has')
    console.warn("   a known bug checking for it (rc13 and earlier). Patch it with:")
    console.warn(`   sed -n '116p' node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js`)
    console.warn("   → if that line does not read exactly:")
    console.warn(`     else if ('jimp' in lib && typeof lib.jimp?.Jimp === 'function') {`)
    console.warn('   then run:')
    console.warn(`   sed -i "116s/.*/    else if ('jimp' in lib \\&\\& typeof lib.jimp?.Jimp === 'function') {/" node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js\n`)
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth')
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        markOnlineOnConnect: false,

        cachedGroupMetadata: async (jid) => getCachedGroupMetadata(jid)
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode
            console.log(`[connection] CLOSED. statusCode=${code} reason=${lastDisconnect?.error?.message}`)
            if (code !== DisconnectReason.loggedOut) setTimeout(() => startBot(), 3000)
        }
        if (connection === 'open') {
            console.log(`✅ Bot ready! Mode: ${hasValidKeys() ? '🤖 AI + Local' : '🔧 Local only'}`)
            checkImageThumbnailSupport()
            startCronJobs(sock)

            sock.groupFetchAllParticipating()
                .then(groups => {
                    const ids = Object.keys(groups || {})
                    ids.forEach(id => setCachedGroupMetadata(id, groups[id]))
                    console.log(`[group-cache] prefetched metadata for ${ids.length} groups on connection open`)
                })
                .catch(e => console.log('[group-cache] prefetch failed:', e?.message))
        }
    })

    sock.ev.on('groups.update', async (updates) => {
        for (const update of updates) {
            if (!update?.id) continue
            await refreshGroupMetadataCache(sock, update.id, 'groups.update')
        }
    })

    sock.ev.on('call', async (calls) => {
        for (const call of calls) {
            if (call.status !== 'offer') continue
            try {
                await sock.rejectCall(call.id, call.from)
                console.log(`[call] Incoming call from ${call.from} auto-rejected.`)
            } catch (e) {
                console.log(`[call] Failed to reject call from ${call.from}:`, e?.message)
            }
        }
    })

    sock.ev.on('group-participants.update', async ({ id: groupJid, participants, action }) => {
        const tEventReceived = Date.now()
        dlog(`[group-update] EVENT RECEIVED at ${new Date(tEventReceived).toISOString()} action: ${action} groupJid: ${groupJid}`)
        dlog('[group-update] participants raw:', JSON.stringify(participants))
        try {
            const jidListRaw = participants.map(p => typeof p === 'string' ? p : (p.phoneNumber || p.id || p.jid || '')).filter(Boolean)
            const botJidNum = sock.user?.id?.split(':')[0]
            const botWasRemoved = action === 'remove' && jidListRaw.some(j => j.includes(botJidNum))
            if (botWasRemoved) {
                dlog(`[group-update] Bot itself was removed/left group ${groupJid}. Removing from cache.`)
                groupMetadataCache.delete(groupJid)
                return
            }
            const settings = getGroupSettings(groupJid)
            dlog('[group-update] settings:', JSON.stringify(settings))
            if (action === 'add' && !settings.welcomeEnabled) { dlog('[group-update] welcomeEnabled false, skip'); return }
            if (action === 'remove' && !settings.leaveEnabled) { dlog('[group-update] leaveEnabled false, skip'); return }
            if (action !== 'add' && action !== 'remove') { dlog('[group-update] action ignored:', action); return }
            const jidList = jidListRaw
            dlog('[group-update] jidList:', JSON.stringify(jidList))

            let groupName = groupJid
            const tMetaStart = Date.now()
            const cached = getCachedGroupMetadata(groupJid)
            if (cached) {
                groupName = cached.subject
                // Refresh name/cache in background — not used for totalMembers
                // because totalMembers is always fetched fresh from the server below.
                refreshGroupMetadataCache(sock, groupJid, 'background-after-cache-hit').catch(() => {})
            } else {
                dlog('[group-update] cache MISS, fetching group name with 3000ms timeout')
                try {
                    const metadata = await Promise.race([sock.groupMetadata(groupJid), new Promise(r => setTimeout(() => r(null), 3000))])
                    dlog(`[group-update] groupMetadata fetch took ${Date.now() - tMetaStart}ms, got data: ${!!metadata}`)
                    if (metadata) {
                        groupName = metadata.subject
                        setCachedGroupMetadata(groupJid, metadata)
                    } else {
                        dlog('[group-update] groupMetadata TIMED OUT after 3000ms, proceeding to send message without accurate name')
                    }
                } catch(e) { dlog(`[group-update] metadata error after ${Date.now() - tMetaStart}ms:`, e?.message, e?.stack) }
            }
            dlog('[group-update] groupName:', groupName)

            const timestamp = new Date()
            for (const userJid of jidList) {
                const tSendStart = Date.now()
                dlog('[group-update] sending greeting to:', userJid, 'at', new Date(tSendStart).toISOString())
                const template = action === 'add' ? settings.welcomeText : settings.leaveText

                // totalMembers is always fresh from the WhatsApp server for accuracy,
                // even when many people join/leave simultaneously in one event.
                let totalMembers = null
                try {
                    const freshMetadata = await Promise.race([sock.groupMetadata(groupJid), new Promise(r => setTimeout(() => r(null), 3000))])
                    totalMembers = freshMetadata?.participants?.length ?? null
                } catch (e) {
                    dlog(`[group-update] fetch totalMembers failed for ${userJid}:`, e?.message)
                }

                sendGroupGreeting(sock, groupJid, userJid, template, groupName, { totalMembers, timestamp })
                    .then(() => dlog(`[group-update] greeting SENT to ${userJid} in ${Date.now() - tSendStart}ms (total since event: ${Date.now() - tEventReceived}ms)`))
                    .catch(e => dlog(`[group-update] greeting FAILED to ${userJid} after ${Date.now() - tSendStart}ms:`, e?.message, e?.stack))
            }
        } catch (e) { console.log('⚠️ Failed to send welcome/leave message:', e?.message, e?.stack) }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg || msg.key.fromMe) return

        if (msg.message?.protocolMessage) return

        const msgTimestamp = msg.messageTimestamp || 0
        if (msgTimestamp < BOT_START_TIME) return

        const isGroup = msg.key.remoteJid?.endsWith('@g.us')
        const senderJid = msg.key.participant || msg.key.remoteJid

        if (isBanned(msg.key)) return

        // Maintenance mode: reply to non-owners with maintenance message, then stop
        if (isMaintenanceMode() && !isOwner(msg.key)) {
            await sock.sendMessage(from, {
                text: '🔧 *Maintenance is on.*\nThe bot is currently under maintenance. Please try again in a moment!'
            })
            return
        }

        incrementRequestCount()

        if (!isGroup) recordKnownUser(msg.key).catch(() => {})
        recordFirstSeen(msg.key).catch(() => {})

        const msgType = getMsgType(msg)

        if (msgType === 'pollUpdateMessage') {
            await handlePollVote(sock, msg)
            return
        }

        const from = msg.key.remoteJid
        const _interactiveText = msg.message?.interactiveResponseMessage?.body?.text || ''
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || _interactiveText || msg.message?.buttonsResponseMessage?.selectedButtonId || ''

        if (msgType === 'locationMessage') {
            await sock.readMessages([msg.key])
            await sock.sendPresenceUpdate('composing', from)
            await runUnqueuedTool(
                ({ signal }) => handleLocationWeather(sock, from, msg, signal))
            await sock.sendPresenceUpdate('paused', from)
            return
        }

        if (msgType === 'templateButtonReplyMessage') {
            const selectedId = msg.message?.templateButtonReplyMessage?.selectedId || ''
            const stanzaId = msg.message?.templateButtonReplyMessage?.contextInfo?.stanzaId || ''
            const questionText = msg.message?.templateButtonReplyMessage?.contextInfo?.quotedMessage?.interactiveMessage?.body?.text || ''
            if (selectedId.startsWith('quiz_')) {
                // Anti-spam: each question can only be answered once (per question stanzaId, not per user)
                const quizKey = stanzaId + ':' + senderJid
                if (answeredQuiz.has(quizKey)) {
                    await sock.sendPresenceUpdate('paused', from)
                    return
                }
                answeredQuiz.add(quizKey)
                const pilihanUser = selectedId.replace('quiz_', '')
                const { QUIZ_LIST } = require('./modules/quiz')
                const quiz = QUIZ_LIST.find(q => q.question === questionText)
                if (quiz) {
                    const correct = checkJawaban(pilihanUser, quiz.answer)
                    // Mention user if in group
                    const mentionText = isGroup ? `@${normalizeJid(senderJid)} ` : ''
                    const mentionOpt = isGroup ? { mentions: [senderJid] } : {}
                    if (correct) {
                        await sock.sendMessage(from, { text: `${mentionText}✅ Correct! The answer is *${quiz.answer}*.

📖 ${quiz.explanation}`, ...mentionOpt })
                    } else {
                        await sock.sendMessage(from, { text: `${mentionText}❌ Wrong! The correct answer is *${quiz.answer}*.

📖 ${quiz.explanation}`, ...mentionOpt })
                    }
                }
                await sock.sendPresenceUpdate('paused', from)
                return
            }
        }

        if (msgType === 'interactiveResponseMessage') {
            const interactiveId = (() => { try { return JSON.parse(msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || '{}')?.id || '' } catch { return '' } })()
            if (interactiveId.startsWith('quiz_')) {
                const pilihanUser = interactiveId.replace('quiz_', '')
                const questionText = msg.message?.interactiveResponseMessage?.contextInfo?.quotedMessage?.interactiveMessage?.body?.text || ''
                const { QUIZ_LIST } = require('./modules/quiz')
                const quiz = QUIZ_LIST.find(q => q.question === questionText)
                if (quiz) {
                    const correct = checkJawaban(pilihanUser, quiz.answer)
                    if (correct) {
                        await sock.sendMessage(from, { text: `✅ Correct! The answer is *${quiz.answer}*.

📖 ${quiz.explanation}` })
                    } else {
                        await sock.sendMessage(from, { text: `❌ Wrong! The correct answer is *${quiz.answer}*.

📖 ${quiz.explanation}` })
                    }
                }
                await sock.sendPresenceUpdate('paused', from)
                return
            }
            // Not a quiz — continue to normal command flow via _interactiveText
        }

        if (msgType === 'listResponseMessage') {
            const selectedRowId = msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId || ''
            const MENU_LIST_ACTIONS = {
                menu_shortstory: () => getShortStoryRandom(),
                menu_rhyme: () => getRhymeRandom(),
                menu_poem: () => getPoemRandom(),
                menu_motivation: () => getMotivationRandom(),
                menu_funfact: () => getFunFactRandom(),
                menu_reflection: () => getReflectionRandom(),
                menu_philosophical: () => getPhilosophicalRandom()
            }
            const action = MENU_LIST_ACTIONS[selectedRowId]
            if (action) {
                await sock.sendMessage(from, { text: action() })
            }
            return
        }

        if (isGroup) {
            const settings = getGroupSettings(from)
            const hasPrefixForAntilink = text.startsWith('.') || text.startsWith('#') || text.startsWith('!')
            const commandForAntilink = hasPrefixForAntilink ? text.slice(1).trim().split(' ')[0].toLowerCase() : ''
            const isDownloadCommand = ['dl', 'dytmp3', 'dytmp4', 'dtt', 'sp'].includes(commandForAntilink)

            if (settings.antilinkEnabled && text && !isDownloadCommand && /(https?:\/\/|chat\.whatsapp\.com)/i.test(text)) {
                const senderIsAdmin = await isGroupAdmin(sock, from, senderJid).catch(() => false)
                if (!senderIsAdmin) {
                    try { await sock.sendMessage(from, { delete: msg.key }) } catch (e) {}
                    await sock.sendMessage(from, { text: `⚠️ @${normalizeJid(senderJid)} links are not allowed in this group.ni.`, mentions: [senderJid] })
                    return
                }
            }

            if (settings.filterEnabled && text) {
                const matchedWord = textMatchesFilter(text, settings.filterWords)
                if (matchedWord) {
                    const senderIsAdmin = await isGroupAdmin(sock, from, senderJid).catch(() => false)
                    if (!senderIsAdmin) {
                        try { await sock.sendMessage(from, { delete: msg.key }) } catch (e) {}
                        if (settings.filterMode === 'kick') {
                            const warnCount = addFilterWarn(from, senderJid)
                            await saveGroupSettings().catch(() => {})
                            if (warnCount >= FILTER_KICK_THRESHOLD) {
                                resetFilterWarn(from, senderJid)
                                await saveGroupSettings().catch(() => {})
                                try {
                                    await sock.groupParticipantsUpdate(from, [senderJid], 'remove')
                                    await sock.sendMessage(from, { text: `@${normalizeJid(senderJid)} ⚠️ Warning: offensive language detected. Violation #${warnCount}/${FILTER_KICK_THRESHOLD}`, mentions: [senderJid] })
                                } catch (e) {
                                    await sock.sendMessage(from, { text: `⚠️ @${normalizeJid(senderJid)} has violated the filter ${FILTER_KICK_THRESHOLD} times but the bot failed to kick (make sure the bot is admin).`, mentions: [senderJid] })
                                }
                            } else {
                                await sock.sendMessage(from, { text: `@${normalizeJid(senderJid)} ⚠️ Warning: offensive language detected. Violation #${warnCount}/${FILTER_KICK_THRESHOLD}`, mentions: [senderJid] })
                            }
                        } else {
                            await sock.sendMessage(from, { text: `@${normalizeJid(senderJid)} ⚠️ Warning: offensive language detected. Violation #${warnCount}/${FILTER_KICK_THRESHOLD}`, mentions: [senderJid] })
                        }
                        return
                    }
                }
            }
            const hasPrefix = text.startsWith('.') || text.startsWith('#') || text.startsWith('!')
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
            const botIdNorm = normalizeJid(sock.user?.id)
            const botLidNorm = normalizeJid(sock.user?.lid)
            const isMentioned = mentionedJids.some(j => {
                const jNorm = normalizeJid(j)
                return jNorm === botIdNorm || (botLidNorm && jNorm === botLidNorm)
            })
            if (!hasPrefix && !isMentioned) return
        }

        await sock.readMessages([msg.key])
        await sock.sendPresenceUpdate('composing', from)
        const quoteOpt = shouldQuote(msg) ? { quoted: msg } : {}

        try {
            if (text) {
                const hasPrefix = text.startsWith('.') || text.startsWith('#') || text.startsWith('!')
                if (hasPrefix) {
                    const cleanText = text.slice(1).trim()
                    const command = cleanText.split(' ')[0].toLowerCase()
                    const args = cleanText.split(' ').slice(1).join(' ')

                    if (command === 'help' || command === 'menu') {
                        await sock.sendMessage(from, { text: buildMenuText() })
                        if (isOwner(msg.key)) await sock.sendMessage(from, { text: buildOwnerMenuText() })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'menulist') {
                        // Percobaan list message (single_select) via modules/interactive.js.
                        // Separate from .menu so .menu text still works safely if this fails.
                        // Note: only commands without additional arguments go here,
                        // because list taps cannot include trailing text (location, link, etc.).
                        try {
                            await sendListMessage(sock, from, {
                                text: 'Select a menu category below',
                                footer: BOT_NAME,
                                buttonText: 'View Menu',
                                sections: [
                                    {
                                        title: 'Sastra',
                                        rows: [
                                            { id: 'menu_shortstory', title: '.story' },
                                            { id: 'menu_rhyme', title: '.rhyme' },
                                            { id: 'menu_poem', title: '.poem' }
                                        ]
                                    },
                                    {
                                        title: 'Inspirasi',
                                        rows: [
                                            { id: 'menu_motivation', title: '.motivation' },
                                            { id: 'menu_funfact', title: '.funfact' },
                                            { id: 'menu_reflection', title: '.reflection' },
                                            { id: 'menu_philosophical', title: '.philosophical' }
                                        ]
                                    }
                                ]
                            })
                        } catch (e) {
                            console.error('[bot:menulist] failed to send list message:', e?.message, e?.stack)
                            await sock.sendMessage(from, { text: '⚠️ List message failed to send, see error log for details.\n\nFallback to .menu for text version.' })
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'testquick') {
                        // Percobaan quick_reply (tombol balasan cepat).
                        try {
                            await sendButtons(sock, from, {
                                text: 'Test quick_reply: select one of the buttons below.',
                                footer: BOT_NAME,
                                buttons: [
                                    { id: 'qr_yes', text: 'Ya' },
                                    { id: 'qr_no', text: 'No' }
                                ]
                            })
                        } catch (e) {
                            console.error('[bot:testquick] failed:', e?.message, e?.stack)
                            await sock.sendMessage(from, { text: '⚠️ quick_reply failed to send, see error log.' })
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'testurl') {
                        // Percobaan cta_url (tombol buka link).
                        try {
                            await sendInteractiveMessage(sock, from, {
                                text: 'Test cta_url: press button to open link.',
                                footer: BOT_NAME,
                                interactiveButtons: [
                                    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Buka Google', url: 'https://www.google.com' }) }
                                ]
                            })
                        } catch (e) {
                            console.error('[bot:testurl] failed:', e?.message, e?.stack)
                            await sock.sendMessage(from, { text: '⚠️ cta_url failed to send, see error log.' })
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'testcopy') {
                        // Percobaan cta_copy (tombol salin teks/kode).
                        try {
                            await sendInteractiveMessage(sock, from, {
                                text: 'Test cta_copy: press button to copy code.',
                                footer: BOT_NAME,
                                interactiveButtons: [
                                    { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Salin Kode', copy_code: 'TEST123' }) }
                                ]
                            })
                        } catch (e) {
                            console.error('[bot:testcopy] failed:', e?.message, e?.stack)
                            await sock.sendMessage(from, { text: '⚠️ cta_copy failed to send, see error log.' })
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'testcall') {
                        // Test cta_call (tap button to call).
                        try {
                            await sendInteractiveMessage(sock, from, {
                                text: 'Test cta_call: press button to call.',
                                footer: BOT_NAME,
                                interactiveButtons: [
                                    { name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text: 'Telepon', phone_number: '+6281234567890' }) }
                                ]
                            })
                        } catch (e) {
                            console.error('[bot:testcall] failed:', e?.message, e?.stack)
                            await sock.sendMessage(from, { text: '⚠️ cta_call failed to send, see error log.' })
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (PUBLIC_COMMANDS.includes(command)) {
                        await handlePublicCommand(sock, from, msg, command, args, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (OWNER_COMMANDS.includes(command)) {
                        const realNum = msg.key.senderPn || msg.key.participantPn || msg.key.participantAlt || msg.key.remoteJidAlt || '(none)'
                        console.log(`[owner-check] command=${command} senderJid=${senderJid} realNumberJid=${realNum} isOwner=${isOwner(msg.key)}`)
                        if (!isOwner(msg.key)) { await sock.sendPresenceUpdate('paused', from); return }
                        handleOwnerCommand._postStatus = (type, cnt, bg) => postStatus(sock, type, cnt, bg)
                        handleOwnerCommand._getLastStatusKey = () => lastStatusKey
                        await handleOwnerCommand(sock, from, msg, command, args, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'setppgroup' || command === 'setgroupphoto') {
                        const isGroupChat = from?.endsWith('@g.us')
                        if (!isGroupChat) { await sock.sendMessage(from, { text: '⚠️ This command can only be used inside a group.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                        const senderIsAdmin = await isGroupAdmin(sock, from, senderJid).catch(() => false)
                        if (!senderIsAdmin) { await sock.sendMessage(from, { text: '🚫 Group admins only.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                        const quotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
                        if (!quotedImage) { await sock.sendMessage(from, { text: '❌ Reply to an image with caption .setppgroup to change the group photo.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                        try {
                            const fakeMsg = { message: msg.message.extendedTextMessage.contextInfo.quotedMessage, key: { remoteJid: from } }
                            const imgBuffer = await downloadMediaMessage(fakeMsg, 'buffer', {})
                            await sock.updateProfilePicture(from, imgBuffer)
                            await sock.sendMessage(from, { text: '✅ Group photo successfully updated.' }, quoteOpt)
                        } catch (e) {
                            console.error('[bot:setppgroup] failed:', e)
                            await sock.sendMessage(from, { text: '❌ Failed to change group photo. Make sure the bot is admin and the image is valid.' }, quoteOpt)
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (GROUP_ADMIN_COMMANDS.includes(command)) {
                        await handleGroupAdminCommand(sock, from, msg, command, args, quoteOpt, { cronJobs, saveCronJobs })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'sticker' || command === 's') {
                        const done = await handleStickerFromQuoted(sock, from, msg, runQueuedTool, stickerQueue, imageToSticker, videoToSticker)
                        if (!done) await sock.sendMessage(from, { text: 'Reply to an image or video with .sticker!' })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'ts' || command === 'textsticker') {
                        const stickerText = args || 'Hello!'
                        await sock.sendMessage(from, { text: '⏳ Creating text sticker...' })
                        const stickerBuffer = await runQueuedTool(sock, from, msg.key, stickerQueue, 'sticker',
                            ({ registerKill }) => textToSticker(stickerText, (proc) => registerKill(() => proc.kill('SIGTERM'))))
                        if (stickerBuffer) await sock.sendMessage(from, { sticker: stickerBuffer })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'cqr' || command === 'createqr') {
                        const quotedContact = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.contactMessage
                        let input = args.trim()
                        let sourceLabel = ''

                        if (!input && quotedContact) {
                            input = buildVCard(quotedContact)
                            sourceLabel = 'Contact'
                        }

                        if (!input) {
                            await sock.sendMessage(from, { text: '❌ Format: .cqr [text/url/email/phone]\nWhatsApp contact: .cqr wa 6281234567890\nPhone (call): .cqr call:6281234567890\nWiFi: .cqr wifi:ssid=NAME;pass=PASSWORD;type=WPA\nLocation: .cqr -6.2,106.8\nOr reply to a shared contact with .cqr' }, quoteOpt)
                            await sock.sendPresenceUpdate('paused', from); return
                        }

                        const detected = sourceLabel ? { type: sourceLabel, payload: input } : detectAndBuildPayload(input)
                        console.log(`[bot:cqr] input="${input}" → type="${detected.type}" payload="${detected.payload}"`)
                        await sock.sendMessage(from, { text: `⏳ Generating QR code (${detected.type})...` })
                        const qrBuffer = await runQueuedTool(sock, from, msg.key, mediaGenQueue, 'mediaGen',
                            ({ signal }) => generateQR(detected.payload, signal))
                        if (qrBuffer) await sock.sendMessage(from, { image: qrBuffer, caption: `✅ QR code generated (${detected.type})` }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'sqr' || command === 'scanqr') {
                        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
                        const urlArg = args.trim()
                        let qrBuffer = null

                        try {
                            if (quoted?.imageMessage) {
                                const fakeMsg = { message: quoted, key: { remoteJid: from } }
                                qrBuffer = await downloadMediaMessage(fakeMsg, 'buffer', {})
                            } else if (urlArg.startsWith('http')) {
                                await sock.sendMessage(from, { text: '⏳ Fetching image...' })
                                const res = await fetch(urlArg, { signal: AbortSignal.timeout(15000) })
                                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                                qrBuffer = Buffer.from(await res.arrayBuffer())
                            }
                        } catch (e) {
                            console.error('[bot:sqr] failed to fetch image:', e?.message)
                            await sock.sendMessage(from, { text: '❌ Could not fetch that image. Make sure the URL is valid and publicly accessible.' }, quoteOpt)
                            await sock.sendPresenceUpdate('paused', from); return
                        }

                        if (!qrBuffer) {
                            await sock.sendMessage(from, { text: '❌ Reply to an image with a QR code, send an image with caption .sqr, or use .sqr [image url]' }, quoteOpt)
                            await sock.sendPresenceUpdate('paused', from); return
                        }

                        if (qrBuffer.length > MAX_FILE_SIZE) {
                            await sock.sendMessage(from, { text: '⚠️ Image is too large. Maximum 20MB.' }, quoteOpt)
                            await sock.sendPresenceUpdate('paused', from); return
                        }

                        await sock.sendMessage(from, { text: '⏳ Scanning QR code...' })
                        const decoded = await runQueuedTool(sock, from, msg.key, mediaGenQueue, 'mediaGen',
                            () => decodeQRFromBuffer(qrBuffer))

                        if (decoded === undefined) { await sock.sendPresenceUpdate('paused', from); return }
                        if (decoded === null) {
                            await sock.sendMessage(from, { text: '❌ No QR code found in that image. Try a clearer or larger image.' }, quoteOpt)
                        } else {
                            await sock.sendMessage(from, { text: `✅ *QR Code Content:*\n\n${decoded}` }, quoteOpt)
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'weather' || command === 'cuaca') {
                        await runUnqueuedTool(
                            ({ signal }) => handleWeatherCommand(sock, from, args, msg, shouldQuote, signal))
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    // .gempaid / .earthquakeid / .quakeid → BMKG Indonesia (fetchGempaID)
                    if (command === 'gempaid' || command === 'earthquakeid' || command === 'quakeid') {
                        await sock.sendMessage(from, { text: '🌋 Fetching earthquake data...' })
                        const hasil = await runUnqueuedTool(
                            ({ signal }) => fetchGempaID(args.trim() || null, signal))
                        if (hasil) await sock.sendMessage(from, { text: hasil }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    // .gempa / .earthquake → USGS worldwide (fetchEarthquakeUSGS, EN output)
                    if (command === 'gempa' || command === 'earthquake') {
                        await sock.sendMessage(from, { text: '🌍 Fetching earthquake data...' })
                        const hasil = await runUnqueuedTool(
                            ({ signal }) => fetchEarthquakeUSGS(args.trim() || null, signal))
                        if (hasil) await sock.sendMessage(from, { text: hasil }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'cerpen' || command === 'story') {
                        await sock.sendMessage(from, { text: getShortStoryRandom() }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'pantun' || command === 'rhyme') {
                        await sock.sendMessage(from, { text: getRhymeRandom() }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'puisi' || command === 'poem') {
                        await sock.sendMessage(from, { text: getPoemRandom() }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'motivasi' || command === 'motivation') {
                        await sock.sendMessage(from, { text: getMotivationRandom() }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'fakta' || command === 'funfact') {
                        await sock.sendMessage(from, { text: getFunFactRandom() }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'renungan' || command === 'reflection') {
                        await sock.sendMessage(from, { text: getReflectionRandom() }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'filosofis' || command === 'philosophical') {
                        await sock.sendMessage(from, { text: getPhilosophicalRandom() }, quoteOpt)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'quiz') {
                        const q = getQuizRandom()
                        await sendButtons(sock, from, {
                            text: q.question,
                            footer: BOT_NAME,
                            buttons: q.options.map(p => ({ id: 'quiz_' + p.charAt(0), text: p }))
                        })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'cdl' || command === 'canceldownload') {
                        const task = userActiveTask[from]
                        if (!task || task.tool !== 'download') {
                            await sock.sendMessage(from, { text: '⚠️ No active download running.' })
                        } else {
                            const url = activeDownloads[from]?.url
                            cleanupDownload(from)
                            releaseActiveTask(from)
                            await sock.sendMessage(from, { text: `✅ Download cancelled${url ? `.\n🔗 ${url}` : '.'}` })
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'cp' || command === 'cancelprocess') {
                        const task = userActiveTask[from]
                        if (!task) {
                            await sock.sendMessage(from, { text: '⚠️ No active process running.' })
                        } else if (task.tool === 'download') {
                            const url = activeDownloads[from]?.url
                            cleanupDownload(from)
                            releaseActiveTask(from)
                            await sock.sendMessage(from, { text: `✅ Download cancelled${url ? `.\n🔗 ${url}` : '.'}` })
                        } else {
                            const label = getActiveToolLabel(from)
                            task.cancel()
                            await sock.sendMessage(from, { text: `✅ Process *${label}* cancelled.` })
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'dl' || command === 'download') {
                        await runDownloadCommand(sock, from, msg, args, 'auto', '❌ Format: .download [url]'); return
                    }

                    if (command === 'dytmp3' || command === 'ytmp3') {
                        await runDownloadCommand(sock, from, msg, args, 'audio', '❌ Format: .ytmp3 [url]'); return
                    }

                    if (command === 'dytmp4' || command === 'ytmp4') {
                        await runDownloadCommand(sock, from, msg, args, 'video', '❌ Format: .ytmp4 [url]'); return
                    }

                    if (command === 'dtt' || command === 'tiktok') {
                        await runDownloadCommand(sock, from, msg, args, 'video', '❌ Format: .tiktok [url]'); return
                    }

                    if (command === 'sp' || command === 'spotify') {
                        await runDownloadCommand(sock, from, msg, args, 'audio', '❌ Format: .spotify [url]'); return
                    }

                    if (command === 'createimage' || command === 'imagine' || command === 'ci') {
                        const prompt = args.trim()
                        if (!prompt) { await sock.sendMessage(from, { text: `❌ Format: .createimage [image description]\nExample: .createimage a sunset over the ocean` }); await sock.sendPresenceUpdate('paused', from); return }
                        if (getValidProviders('image') === null) { await sock.sendMessage(from, { text: '⚠️ Image generation is not configured. Please fill in an image provider in ai.js first.' }); await sock.sendPresenceUpdate('paused', from); return }
                        await sock.sendMessage(from, { text: '🎨 Generating image...' })
                        const imgBuffer = await runQueuedTool(sock, from, msg.key, mediaGenQueue, 'mediaGen',
                            ({ signal }) => generateImage(prompt, signal))
                        if (!imgBuffer) { await sock.sendMessage(from, { text: '❌ Failed to generate image. Please try again later.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                        await sock.sendMessage(from, { image: imgBuffer, caption: `🖼️ ${prompt}` })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'createvideo' || command === 'genvideo' || command === 'cv') {
                        const prompt = args.trim()
                        if (!prompt) { await sock.sendMessage(from, { text: '❌ Format: .createvideo [video description]\nExample: .createvideo calm ocean waves at sunset' }); await sock.sendPresenceUpdate('paused', from); return }
                        if (getValidProviders('video') === null) { await sock.sendMessage(from, { text: '⚠️ Video generation is not configured. Please fill in a video provider in ai.js first.' }); await sock.sendPresenceUpdate('paused', from); return }
                        await sock.sendMessage(from, { text: '🎬 Generating video...' })
                        const vidBuffer = await runQueuedTool(sock, from, msg.key, mediaGenQueue, 'mediaGen',
                            ({ signal }) => generateVideo(prompt, signal))
                        if (!vidBuffer) { await sock.sendMessage(from, { text: '❌ Failed to generate video. Please try again later.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                        await sock.sendMessage(from, { video: vidBuffer, caption: `🎬 ${prompt}` })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'settimezone' || command === 'timezone') {
                        const tzUpper = args.toUpperCase()
                        const tz = TIMEZONE_MAP[tzUpper]
                        if (!tz) {
                            await sock.sendMessage(from, { text: `❌ Unknown timezone.\nAvailable: ${Object.keys(TIMEZONE_MAP).join(', ')}` })
                        } else {
                            userTimezones[from] = tz
                            fs.writeFileSync('./userTimezone.json', JSON.stringify(userTimezones, null, 2))
                            await sock.sendMessage(from, { text: `✅ Timezone set to *${tzUpper}* (${tz})` })
                        }
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'cron' || command === 'schedule') {
                        const subArgs = args.trim()
                        if (!subArgs || subArgs === 'list') {
                            const dynamicList = cronJobs.filter(j => j.jid === from && j.type === 'cron')
                            let listText = '📅 *Cron Jobs Aktif*\n\n'
                            if (CRON_STATIC.length > 0) listText += '*Statis:*\n' + CRON_STATIC.map((j, i) => `${i + 1}. ${j.name} — ${j.schedule}`).join('\n') + '\n\n'
                            if (dynamicList.length > 0) listText += '*Dynamic (yours):*\n' + dynamicList.map((j, i) => `${i + 1}. ${j.schedule} — ${j.message}`).join('\n') + '\n\n💡 Delete: .dcron [number] / .dcron all / .dcron'
                            if (CRON_STATIC.length === 0 && dynamicList.length === 0) listText += 'No cron job.'
                            await sock.sendMessage(from, { text: listText })
                            await sock.sendPresenceUpdate('paused', from); return
                        }

                        const creatorJid = msg.key.participant || msg.key.remoteJid
                        const userActiveCount = cronJobs.filter(j => j.type === 'cron' && j.creator === creatorJid).length
                        if (userActiveCount >= 5) {
                            await sock.sendMessage(from, { text: `❌ You already have ${userActiveCount} active cron jobs (maximum 5). Delete one first with .dcron.` })
                            await sock.sendPresenceUpdate('paused', from); return
                        }
                        const match = subArgs.match(/^(\d{2}):(\d{2})\s+([A-Z]+)\s+(.+)/i)
                        if (!match) { await sock.sendMessage(from, { text: '❌ Wrong format!\nExample: .cron 07:00 WIB Good morning!' }); await sock.sendPresenceUpdate('paused', from); return }
                        const tz = TIMEZONE_MAP[match[3].toUpperCase()]
                        if (!tz) { await sock.sendMessage(from, { text: `❌ Unknown timezone *${match[3]}*.` }); await sock.sendPresenceUpdate('paused', from); return }
                        const job = { type: 'cron', jid: from, creator: creatorJid, schedule: `${match[2]} ${match[1]} * * *`, timezone: tz, message: match[4] }
                        cronJobs.push(job)
                        await saveCronJobs()
                        scheduleDynamicCron(sock, job)
                        await sock.sendMessage(from, { text: `✅ Cron disimpan!\nJam: ${match[1]}:${match[2]} ${match[3].toUpperCase()}\nMessage: ${match[4]}` })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'reminder' || command === 'remind') {
                        const subArgs = args.trim()
                        if (subArgs.toLowerCase() === 'list') {
                            const list = cronJobs.filter(j => j.jid === from && j.type === 'reminder')
                            let listText = '⏰ *Reminder Aktif*\n\n'
                            if (list.length > 0) {
                                listText += list.map((j, i) => {
                                    const tzKey = Object.keys(TIMEZONE_MAP).find(k => TIMEZONE_MAP[k] === j.timezone) || j.timezone
                                    const sendAtLocal = new Date(j.sendAt).toLocaleString('en-US', { timeZone: j.timezone, dateStyle: 'short', timeStyle: 'short' })
                                    return `${i + 1}. ${sendAtLocal} ${tzKey} — ${j.message}`
                                }).join('\n') + '\n\n💡 Delete: .dreminder [number] / .dreminder all / .dreminder'
                            } else { listText += 'No reminders yet.' }
                            await sock.sendMessage(from, { text: listText })
                            await sock.sendPresenceUpdate('paused', from); return
                        }
                        const match = args.match(/^(\d{2}):(\d{2})\s+([A-Z]+)\s+(.+)/i)
                        if (!match) { await sock.sendMessage(from, { text: '❌ Wrong format!\nExample: .reminder 09:00 WIB Take medicine!' }); await sock.sendPresenceUpdate('paused', from); return }
                        const hour = parseInt(match[1]); const minute = parseInt(match[2])
                        const tz = TIMEZONE_MAP[match[3].toUpperCase()]
                        if (!tz) { await sock.sendMessage(from, { text: `❌ Unknown timezone *${match[3]}*.` }); await sock.sendPresenceUpdate('paused', from); return }
                        const now = new Date()
                        const userNow = new Date(now.toLocaleString('en-US', { timeZone: tz }))
                        const sendAt = new Date(userNow)
                        sendAt.setHours(hour, minute, 0, 0)
                        if (sendAt <= userNow) sendAt.setDate(sendAt.getDate() + 1)
                        cronJobs.push({ type: 'reminder', jid: from, sendAt: sendAt.toISOString(), timezone: tz, message: match[4] })
                        await saveCronJobs()
                        await sock.sendMessage(from, { text: `✅ Reminder disimpan!\nJam: ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} ${match[3].toUpperCase()}\nMessage: ${match[4]}` })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'dcron' || command === 'deletecron') {
                        const isGroupChat = from?.endsWith('@g.us')
                        if (isGroupChat) {
                            const senderJid = msg.key.participant || msg.key.remoteJid
                            const senderIsAdmin = await isGroupAdmin(sock, from, senderJid).catch(() => false)
                            if (!senderIsAdmin) { await sock.sendMessage(from, { text: '🚫 Only admins of this group can delete group cron jobs.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                        }
                        const target = args.trim().toLowerCase()
                        const list = cronJobs.filter(j => j.jid === from && j.type === 'cron')
                        if (!target || target === 'all') {
                            if (list.length === 0) { await sock.sendMessage(from, { text: '⚠️ No dynamic cron jobs to delete.' }) }
                            else { for (const j of list) stopAndRemoveDynamicCron(j); cronJobs = cronJobs.filter(j => !(j.jid === from && j.type === 'cron')); await saveCronJobs(); await sock.sendMessage(from, { text: `✅ ${list.length} cron job(s) successfully deleted.` }) }
                            await sock.sendPresenceUpdate('paused', from); return
                        }
                        const idx = parseInt(target) - 1
                        if (isNaN(idx) || idx < 0 || idx >= list.length) { await sock.sendMessage(from, { text: '❌ Invalid number. Check the correct number with .cron list' }); await sock.sendPresenceUpdate('paused', from); return }
                        const target_job = list[idx]
                        stopAndRemoveDynamicCron(target_job)
                        cronJobs = cronJobs.filter(j => j !== target_job)
                        await saveCronJobs()
                        await sock.sendMessage(from, { text: `✅ Cron job "${target_job.message}" (${target_job.schedule}) successfully deleted.` })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'dreminder' || command === 'deletereminder') {
                        const isGroupChat = from?.endsWith('@g.us')
                        if (isGroupChat) {
                            const senderJid = msg.key.participant || msg.key.remoteJid
                            const senderIsAdmin = await isGroupAdmin(sock, from, senderJid).catch(() => false)
                            if (!senderIsAdmin) { await sock.sendMessage(from, { text: '🚫 Only admins of this group can delete group reminders.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                        }
                        const target = args.trim().toLowerCase()
                        const list = cronJobs.filter(j => j.jid === from && j.type === 'reminder')
                        if (!target || target === 'all') {
                            if (list.length === 0) { await sock.sendMessage(from, { text: '⚠️ No reminders to delete.' }) }
                            else { cronJobs = cronJobs.filter(j => !(j.jid === from && j.type === 'reminder')); await saveCronJobs(); await sock.sendMessage(from, { text: `✅ ${list.length} reminder(s) successfully deleted.` }) }
                            await sock.sendPresenceUpdate('paused', from); return
                        }
                        const idx = parseInt(target) - 1
                        if (isNaN(idx) || idx < 0 || idx >= list.length) { await sock.sendMessage(from, { text: '❌ Invalid number. Check with .cron list' }); await sock.sendPresenceUpdate('paused', from); return }
                        const target_job = list[idx]
                        cronJobs = cronJobs.filter(j => j !== target_job)
                        await saveCronJobs()
                        await sock.sendMessage(from, { text: `✅ Reminder "${target_job.message}" successfully deleted.` })
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (command === 'poll') {
                        if (!args) { await sock.sendMessage(from, { text: 'Format: .poll Pertanyaan? Pilihan1, Pilihan2, Pilihan3' }); await sock.sendPresenceUpdate('paused', from); return }
                        let question, options
                        if (hasValidKeys()) {
                            const result = await callAI(from, `.poll ${args}`, null, null, '', BOT_NAME)
                            if (result && result.type === 'function' && result.name === 'send_poll') { question = result.args.question; options = result.args.options }
                            else { const parsed = parseLocalPoll(args); if (parsed) { question = parsed.question; options = parsed.options } }
                        } else {
                            const parsed = parseLocalPoll(args); if (parsed) { question = parsed.question; options = parsed.options }
                        }
                        if (!question || !options || options.length < 2) { await sock.sendMessage(from, { text: 'Format: .poll Pertanyaan? Pilihan1, Pilihan2, Pilihan3' }); await sock.sendPresenceUpdate('paused', from); return }
                        await executePoll(sock, from, question, options)
                        await sock.sendPresenceUpdate('paused', from); return
                    }

                    if (hasValidKeys()) {
                        const result = await callAI(from, text, null, null, '', BOT_NAME)

                        if (result) {
                            if (result.type === 'function') await handleFunctionResult(sock, from, msg, result, text)
                            else { const sentMsg = await sock.sendMessage(from, { text: result.text }, quoteOpt); setLastBotMsg(from, sentMsg.key) }
                            await sock.sendPresenceUpdate('paused', from); return
                        }
                    }

                    await sock.sendMessage(from, { text: '⚠️ Unknown command. Type .menu to see the command list.' })
                    await sock.sendPresenceUpdate('paused', from); return
                }
            }

            if (msgType === 'stickerMessage') {
                await handleStickerMessage(sock, from, msg, runQueuedTool, stickerQueue, callAI, handleFunctionResult, hasValidKeys, setLastBotMsg, quoteOpt)
                await sock.sendPresenceUpdate('paused', from); return
            }

            if (msgType === 'imageMessage') {
                const mime = msg.message.imageMessage.mimetype || ''
                const caption = msg.message.imageMessage.caption || ''
                const fileSize = getFileSizeFromMsg(msg, msgType)
                if (mime && !validateMime(mime, ALLOWED_IMAGE_MIME)) { await sock.sendMessage(from, { text: '⚠️ Unsupported image format.' }); await sock.sendPresenceUpdate('paused', from); return }
                if (fileSize > MAX_FILE_SIZE) { await sock.sendMessage(from, { text: `⚠️ Image is too large (${(fileSize/1024/1024).toFixed(1)}MB). Maximum 20MB.` }); await sock.sendPresenceUpdate('paused', from); return }

                const captionTrimmed = caption.trim()
                const hasCommandPrefix = captionTrimmed.startsWith('.') || captionTrimmed.startsWith('#') || captionTrimmed.startsWith('!')
                const captionCommand = hasCommandPrefix ? captionTrimmed.slice(1).split(/\s+/)[0]?.toLowerCase() : ''
                if (captionCommand === 'setppgroup') {
                    const isGroupChat = from?.endsWith('@g.us')
                    if (!isGroupChat) { await sock.sendMessage(from, { text: '⚠️ This command can only be used inside a group.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                    const senderIsAdmin = await isGroupAdmin(sock, from, senderJid).catch(() => false)
                    if (!senderIsAdmin) { await sock.sendMessage(from, { text: '🚫 Group admins only.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                    try {
                        const imgBuffer = await downloadMediaMessage(msg, 'buffer', {})
                        await sock.updateProfilePicture(from, imgBuffer)
                        await sock.sendMessage(from, { text: '✅ Group photo successfully updated.' }, quoteOpt)
                    } catch (e) {
                        console.error('[bot:setppgroup] failed (direct caption):', e)
                        await sock.sendMessage(from, { text: '❌ Failed to change group photo. Make sure the bot is admin and the image is valid.' }, quoteOpt)
                    }
                    await sock.sendPresenceUpdate('paused', from); return
                }
                if (captionCommand === 'sqr' || captionCommand === 'scanqr') {
                    const qrBuffer = await downloadMediaMessage(msg, 'buffer', {})
                    if (qrBuffer.length > MAX_FILE_SIZE) { await sock.sendMessage(from, { text: '⚠️ Image is too large. Maximum 20MB.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                    await sock.sendMessage(from, { text: '⏳ Scanning QR code...' })
                    const decoded = await runQueuedTool(sock, from, msg.key, mediaGenQueue, 'mediaGen',
                        () => decodeQRFromBuffer(qrBuffer))
                    if (decoded === undefined) { await sock.sendPresenceUpdate('paused', from); return }
                    if (decoded === null) {
                        await sock.sendMessage(from, { text: '❌ No QR code found in that image. Try a clearer or larger image.' }, quoteOpt)
                    } else {
                        await sock.sendMessage(from, { text: `✅ *QR Code Content:*\n\n${decoded}` }, quoteOpt)
                    }
                    await sock.sendPresenceUpdate('paused', from); return
                }
                if (caption.toLowerCase().includes('sticker') || caption.toLowerCase().includes('stiker')) {
                    await handleImageStickerCaption(sock, from, msg, runQueuedTool, stickerQueue, imageToSticker)
                    await sock.sendPresenceUpdate('paused', from); return
                }
                if (!hasValidKeys()) { await sock.sendMessage(from, { text: '⚠️ AI is currently unavailable. Send with the caption "sticker" to create a sticker.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                await sock.sendMessage(from, { text: '⏳ Analysing image...' })
                const imgBuffer = await downloadMediaMessage(msg, 'buffer', {})
                if (imgBuffer.length > MAX_FILE_SIZE) { await sock.sendMessage(from, { text: '⚠️ Image is too large after download. Maximum 20MB.' }); await sock.sendPresenceUpdate('paused', from); return }
                const base64 = imgBuffer.toString('base64')
                const result = await callAI(from, caption || 'Describe the content of this image in detail in English', base64, mime || 'image/jpeg', '', BOT_NAME)

                if (!result) { await sock.sendMessage(from, { text: '⚠️ AI unavailable. Send with caption "sticker" to create a sticker.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                if (result.type === 'function') {

                    if (result.name === 'react_message' && !result.args.reply) {
                        const retry = await callAI(from, 'Describe the content of this image in detail in English', base64, mime || 'image/jpeg', '', BOT_NAME)
                        if (retry && retry.type === 'text') {
                            const sentMsg = await sock.sendMessage(from, { text: retry.text }, quoteOpt)
                            setLastBotMsg(from, sentMsg.key)
                        }
                    } else {
                        await handleFunctionResult(sock, from, msg, result, caption || '[image]')
                    }
                }
                else { const sentMsg = await sock.sendMessage(from, { text: result.text }, quoteOpt); setLastBotMsg(from, sentMsg.key) }
                await sock.sendPresenceUpdate('paused', from); return
            }

            if (msgType === 'videoMessage') {
                const mime = msg.message.videoMessage.mimetype || ''
                const caption = msg.message.videoMessage.caption || ''
                const fileSize = getFileSizeFromMsg(msg, msgType)
                if (mime && !validateMime(mime, ALLOWED_VIDEO_MIME)) { await sock.sendMessage(from, { text: '⚠️ Unsupported video format.' }); await sock.sendPresenceUpdate('paused', from); return }
                if (fileSize > MAX_FILE_SIZE) { await sock.sendMessage(from, { text: `⚠️ Video is too large (${(fileSize/1024/1024).toFixed(1)}MB). Maximum 20MB.` }); await sock.sendPresenceUpdate('paused', from); return }
                if (!hasValidKeys()) {
                    if (caption.toLowerCase().includes('sticker')) {
                        await sock.sendMessage(from, { text: '⏳ Creating sticker from video...' })
                        const videoBuf = await downloadMediaMessage(msg, 'buffer', {})
                        const stickerBuffer = await runQueuedTool(sock, from, msg.key, stickerQueue, 'sticker',
                            ({ registerKill }) => videoToSticker(videoBuf, (proc) => registerKill(() => proc.kill('SIGTERM'))))
                        if (stickerBuffer) await sock.sendMessage(from, { sticker: stickerBuffer })
                    } else { await sock.sendMessage(from, { text: '⚠️ AI unavailable. Send with caption "sticker" to create a sticker from this video.' }, quoteOpt) }
                    await sock.sendPresenceUpdate('paused', from); return
                }
                await sock.sendMessage(from, { text: '⏳ Analysing video...' })
                const videoBuffer = await downloadMediaMessage(msg, 'buffer', {})
                if (videoBuffer.length > MAX_FILE_SIZE) { await sock.sendMessage(from, { text: '⚠️ Video is too large after download. Maximum 20MB.' }); await sock.sendPresenceUpdate('paused', from); return }
                const base64 = videoBuffer.toString('base64')
                const result = await callAI(from, caption || 'Describe the content of this video in detail in English', base64, mime || 'video/mp4', '', BOT_NAME)

                if (!result) {
                    if (caption.toLowerCase().includes('sticker')) {
                        await sock.sendMessage(from, { text: '⏳ Creating sticker from video...' })
                        const stickerBuffer = await runQueuedTool(sock, from, msg.key, stickerQueue, 'sticker',
                            ({ registerKill }) => videoToSticker(videoBuffer, (proc) => registerKill(() => proc.kill('SIGTERM'))))
                        if (stickerBuffer) await sock.sendMessage(from, { sticker: stickerBuffer })
                    } else { await sock.sendMessage(from, { text: '⚠️ AI unavailable. Send with caption "sticker" to create a sticker.' }, quoteOpt) }
                    await sock.sendPresenceUpdate('paused', from); return
                }
                if (result.type === 'function') {
                    if (result.name === 'react_message' && !result.args.reply) {
                        const retry = await callAI(from, 'Describe the content of this video in detail in English', base64, mime || 'video/mp4', '', BOT_NAME)
                        if (retry && retry.type === 'text') {
                            const sentMsg = await sock.sendMessage(from, { text: retry.text }, quoteOpt)
                            setLastBotMsg(from, sentMsg.key)
                        }
                    } else {
                        await handleFunctionResult(sock, from, msg, result, caption || '[video]')
                    }
                }
                else { const sentMsg = await sock.sendMessage(from, { text: result.text }, quoteOpt); setLastBotMsg(from, sentMsg.key) }
                await sock.sendPresenceUpdate('paused', from); return
            }

            if (msgType === 'documentMessage') {
                const mime = msg.message.documentMessage.mimetype || ''
                const fileName = msg.message.documentMessage.fileName || 'dokumen'
                const fileSize = getFileSizeFromMsg(msg, msgType)
                if (mime && !validateMime(mime, ALLOWED_DOC_MIME)) { await sock.sendMessage(from, { text: `⚠️ Unsupported document format.` }); await sock.sendPresenceUpdate('paused', from); return }
                if (fileSize > MAX_FILE_SIZE) { await sock.sendMessage(from, { text: `⚠️ Document is too large (${(fileSize/1024/1024).toFixed(1)}MB). Maximum 20MB.` }); await sock.sendPresenceUpdate('paused', from); return }
                await sock.sendMessage(from, { text: `⏳ Membaca dokumen ${fileName}...` })
                const docBuffer = await downloadMediaMessage(msg, 'buffer', {})
                const base64 = docBuffer.toString('base64')
                const result = await callAI(from, `This is a document "${fileName}". Analyse and summarise its contents in detail.`, base64, mime || 'application/pdf', '', BOT_NAME)

                if (!result) { await sock.sendMessage(from, { text: '⚠️ AI unavailable. Cannot read documents right now.' }, quoteOpt); await sock.sendPresenceUpdate('paused', from); return }
                if (result.type === 'function') {
                    if (result.name === 'react_message' && !result.args.reply) {
                        const retry = await callAI(from, `This is a document "${fileName}". Analyse and summarise its contents in detail.`, base64, mime || 'application/pdf', '', BOT_NAME)
                        if (retry && retry.type === 'text') {
                            const sentMsg = await sock.sendMessage(from, { text: retry.text }, quoteOpt)
                            setLastBotMsg(from, sentMsg.key)
                        }
                    } else {
                        await handleFunctionResult(sock, from, msg, result, `[dokumen: ${fileName}]`)
                    }
                } else {
                    const sentMsg = await sock.sendMessage(from, { text: result.text }, quoteOpt); setLastBotMsg(from, sentMsg.key)
                }
                await sock.sendPresenceUpdate('paused', from); return
            }

            if (msgType === 'audioMessage') {
                const mime = msg.message.audioMessage.mimetype || ''
                const fileSize = getFileSizeFromMsg(msg, msgType)
                if (mime && !validateMime(mime, ALLOWED_AUDIO_MIME)) { await sock.sendMessage(from, { text: '⚠️ Unsupported audio format.' }); await sock.sendPresenceUpdate('paused', from); return }
                if (fileSize > MAX_FILE_SIZE) { await sock.sendMessage(from, { text: `⚠️ Audio is too large (${(fileSize/1024/1024).toFixed(1)}MB). Maximum 20MB.` }); await sock.sendPresenceUpdate('paused', from); return }
                await sock.sendPresenceUpdate('recording', from)
                const audioBuffer = await downloadMediaMessage(msg, 'buffer', {})
                const base64 = audioBuffer.toString('base64')
                const result = await callAI(from, 'Transcribe this voice message and provide an appropriate response in the same language as the user', base64, mime || 'audio/ogg; codecs=opus', '', BOT_NAME)

                if (!result) { await sock.sendMessage(from, { text: '⚠️ AI unavailable. Cannot transcribe voice notes right now.' }); await sock.sendPresenceUpdate('paused', from); return }
                if (result.type === 'function') {
                    if (result.name === 'react_message' && !result.args.reply) {
                        const retry = await callAI(from, 'Transcribe this voice message and provide an appropriate response in the same language as the user', base64, mime || 'audio/ogg; codecs=opus', '', BOT_NAME)
                        if (retry && retry.type === 'text') {
                            const sentMsg = await sock.sendMessage(from, { text: retry.text }, quoteOpt)
                            setLastBotMsg(from, sentMsg.key)
                        }
                    } else {
                        await handleFunctionResult(sock, from, msg, result, '[audio]')
                    }
                } else {
                    const sentMsg = await sock.sendMessage(from, { text: result.text || 'Could not process this audioo' }, quoteOpt); setLastBotMsg(from, sentMsg.key)
                }
                await sock.sendPresenceUpdate('paused', from); return
            }

            if (!text) return

            if (!hasValidKeys()) { await handleLocalFallback(sock, from, msg, text, msgType); await sock.sendPresenceUpdate('paused', from); return }

            const result = await callAI(from, text, null, null, '', BOT_NAME)

            if (!result) { await handleLocalFallback(sock, from, msg, text, msgType); await sock.sendPresenceUpdate('paused', from); return }

            if (result.type === 'function') { await handleFunctionResult(sock, from, msg, result, text) }
            else { const sentMsg = await sock.sendMessage(from, { text: result.text }, quoteOpt); setLastBotMsg(from, sentMsg.key) }

            await sock.sendPresenceUpdate('paused', from)

        } catch(e) {
            console.error('[bot:message-handler] Error tak terduga:', e)
            await sock.sendMessage(from, { text: '❌ An error occurred while processing your message. Please try again in a moment.' })
            await sock.sendPresenceUpdate('paused', from)
        }
    })
}

process.on('uncaughtException', (err) => {
    console.log(`🔥 [uncaughtException] ${new Date().toISOString()}`)
    console.log('Message:', err?.message)
    console.log('Stack:', err?.stack)

    const transient = ['ECONNRESET','ETIMEDOUT','ENOTFOUND','EPIPE','forbidden']
    if (transient.some(t => err?.message?.includes(t))) {
        console.log('⚠️ Error transient/koneksi, bot tetap berjalan.')
        return
    }
    console.log('⚠️ Unknown error, keeping process alive (no exit) — monitor logs above for further debugging.')
})

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason)
    console.log(`🔥 [unhandledRejection] ${new Date().toISOString()}`)
    console.log('Reason:', msg)
    console.log('Stack:', reason?.stack)
    const transient = ['ECONNRESET','ETIMEDOUT','ENOTFOUND','EPIPE','forbidden']
    if (transient.some(t => msg.includes(t))) {
        console.log('⚠️ Rejection transient/koneksi, bot tetap berjalan.')
        return
    }
    console.log('⚠️ Unknown rejection, keeping process alive (no exit) — monitor logs above for further debugging.')
})

startBot()

