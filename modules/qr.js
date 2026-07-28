'use strict'

const QRCode = require('qrcode')
const jsQR = require('jsqr')
const { Jimp } = require('jimp')

const MAX_FILE_SIZE = 20 * 1024 * 1024

// ─── DATA TYPE DETECTION ────────────────────────────────────────────────────
// Detects what kind of data the user typed and builds the correct QR payload
// format (URL stays as-is, WiFi/email/phone/geo get wrapped in their
// respective URI schemes so scanning apps trigger the right native action).

const URL_RE   = /^https?:\/\/\S+$/i
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,}[0-9]$/
const GEO_RE   = /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/
// wifi:ssid=XXX;pass=YYY;type=WPA — fields can appear in any order, pass/type are optional
const WIFI_PREFIX_RE = /^wifi:\s*/i

function escapeWifiField(str) {
    return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/:/g, '\\:').replace(/"/g, '\\"')
}

function detectAndBuildPayload(input) {
    const text = input.trim()

    if (URL_RE.test(text)) {
        return { type: 'URL', payload: text }
    }

    if (WIFI_PREFIX_RE.test(text)) {
        // Parse fields independently of order — e.g. "type=nopass;ssid=X" works the same as
        // "ssid=X;type=nopass". A single combined regex breaks when fields appear out of the
        // expected sequence, so each field is matched on its own instead.
        const body = text.replace(WIFI_PREFIX_RE, '')
        const ssidMatch = body.match(/ssid=([^;]*)/i)
        const passMatch = body.match(/pass=([^;]*)/i)
        const typeMatch = body.match(/type=(\w+)/i)

        if (ssidMatch) {
            const ssid = escapeWifiField(ssidMatch[1].trim())
            const pass = passMatch ? escapeWifiField(passMatch[1].trim()) : ''
            const auth = (typeMatch ? typeMatch[1] : 'WPA').toUpperCase()
            const authType = ['NONE', 'OPEN', 'NOPASS'].includes(auth) ? 'nopass' : auth
            const passSegment = authType === 'nopass' ? '' : `P:${pass};`
            return { type: 'WiFi', payload: `WIFI:T:${authType};S:${ssid};${passSegment};` }
        }
    }

    if (GEO_RE.test(text)) {
        const [lat, lon] = text.split(',').map(s => s.trim())
        return { type: 'Location', payload: `geo:${lat},${lon}` }
    }

    if (EMAIL_RE.test(text)) {
        return { type: 'Email', payload: `mailto:${text}` }
    }

    if (/^call:/i.test(text)) {
        const num = text.replace(/^call:\s*/i, '').replace(/[\s().-]/g, '')
        return { type: 'Phone Call', payload: `tel:${num}` }
    }

    if (/^wa\s+\S/i.test(text)) {
        const num = text.replace(/^wa\s+/i, '').replace(/[^0-9]/g, '')
        // wa.me triggers WhatsApp's native "Add to Contacts" / chat prompt when scanned —
        // this is the closest match to WhatsApp's own Settings → Scan Code feature.
        // Kept behind an explicit "wa " prefix (rather than default for any phone number)
        // since a plain number is ambiguous — the user must opt in to the WhatsApp-specific link.
        return { type: 'WhatsApp Contact', payload: `https://wa.me/${num}` }
    }

    if (PHONE_RE.test(text) && text.replace(/[^0-9]/g, '').length >= 7) {
        return { type: 'Phone Call', payload: `tel:${text.replace(/[\s().-]/g, '')}` }
    }

    return { type: 'Text', payload: text }
}

function buildVCard(contact) {
    // contact: { displayName, vcard } as provided by WhatsApp's contactMessage
    if (contact.vcard) return contact.vcard
    const name = contact.displayName || 'Contact'
    return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nEND:VCARD`
}

// ─── GENERATE ───────────────────────────────────────────────────────────────

async function generateQR(payload, signal) {
    const byteLength = Buffer.byteLength(payload, 'utf8')
    console.log(`[qr:generate] payload="${payload}" chars=${payload.length} bytes=${byteLength}`)

    const options = {
        errorCorrectionLevel: 'M',
        type: 'png',
        // ISO/IEC 18004 requires a minimum quiet zone of 4 modules around the QR code.
        // margin: 2 (the qrcode package default) is below this — WhatsApp's own scanner
        // rejects codes with an insufficient quiet zone, especially for shorter payloads
        // that render at a lower QR version (fewer, larger modules), where a 2-module
        // margin becomes visually too thin in absolute pixels for edge detection to lock on.
        margin: 4,
        width: 512
    }

    let buffer
    try {
        buffer = await QRCode.toBuffer(payload, options)
    } catch (e) {
        console.error(`[qr:generate] toBuffer FAILED for payload="${payload}":`, e?.message, e?.stack)
        throw e
    }

    if (signal?.aborted) throw new Error('ABORTED')

    console.log(`[qr:generate] success — output buffer size=${buffer.length} bytes`)
    return buffer
}

// ─── SCAN / DECODE ──────────────────────────────────────────────────────────

async function decodeQRFromBuffer(buffer) {
    const image = await Jimp.read(buffer)
    const { data, width, height } = image.bitmap
    const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width, height)
    if (!result) return null
    return result.data
}

module.exports = {
    detectAndBuildPayload,
    buildVCard,
    generateQR,
    decodeQRFromBuffer,
    MAX_FILE_SIZE
}
