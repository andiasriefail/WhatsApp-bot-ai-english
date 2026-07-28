'use strict'

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const dns = require('dns').promises
const net = require('net')

const MAX_SEND_VIDEO = 64 * 1024 * 1024
const MAX_SEND_AUDIO = 16 * 1024 * 1024
const INFO_TIMEOUT_MS = 25 * 1000

const activeDownloads = {}

// ─── URL SAFETY / SSRF GUARD ──────────────────────────────────────────────────
// Validasi URL SEBELUM diteruskan ke yt-dlp/spotdl. Cek scheme, hostname
// literal, DAN hasil resolve DNS-nya (DNS rebinding-safe) — supaya domain
// publik yang resolve ke IP privat/loopback/link-local/reserved tetap ditolak.
// AI/command tidak menilai sendiri apakah URL aman, ini satu-satunya sumber
// keputusan; AI hanya menyampaikan ulang REJECT_MESSAGE.

const REJECT_MESSAGE = '❌ This URL points to an internal/private address (localhost, local IP, or internal network) and cannot be processed for security reasons.'

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true // malformed → treat as unsafe
    const [a, b] = parts
    if (a === 127) return true                            // 127.0.0.0/8 loopback
    if (a === 10) return true                              // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true        // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true                 // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true                 // 169.254.0.0/16 link-local (termasuk cloud metadata 169.254.169.254)
    if (a === 0) return true                                // 0.0.0.0/8 "this network"
    if (a >= 224) return true                               // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast
    if (a === 100 && b >= 64 && b <= 127) return true        // 100.64.0.0/10 shared/CGNAT
    if (a === 192 && b === 0 && parts[2] === 0) return true   // 192.0.0.0/24 IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true     // 198.18.0.0/15 benchmarking
    return false
}

// Beberapa hostname IPv6 yang dipakai untuk membungkus alamat IPv4
// (::ffff:a.b.c.d) di-canonical-kan oleh WHATWG URL parser Node menjadi
// bentuk hex-group (::ffff:XXXX:YYYY), BUKAN dotted-decimal. Kalau ini tidak
// di-unwrap secara numerik, alamat seperti ::ffff:127.0.0.1 bisa lolos cek.
function unwrapIPv4MappedIPv6(hostname) {
    const m = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
    if (!m) return null
    const hi = parseInt(m[1], 16)
    const lo = parseInt(m[2], 16)
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.')
}

function isPrivateIPv6(ip) {
    const normalized = ip.toLowerCase()
    if (normalized === '::1') return true                    // loopback
    if (normalized === '::') return true                     // unspecified
    if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true     // fe80::/10 link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true // fc00::/7 unique local (ULA)
    const unwrapped = unwrapIPv4MappedIPv6(normalized)
    if (unwrapped) return isPrivateIPv4(unwrapped)
    return false
}

function isPrivateOrReservedIP(ip) {
    const version = net.isIP(ip)
    if (version === 4) return isPrivateIPv4(ip)
    if (version === 6) return isPrivateIPv6(ip)
    return true // bukan IP valid sama sekali → treat as unsafe
}

// Validasi utama: scheme + hostname literal + hasil resolve DNS.
// Return { safe: true } atau { safe: false, reason: '...' } (reason untuk log
// internal saja, jangan ditampilkan mentah-mentah ke user).
async function checkUrlSafety(rawUrl) {
    let parsed
    try {
        parsed = new URL(rawUrl)
    } catch (e) {
        return { safe: false, reason: 'URL tidak valid' }
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: `Scheme tidak diizinkan: ${parsed.protocol}` }
    }

    let hostname = parsed.hostname.toLowerCase()
    if (hostname.startsWith('[') && hostname.endsWith(']')) hostname = hostname.slice(1, -1)

    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        return { safe: false, reason: 'Hostname localhost' }
    }

    if (net.isIP(hostname)) {
        if (isPrivateOrReservedIP(hostname)) return { safe: false, reason: `IP literal privat/reserved: ${hostname}` }
        return { safe: true }
    }

    // Hostname berupa domain → WAJIB resolve DNS dan cek SEMUA IP hasil
    // resolve (A + AAAA), supaya domain publik yang DNS-rebinding ke
    // 127.0.0.1/169.254.169.254/IP internal lain tetap ditolak.
    let addresses = []
    try {
        const results = await dns.lookup(hostname, { all: true, verbatim: true })
        addresses = results.map(r => r.address)
    } catch (e) {
        return { safe: false, reason: `DNS resolve gagal: ${e.message}` }
    }

    if (addresses.length === 0) {
        return { safe: false, reason: 'DNS returned no addresses' }
    }

    for (const addr of addresses) {
        if (isPrivateOrReservedIP(addr)) {
            return { safe: false, reason: `Domain ${hostname} resolve ke IP privat/reserved: ${addr}` }
        }
    }

    return { safe: true }
}

function cleanupDownload(jid) {
    const dl = activeDownloads[jid]
    if (!dl) return
    try {
        if (dl.process && !dl.process.killed) dl.process.kill('SIGTERM')
    } catch(e) {}
    try {
        if (dl.tmpDir && fs.existsSync(dl.tmpDir)) {
            fs.rmSync(dl.tmpDir, { recursive: true, force: true })
        }
    } catch(e) {}
    delete activeDownloads[jid]
}

// Jalankan proses info (yt-dlp/spotdl) dengan timeout, supaya proses yang hang
// tidak membuat promise menggantung selamanya. Kalau jid diberikan, proses
// dikaitkan ke activeDownloads[jid] supaya bisa dibunuh manual lewat .cdl juga.
function spawnInfoWithTimeout(cmd, args, jid) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args)
        if (jid) activeDownloads[jid] = { ...(activeDownloads[jid] || {}), process: proc }

        let settled = false
        const timer = setTimeout(() => {
            if (settled) return
            settled = true
            try { if (!proc.killed) proc.kill('SIGTERM') } catch(e) {}
            reject(new Error(`Timeout (${INFO_TIMEOUT_MS / 1000}s) saat membaca info media. Coba lagi atau cek URL.`))
        }, INFO_TIMEOUT_MS)

        let out = '', err = ''
        proc.stdout.on('data', d => { out += d.toString() })
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('close', code => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve({ code, out, err })
        })
        proc.on('error', e => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            reject(e)
        })
    })
}

async function getMediaInfo(url, jid) {
    let result
    try {
        result = await spawnInfoWithTimeout('yt-dlp', [
            '--print', '%(title)s\n%(duration)s\n%(ext)s\n%(uploader)s',
            '--no-playlist', '--no-warnings', url
        ], jid)
    } catch(e) {
        if (e.code === 'ENOENT') throw new Error('yt-dlp not found. Install: pip install yt-dlp')
        throw e
    }
    if (result.code !== 0) throw new Error(result.err || 'Failed to fetch media info')
    const lines = result.out.trim().split('\n')
    return { title: lines[0] || 'Unknown', duration: parseInt(lines[1]) || 0, ext: lines[2] || 'mp4', uploader: lines[3] || 'Unknown' }
}

async function getMediaInfoSpotify(url, jid) {
    let result
    try {
        result = await spawnInfoWithTimeout('spotdl', ['--print-errors', 'url', url], jid)
    } catch(e) {
        if (e.code === 'ENOENT') throw new Error('spotdl not found. Install: pip install spotdl')
        throw e
    }
    return { title: url, duration: 0, ext: 'mp3', uploader: 'Spotify' }
}

function detectPlatform(url) {
    if (/spotify\.com/.test(url)) return 'spotify'
    if (/tiktok\.com/.test(url)) return 'tiktok'
    if (/instagram\.com/.test(url)) return 'instagram'
    if (/facebook\.com|fb\.watch/.test(url)) return 'facebook'
    if (/twitter\.com|x\.com/.test(url)) return 'twitter'
    if (/youtube\.com|youtu\.be/.test(url)) return 'youtube'
    return 'auto'
}

function formatDuration(seconds) {
    if (!seconds) return 'N/A'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

async function downloadVideo(url, tmpDir, platform, jid) {
    const outTemplate = path.join(tmpDir, '%(title).60s.%(ext)s')
    const args = ['-f', 'bv*+ba/b', '-S', 'res:1080,ext:mp4,codec:h264', '--merge-output-format', 'mp4', '-o', outTemplate, '--no-playlist', '--quiet', '--no-warnings']
    if (platform === 'tiktok') args.push('--extractor-args', 'tiktok:api_hostname=api22-normal-c-useast2a.tiktokv.com')
    args.push(url)
    await new Promise((resolve, reject) => {
        const proc = spawn('yt-dlp', args)
        if (activeDownloads[jid]) activeDownloads[jid].process = proc
        let err = ''
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('close', code => {
            if (code !== 0 && activeDownloads[jid]) reject(new Error(err || `yt-dlp exit ${code}`))
            else resolve()
        })
        proc.on('error', () => reject(new Error('yt-dlp not found. Install: pip install yt-dlp')))
    })
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.mp4'))
    if (!files.length) throw new Error('File not found after download.')
    return path.join(tmpDir, files[0])
}

async function downloadAudio(url, tmpDir, jid) {
    const outTemplate = path.join(tmpDir, '%(title).60s.%(ext)s')
    const args = ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outTemplate, '--no-playlist', '--quiet', '--no-warnings', url]
    await new Promise((resolve, reject) => {
        const proc = spawn('yt-dlp', args)
        if (activeDownloads[jid]) activeDownloads[jid].process = proc
        let err = ''
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('close', code => {
            if (code !== 0 && activeDownloads[jid]) reject(new Error(err || `yt-dlp exit ${code}`))
            else resolve()
        })
        proc.on('error', () => reject(new Error('yt-dlp not found. Install: pip install yt-dlp')))
    })
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.mp3'))
    if (!files.length) throw new Error('MP3 file not found after download.')
    return path.join(tmpDir, files[0])
}

async function downloadSpotify(url, tmpDir, jid) {
    const args = ['--output', tmpDir, '--format', 'mp3', url]
    await new Promise((resolve, reject) => {
        const proc = spawn('spotdl', args)
        if (activeDownloads[jid]) activeDownloads[jid].process = proc
        let err = ''
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('close', code => {
            if (code !== 0 && activeDownloads[jid]) reject(new Error(err || 'spotdl failed'))
            else resolve()
        })
        proc.on('error', () => reject(new Error('spotdl not found. Install: pip install spotdl')))
    })
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.mp3'))
    if (!files.length) throw new Error('Spotify file not found after download.')
    return path.join(tmpDir, files[0])
}

async function handleDownload(sock, from, url, forceType = 'auto') {
    if (activeDownloads[from]) {
        await sock.sendMessage(from, {
            text: `⚠️ You already have an active download!\n📎 URL: ${activeDownloads[from].url}\n\nType *.cdl* to cancel it first.`
        })
        return
    }

    // Cek SSRF dulu, SEBELUM proses apapun (termasuk fase "mendeteksi media")
    // dimulai. URL ke IP privat/loopback/link-local/localhost — atau domain
    // yang resolve ke situ — tidak pernah sampai ke yt-dlp/spotdl.
    const safety = await checkUrlSafety(url)
    if (!safety.safe) {
        console.warn('[downloader] URL rejected (SSRF guard):', safety.reason)
        await sock.sendMessage(from, { text: REJECT_MESSAGE })
        return
    }

    const platform = detectPlatform(url)
    const isSpotify = platform === 'spotify'
    const isAudio = forceType === 'audio' || isSpotify
    const maxSize = isAudio ? MAX_SEND_AUDIO : MAX_SEND_VIDEO
    const maxLabel = isAudio ? '16 MB' : '64 MB'

    await sock.sendMessage(from, { text: `⏳ Detecting media...\n🔗 ${url}` })

    // Lock diset di awal (sebelum fase deteksi info), bukan setelahnya, supaya
    // .cdl bisa membatalkan proses yt-dlp/spotdl bahkan saat masih di fase
    // "mendeteksi media" dan supaya tidak ada window kosong yang bikin retry
    // menumpuk proses orphan kalau proses info hang.
    activeDownloads[from] = { url, tmpDir: null, process: null, startedAt: Date.now() }

    let info
    try {
        info = isSpotify ? await getMediaInfoSpotify(url, from) : await getMediaInfo(url, from)
    } catch(e) {
        console.error('[downloader] getMediaInfo failed:', e)
        if (activeDownloads[from]) {
            await sock.sendMessage(from, { text: '❌ Failed to read URL. Make sure the link is valid and public, then try again.' })
        }
        cleanupDownload(from)
        return
    }

    if (!activeDownloads[from]) {
        // Dibatalkan via .cdl selama fase deteksi info
        return
    }

    const platformEmoji = { youtube: '▶️', tiktok: '🎵', instagram: '📸', facebook: '📘', twitter: '🐦', spotify: '🎧', auto: '🌐' }

    await sock.sendMessage(from, {
        text: `📥 *Starting download...*\n\n${platformEmoji[platform] || '🌐'} Platform: ${platform.toUpperCase()}\n🎬 Title: ${info.title}\n⏱️ Duration: ${formatDuration(info.duration)}\n\nType *.cdl* to cancel`
    })

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wadl_'))
    activeDownloads[from].tmpDir = tmpDir

    try {
        let filePath
        if (isSpotify) {
            filePath = await downloadSpotify(url, tmpDir, from)
        } else if (isAudio || forceType === 'audio') {
            filePath = await downloadAudio(url, tmpDir, from)
        } else {
            filePath = await downloadVideo(url, tmpDir, platform, from)
        }

        if (!activeDownloads[from]) {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch(e) {}
            return
        }

        const stat = fs.statSync(filePath)
        if (stat.size > maxSize) {
            await sock.sendMessage(from, { text: `❌ File hasil download terlalu besar (${(stat.size/1024/1024).toFixed(1)} MB). Batas ${maxLabel}.` })
            cleanupDownload(from)
            return
        }

        const fileBuffer = fs.readFileSync(filePath)
        const fileName = path.basename(filePath)

        if (isAudio || isSpotify) {
            await sock.sendMessage(from, { audio: fileBuffer, mimetype: 'audio/mpeg', fileName, ptt: false })
        } else {
            await sock.sendMessage(from, { video: fileBuffer, mimetype: 'video/mp4', fileName, caption: `✅ ${info.title}` })
        }

    } catch(e) {
        console.error('[downloader] handleDownload failed:', e)
        if (activeDownloads[from]) {
            await sock.sendMessage(from, { text: '❌ Download failed. Please try again or use a different URL.' })
        }
    } finally {
        cleanupDownload(from)
    }
}

module.exports = { handleDownload, cleanupDownload, activeDownloads, checkUrlSafety, REJECT_MESSAGE }
