const crypto = require('crypto')

const pollStore = new Map()

async function executePoll(sock, from, question, options) {
    console.log(`[poll:send] Creating poll in ${from}`)
    console.log(`[poll:send] question = "${question}"`)
    console.log(`[poll:send] options  =`, options)

    const pollEncKey = crypto.randomBytes(32)

    const sentMsg = await sock.sendMessage(from, {
        poll: { name: question, values: options, selectableCount: 1, messageSecret: pollEncKey }
    })

    const pollId = sentMsg?.key?.id
    if (pollId) {
        const pollData = {
            question,
            options,
            from,
            msgFull: sentMsg,
            pollCreationKey: sentMsg.key,
            pollEncKey
        }
        pollStore.set(pollId, pollData)
        pollStore.set(pollId.toUpperCase(), pollData)
        pollStore.set(pollId.toLowerCase(), pollData)
        console.log(`[poll:send] pollId = "${pollId}"`)
        console.log(`[poll:send] pollStore.size sekarang = ${pollStore.size}`)
    } else {
        console.log('[poll:send] ⚠️ sentMsg has no key.id, poll not saved!')
    }

    return sentMsg
}

async function handlePollVote(sock, msg) {
    console.log('[poll:vote] ════════════════════════════════════')
    console.log('[poll:vote] Event received from', msg.key.remoteJid)

    const pollUpdateMessage = msg.message?.pollUpdateMessage
    if (!pollUpdateMessage) { console.log('[poll:vote] ⚠️ pollUpdateMessage kosong, skip'); return }

    const pollCreationKey = pollUpdateMessage.pollCreationMessageKey
    const pollIdRaw = pollCreationKey?.id
    console.log('[poll:vote] pollId (raw) =', pollIdRaw)
    console.log('[poll:vote] pollStore.size =', pollStore.size)
    console.log('[poll:vote] pollStore keys =', [...pollStore.keys()])

    const storedPoll = pollIdRaw
        ? (pollStore.get(pollIdRaw) || pollStore.get(pollIdRaw.toUpperCase()) || pollStore.get(pollIdRaw.toLowerCase()))
        : null

    if (!storedPoll) {
        console.log(`[poll:vote] ⚠️ pollId "${pollIdRaw}" not found in pollStore (poll created before restart, or not this bot's poll)`)
        return
    }

    console.log('[poll:vote] ✅ Poll ditemukan:', storedPoll.question)
    console.log('[poll:vote] msg.message raw:', JSON.stringify(msg.message?.pollUpdateMessage))
    console.log('[poll:vote] authState keys:', Object.keys(sock.authState || {}))
    console.log('[poll:vote] creds keys:', Object.keys(sock.authState?.creds || {}))
    console.log('[poll:vote] msgFull.message keys:', Object.keys(storedPoll.msgFull?.message || {}))

    let selectedOptions = []
    try {
        const pollEncKey = storedPoll.pollEncKey
        const encPayload = msg.message?.pollUpdateMessage?.vote?.encPayload
        const encIv = msg.message?.pollUpdateMessage?.vote?.encIv
        const pollMsgId = storedPoll.pollCreationKey?.id
        const pollMsgSenderRaw = sock.user?.lid
        const pollMsgSender = pollMsgSenderRaw ? pollMsgSenderRaw.split(':')[0] + '@lid' : undefined
        const voteMsgSenderRaw = msg.key.participant || msg.key.remoteJid
        const voteMsgSender = voteMsgSenderRaw.split(':')[0]

        console.log('[poll:debug] ── BOT SENDING (when poll is created) ──')
        console.log('[poll:debug] storedPoll.from          =', storedPoll.from)
        console.log('[poll:debug] storedPoll.pollCreationKey =', JSON.stringify(storedPoll.pollCreationKey))
        console.log('[poll:debug] pollEncKey (hex)          =', pollEncKey?.toString('hex'))
        console.log('[poll:debug] pollEncKey length         =', pollEncKey?.length)
        console.log('[poll:debug] sock.user                =', JSON.stringify(sock.user))

        console.log('[poll:debug] ── WA RETURNING (when vote comes in) ──')
        console.log('[poll:debug] msg.key (full)            =', JSON.stringify(msg.key))
        console.log('[poll:debug] msg.key.remoteJid         =', msg.key.remoteJid)
        console.log('[poll:debug] msg.key.participant       =', msg.key.participant)
        console.log('[poll:debug] msg.key.fromMe            =', msg.key.fromMe)
        console.log('[poll:debug] pollUpdateMessage.pollCreationMessageKey =', JSON.stringify(msg.message?.pollUpdateMessage?.pollCreationMessageKey))
        console.log('[poll:debug] encPayload (b64)          =', encPayload)
        console.log('[poll:debug] encIv (b64)               =', encIv)
        console.log('[poll:debug] encPayload byte length    =', encPayload ? Buffer.from(encPayload, 'base64').length : null)
        console.log('[poll:debug] encIv byte length         =', encIv ? Buffer.from(encIv, 'base64').length : null)

        console.log('[poll:debug] ── PARAMETER YANG DIPAKAI UNTUK DERIVE KEY ──')
        console.log('[poll:debug] pollMsgSenderRaw =', pollMsgSenderRaw)
        console.log('[poll:debug] pollMsgSender    =', pollMsgSender)
        console.log('[poll:debug] voteMsgSenderRaw =', voteMsgSenderRaw)
        console.log('[poll:debug] voteMsgSender    =', voteMsgSender)

        if (pollEncKey && encPayload && encIv && pollMsgId) {
            const stanzaId = Buffer.from(pollMsgId)
            const parentMsgOriginalSender = Buffer.from(pollMsgSender)
            const modificationSender = Buffer.from(voteMsgSender)
            const modificationType = Buffer.from('Poll Vote')
            const pad = Buffer.from([1])
            const signMe = Buffer.concat([stanzaId, parentMsgOriginalSender, modificationSender, modificationType, pad])

            console.log('[poll:debug] signMe (hex)     =', signMe.toString('hex'))
            console.log('[poll:debug] signMe (utf8)    =', signMe.toString('utf8'))

            const temp = crypto.createHmac('sha256', Buffer.alloc(32)).update(pollEncKey).digest()
            const decryptionKey = crypto.createHmac('sha256', temp).update(signMe).digest()

            console.log('[poll:debug] temp (hex)           =', temp.toString('hex'))
            console.log('[poll:debug] decryptionKey (hex)  =', decryptionKey.toString('hex'))

            const additionalData = Buffer.from(`${pollMsgId}\u0000${voteMsgSender}`)
            const ivBuf = Buffer.from(encIv, 'base64')
            const fullPayloadBuf = Buffer.from(encPayload, 'base64')
            const authTag = fullPayloadBuf.subarray(fullPayloadBuf.length - 16)
            const payloadBuf = fullPayloadBuf.subarray(0, fullPayloadBuf.length - 16)

            console.log('[poll:debug] additionalData (hex) =', additionalData.toString('hex'))
            console.log('[poll:debug] additionalData (utf8) =', additionalData.toString('utf8'))
            console.log('[poll:debug] ivBuf (hex)          =', ivBuf.toString('hex'), 'len=', ivBuf.length)
            console.log('[poll:debug] authTag (hex)        =', authTag.toString('hex'), 'len=', authTag.length)
            console.log('[poll:debug] payloadBuf (hex)     =', payloadBuf.toString('hex'), 'len=', payloadBuf.length)

            const decipher = crypto.createDecipheriv('aes-256-gcm', decryptionKey, ivBuf)
            decipher.setAuthTag(authTag)
            decipher.setAAD(additionalData)
            const decrypted = Buffer.concat([decipher.update(payloadBuf), decipher.final()])

            const hexChars = decrypted.slice(2)
            const hashHex = hexChars.toString('hex').toUpperCase()
            const pollOptionHashes = hashHex.split('0A20').filter(Boolean)

            console.log('[poll:vote] decrypted hashes:', pollOptionHashes)

            selectedOptions = storedPoll.options.filter(opt => {
                const optHash = crypto.createHash('sha256').update(opt).digest('hex').toUpperCase()
                return pollOptionHashes.includes(optHash)
            })
        } else {
            console.log('[poll:vote] encKey/encPayload/encIv/pollMsgId incomplete')
        }
    } catch (e) {
        console.log('[poll:vote] decode error:', e?.message)
    }

    if (selectedOptions.length === 0) {
        console.log('[poll:vote] selectedOptions empty — user removed vote or decode failed')
        return
    }

    const voterJid = msg.key.participant || msg.key.remoteJid
    const chosen = selectedOptions[0]
    console.log(`[poll:vote] ${voterJid} memilih: "${chosen}" pada poll "${storedPoll.question}"`)

    await sock.sendMessage(storedPoll.from, {
        text: `📊 *${storedPoll.question}*\n\n@${voterJid.split('@')[0]} memilih: *${chosen}*`,
        mentions: [voterJid]
    })

    console.log('[poll:vote] ════════════════════════════════════')
}

module.exports = { pollStore, executePoll, handlePollVote }

