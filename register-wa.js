const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const readline = require('readline')
const qrcode = require('qrcode-terminal')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve))
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function connectToWA(usePairingCode, phoneNumber) {
    const { state, saveCreds } = await useMultiFileAuthState('./auth')

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    })

    sock.ev.on('creds.update', saveCreds)

    // Request pairing code after WS connects, wait 2 seconds
    if (usePairingCode && !sock.authState.creds.registered) {
        await sleep(2000)
        try {
            const number = phoneNumber.replace(/[^0-9]/g, '')
            const code = await sock.requestPairingCode(number)
            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
            console.log(`🔑 Pairing Code: ${code}`)
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
            console.log('Steps:')
            console.log('1. Open WhatsApp on your phone')
            console.log('2. Linked Devices > Link with phone number')
            console.log('3. Enter the code above\n')
        } catch(e) {
            console.log('❌ Failed to request pairing code:', e.message)
            rl.close()
            process.exit(1)
        }
    }

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

        if (!usePairingCode && qr) {
            console.log('\n📱 Scan the following QR Code with WhatsApp:\n')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode

            if (code === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Delete the auth folder and restart.')
                rl.close()
                process.exit(1)
            }

            // 515 = "restart required" — this is NORMAL after a successful pairing/QR scan.
            // WhatsApp asks the client to reconnect using the freshly saved credentials.
            // Auto-reconnect instead of exiting, so the user doesn't have to re-run this script.
            if (code === DisconnectReason.restartRequired) {
                console.log('🔄 Pairing confirmed, reconnecting automatically...')
                await connectToWA(usePairingCode, phoneNumber)
                return
            }

            console.log(`❌ Connection lost (code ${code}). Reconnecting...`)
            await connectToWA(usePairingCode, phoneNumber)
        }

        if (connection === 'open') {
            console.log('\n✅ Login successful! Bot is ready to run.')
            console.log('Run: node bot.js\n')
            rl.close()
            process.exit(0)
        }
    })
}

async function main() {
    console.log('\n🤖 WhatsApp Bot — Setup Login')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('1. Scan QR Code')
    console.log('2. Pairing Code (no camera)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const pilihan = await question('Choose login method (1/2): ')

    if (pilihan.trim() === '1') {
        console.log('\n⏳ Loading QR Code...')
        rl.close()
        await connectToWA(false, '')
    } else if (pilihan.trim() === '2') {
        const nomor = await question('Enter your WA number (example: 6281234567890): ')
        if (!nomor.trim()) {
            console.log('❌ Number cannot be empty!')
            rl.close()
            process.exit(1)
        }
        console.log('\n⏳ Connecting to WhatsApp, please wait...')
        rl.close()
        await connectToWA(true, nomor.trim())
    } else {
        console.log('❌ Invalid choice!')
        rl.close()
        process.exit(1)
    }
}

main()
