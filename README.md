# 🤖 WhatsApp AI Bot

A powerful, feature-rich WhatsApp bot built with **Baileys** and multi-provider AI support. Supports group management, media downloading, earthquake/weather info, AI chat, image generation, and much more, Indonesian Version Available: https://github.com/andiasriefail2004/WhatsApp-bot-ai

---

## ✨ Features

| Category | Features |
|---|---|
| 🤖 **AI & Chat** | Multi-provider AI chat, image generation, video generation, voice transcription |
| 🎨 **Media** | Sticker creator (image/video/text), GIF sender |
| 📥 **Downloader** | YouTube, TikTok, Instagram, Spotify, 1000+ platforms via yt-dlp |
| 🌍 **Info** | Real-time weather, Indonesia & worldwide earthquake data (BMKG + USGS) |
| ⏰ **Scheduler** | Cron jobs, reminders with timezone support |
| 🎮 **Games** | Poll, Quiz, Riddle |
| 📚 **Literature** | Random poems, short stories, rhymes |
| ✨ **Inspiration** | Motivations, fun facts, reflections, philosophical thoughts |
| 👥 **Group Admin** | 30+ group management commands |
| 👑 **Owner** | Broadcast, ban, stats, group control, and more |

---

## 🤖 AI Providers Supported

Configure one or more providers in `modules/ai.js` — you only need **one** working key. The bot tries each configured provider in order and falls back to the next automatically.

**Text / Chat:** Anthropic, Google, xAI, Groq, Mistral, Cerebras, OpenRouter, SambaNova, Cloudflare AI  
**Image Generation:** Hugging Face, Cloudflare AI  
**Audio Transcription:** Hugging Face

---

## 📋 Requirements

- **Node.js** v20 or higher
- **Python** 3.x
- **Termux** (Android) or any Linux environment

---

## 💡 Recommendations

None of these are strictly required, but they're strongly recommended for a more stable bot and to help you understand a bit more about how it works before you start setting it up.

### Use a WhatsApp Business number

It's recommended to use a number registered with the **WhatsApp Business** app, not regular WhatsApp, for your bot number. WhatsApp Business is built for this kind of automated/semi-automated use, and generally has somewhat more relaxed rate limits than a regular personal account — a good fit for a bot that replies to a lot of messages and runs many commands. It's also a good idea to keep your bot number separate from your personal number, so that if anything goes wrong on WhatsApp's side (rate limiting, a temporary ban, etc.), your personal account isn't affected.

### Tested Baileys version

This project has been tested and runs stably on **`@whiskeysockets/baileys` version `7.0.0-rc13`**. Since Baileys is a reverse-engineered library (unofficial, not from WhatsApp) that keeps changing to follow WhatsApp's protocol updates, the newest release isn't always automatically the most stable choice for this setup — it sometimes needs extra adjustments after a new release ships. If you want the closest match to this documentation (including the Error 401 troubleshooting section below, some of whose patches target specific line numbers in this version), pin to this version first:

```bash
npm install @whiskeysockets/baileys@7.0.0-rc13
```

If you'd rather try a newer version anyway, that's fine too — just be aware that some of the patches in the troubleshooting section may need their line numbers adjusted (since those patches use `sed` targeting specific lines of code).

### Per-user queue system — why it matters

The bot has a built-in queue system (`modules/queue.js`) that limits **each user to one heavy task running at a time** — whether that's making a sticker, downloading media, or generating an image/video/QR code. If you try to start a new task while a previous one hasn't finished, the bot will reject it and ask you to run `.cp` (or `.cdl` specifically for downloads) first before starting a new one.

This isn't a minor restriction — without it, many users triggering multiple `ffmpeg` processes (for stickers), downloads, or image generations at the same time could cause the bot's RAM usage to spike sharply and potentially crash, especially when the bot runs on a resource-constrained device like a phone through Termux. With this queue in place, heavy tasks are run in a more controlled, one-at-a-time manner per user, which keeps the bot's memory usage far more stable.

The owner is exempt from this restriction (owner commands always run immediately without queuing), so if you're the owner and want to test several processes at once, you still can.

---

## 🚀 Installation

### Step 1 — Install system packages

```bash
# Update packages
pkg update && pkg upgrade -y

# Install required packages
pkg install rust nodejs ffmpeg imagemagick python git -y
```

| Package | Used for |
|---|---|
| `rust` | Compiling `libsignal`, a native dependency of `@whiskeysockets/baileys` (installed in Step 4) — the bot cannot run without this |
| `nodejs` | Running the bot itself |
| `ffmpeg` | `.sticker` — converting images/videos into `.webp` stickers |
| `imagemagick` | `.textsticker` — generating stickers from text (uses the `convert` command) |
| `python` | Running `yt-dlp` and `spotdl` (installed in Step 2) |
| `git` | Cloning the repository (skip if you're copying files manually) |

### Step 2 — Install Python tools

```bash
pip install yt-dlp spotdl
```

| Package | Used for |
|---|---|
| `yt-dlp` | `.download`, `.ytmp3`, `.ytmp4`, `.tiktok` — downloading video/audio from YouTube, TikTok, and 1000+ other sites |
| `spotdl` | `.spotify` — downloading audio from Spotify links |

### Step 3 — Clone or copy the project

```bash
# If cloning from GitHub
git clone https://github.com/andiasriefail2004/WhatsApp-bot-ai-english.git
cd WhatsApp-bot-ai-english

# Or create folder manually
mkdir ~/bot && cd ~/bot
```

### Step 4 — Install Node.js packages

```bash
npm install @whiskeysockets/baileys node-cron qrcode-terminal qrcode jsqr jimp
```

Every package below is required — the bot will throw a `Cannot find module` error on startup if any is missing.

| Package | Used for |
|---|---|
| `@whiskeysockets/baileys` | The WhatsApp connection library itself — required for the bot to function at all |
| `node-cron` | `.cron`, `.reminder` — scheduled messages and reminders |
| `qrcode-terminal` | Displaying the login QR code directly in your terminal when running `register-wa.js` |
| `qrcode` | `.cqr` — generating QR code images |
| `jsqr` | `.sqr` — decoding/reading QR codes from images |
| `jimp` | Reading image pixel data for `.sqr`, **and** required by Baileys itself to generate image thumbnails (including for `.cqr` and stickers) — see the [image processing troubleshooting section](#-fix-images--qr-codes-fail-to-send-or-scan-no-image-processing-library) if you run into thumbnail errors |

> `sharp` is an alternative to `jimp` for the Baileys thumbnail requirement, and Baileys prefers it if both are installed. It's **not included above** because it needs a native `libvips` binary that has no prebuilt version for Android/Termux — installing it there usually fails to load at runtime. `jimp` is pure JavaScript and works everywhere, including Termux, so it's the safer default for this setup. If you're running the bot on a regular Linux server (not Termux), you can additionally install `sharp` for slightly better performance: `npm install sharp`.

### Step 5 — Configure the bot

There are **two files** you must edit before running the bot. Every value that needs to be replaced is written as a placeholder starting with `ENTER_` or `YOUR_` — search for those strings if you want to double-check you haven't missed one.

#### 5a. `bot.js` — required

```js
const OWNER_NUMBERS = ['62xxxxxxxxxx']   // Your WhatsApp number, digits only, no + sign
const BOT_NAME = 'Your Bot Name'         // Shown in the menu and bot replies
```

| Placeholder | What to put |
|---|---|
| `OWNER_NUMBERS` | Your own WhatsApp number(s), country code first, no `+`, no spaces (e.g. `6281234567890`). This controls who can use owner-only commands and see the hidden owner menu. |
| `BOT_NAME` | Any name you want the bot to go by. |

#### 5b. `modules/ai.js` — optional but recommended

This file lists several AI providers. You don't need to fill in all of them — **one working key is enough**. The bot tries each configured provider in order and automatically falls back to the next if one fails or hits a rate limit.

Each provider entry looks like this:

```js
{
    model: '...',
    keys: ['ENTER_..._KEY_1']   // ← replace this placeholder with your actual API key
}
```

Find the `keys: ['ENTER_...']` line for whichever provider(s) you have a key for, and replace the placeholder string with your real key. Leave the rest untouched — providers with a placeholder key are automatically skipped.

> If you skip this file entirely, the bot still runs — AI chat and image/video generation will just be unavailable. Every other command works normally regardless.

#### 5c. Weather — no configuration needed

`modules/weather.js` uses [Open-Meteo](https://open-meteo.com), a free public API that requires **no API key or sign-up**. There is nothing to edit in this file.

### Copying / updating files

If you downloaded individual files instead of cloning the whole repo (e.g. to update the bot after a fix, or when setting it up fresh on a phone via Termux), copy each file to its correct location. `bot.js` and `register-wa.js` go in the **project root** — everything else goes inside the **`modules/`** folder.

```bash
# Root files
cp /sdcard/Download/bot.js ~/bot.js
cp /sdcard/Download/register-wa.js ~/register-wa.js

# modules/ files
cp /sdcard/Download/ai.js ~/modules/ai.js
cp /sdcard/Download/downloader.js ~/modules/downloader.js
cp /sdcard/Download/earthquake.js ~/modules/earthquake.js
cp /sdcard/Download/group.js ~/modules/group.js
cp /sdcard/Download/groupStats.js ~/modules/groupStats.js
cp /sdcard/Download/inspiration.js ~/modules/inspiration.js
cp /sdcard/Download/interactive.js ~/modules/interactive.js
cp /sdcard/Download/literature.js ~/modules/literature.js
cp /sdcard/Download/owner.js ~/modules/owner.js
cp /sdcard/Download/poll.js ~/modules/poll.js
cp /sdcard/Download/qr.js ~/modules/qr.js
cp /sdcard/Download/queue.js ~/modules/queue.js
cp /sdcard/Download/quiz.js ~/modules/quiz.js
cp /sdcard/Download/sticker.js ~/modules/sticker.js
cp /sdcard/Download/weather.js ~/modules/weather.js
```

> Adjust `/sdcard/Download/` to wherever your downloaded files actually are — this is the default Downloads folder on Android/Termux. If you're only updating one or two files (e.g. after a bug fix), just run the relevant line(s) instead of the whole block.

> **Note:** `node bot.js` above only applies if you're **updating a bot that's already logged in** — restart it after copying the new files. If this is a **fresh install**, skip that and continue to Step 6 below; you need to log in first before `bot.js` will run.

### Step 6 — Login to WhatsApp

```bash
node register-wa.js
```

Choose your login method:
- **Option 1:** QR Code (scan with WhatsApp)
- **Option 2:** Pairing Code (enter on WhatsApp → Linked Devices)

After successful login, a folder `./auth/` will be created automatically containing your session files (~800+ files, this is normal).

### Step 7 — Run the bot

```bash
node bot.js
```

On startup, the bot checks whether it can generate image thumbnails correctly (needed for stickers, QR codes, and any image it sends). If something's wrong, it prints a warning with the exact fix — see [Fix: Images / QR codes fail to send or scan](#️-fix-images--qr-codes-fail-to-send-or-scan-no-image-processing-library) below.

---

## ⚠️ Fix Error 401 (Connection Failure)

If you see this error:
```
statusCode=401 reason=Connection Failure
lidDbMigrated: false
```

This is a known Baileys bug. Apply these patches:

```bash
# Patch 1: Fix passive connection
sed -i 's/passive: true,/passive: false,/g' \
  ~/node_modules/@whiskeysockets/baileys/lib/Utils/validate-connection.js

# Patch 2: Remove lidDbMigrated
sed -i '/lidDbMigrated: false/d' \
  ~/node_modules/@whiskeysockets/baileys/lib/Utils/validate-connection.js

# Patch 3: Fix noise init
sed -i 's/await noise\.finishInit();/noise.finishInit();/g' \
  ~/node_modules/@whiskeysockets/baileys/lib/Socket/socket.js
```

Then delete your auth session and login again:

```bash
rm -rf ~/auth
node register-wa.js
```

---

## ⚠️ Fix Error 401 (Stream Errored — conflict / device_removed)

```
statusCode=401 reason=Stream Errored (conflict)
type: device_removed
```

This means WhatsApp detected two sessions running at the same time (e.g. you opened WhatsApp on your phone while the bot was running, or ran the bot twice). Simply restart the bot:

```bash
node bot.js
```

---

## ⚠️ Fix: Images / QR codes fail to send or scan ("No image processing library")

If you send images from the bot (stickers, `.cqr` QR codes, etc.) and they don't scan properly or look broken, check your terminal log for this:

```
Error: No image processing library available
    at extractImageThumb (.../node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js:...)
```

**The bot detects this automatically** and prints a warning with the exact fix when it starts up. If you see the warning, follow it — or apply the fix manually below.

### Why this happens

Baileys needs either `sharp` or `jimp` installed to generate a thumbnail for every image it sends. Two separate problems commonly cause this to fail, especially on Android/Termux:

1. **`sharp` fails to load.** It needs a native `libvips` binary, and there's no prebuilt one for Android's `arm64` architecture. Installing it (`npm install sharp`) often succeeds, but *loading* it at runtime throws an error like `Could not load the "sharp" module using the android-arm64 runtime`.
2. **`jimp` is installed correctly, but Baileys still can't detect it.** Some Baileys versions (rc13 and earlier) contain a bug: they check `typeof Jimp === 'object'` to confirm jimp is available, but `Jimp` has always been exported as a class — `typeof` a class is `'function'`, never `'object'`. The check silently always fails, even with jimp working perfectly.

Baileys doesn't crash when this happens — the message still sends — but without a valid thumbnail, some clients (WhatsApp's own QR scanner included) will fail to read the image correctly.

### Fix

```bash
npm install jimp
```

Then check whether your installed Baileys has the bug:

```bash
sed -n '116p' node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js
```

If that line does **not** read exactly:
```js
    else if ('jimp' in lib && typeof lib.jimp?.Jimp === 'function') {
```

...patch it:

```bash
sed -i "116s/.*/    else if ('jimp' in lib \&\& typeof lib.jimp?.Jimp === 'function') {/" \
  node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js
```

Restart the bot afterwards. This patch is safe to run even if you're unsure whether it's needed — if the line already matches, the command simply makes no change.

> **Long-term fix:** newer Baileys releases may have this bug fixed already. Running `npm update @whiskeysockets/baileys` occasionally is worth doing — if the bug is gone upstream, the `sed` patch above becomes a no-op and stays harmless to run.

### Also check the QR code quiet zone

If images send fine (no thumbnail error) but a **generated QR code specifically** still won't scan, it's a separate, unrelated issue: the QR's quiet zone (the white border) may be too thin. This is already handled in `modules/qr.js` (`margin: 4`, matching the ISO/IEC 18004 minimum) — but if you've modified that file, don't set `margin` below `4` or WhatsApp's scanner (and some others) will reject the code even though it displays fine.

---

## 📁 Project Structure

```
bot/
├── bot.js                  # Main bot file
├── register-wa.js          # Login / session setup
├── auth/                   # Session files (auto-generated, DO NOT DELETE)
├── package.json
└── modules/
    ├── ai.js               # AI providers & image/video generation
    ├── downloader.js       # yt-dlp / spotdl wrapper
    ├── earthquake.js       # BMKG & USGS earthquake data
    ├── group.js            # Group admin commands
    ├── groupStats.js       # Group statistics
    ├── inspiration.js      # Motivation, fun facts, etc.
    ├── interactive.js      # Interactive messages (buttons, lists)
    ├── literature.js       # Poems, stories, rhymes
    ├── owner.js            # Owner commands
    ├── poll.js             # Poll creation & tracking
    ├── qr.js               # QR code generation & scanning
    ├── queue.js            # Download queue manager
    ├── quiz.js             # Quiz questions
    ├── sticker.js          # Sticker creator (ffmpeg + imagemagick)
    └── weather.js          # Open-Meteo integration (no API key needed)
```

---

## 💬 Commands

### 🤖 AI & Chat

AI chat works **without any command** — just send a message directly.

- **Private chat:** Type anything, the bot replies automatically.
- **Group chat:** Mention the bot (`@bot`) for it to respond.

| Command | Description |
|---|---|
| `.reset` | Reset AI chat history |
| `.imagine [description]` | Generate AI image |
| `.createimage [description]` | Generate AI image |
| `.createvideo [description]` | Generate AI video |

### 🎨 Media & Stickers

| Command | Description |
|---|---|
| `.sticker` / `.s` | Create sticker from image or video (reply to media) |
| `.textsticker [text]` / `.ts` | Create sticker from text |
| `.setgroupphoto` | Set group profile photo (reply to image, admin only) |
| `.cqr [data]` / `.createqr` | Generate a QR code (auto-detects URL, email, phone, WhatsApp contact, WiFi, location, or plain text — see [QR Code](#-qr-code) below) |
| `.sqr` / `.scanqr` | Scan a QR code (reply to an image, send an image with caption `.sqr`, or `.sqr [image url]`) |

### 🔲 QR Code

| Format | Example |
|---|---|
| URL | `.cqr https://example.com` |
| Email | `.cqr name@example.com` |
| Phone call | `.cqr 6281234567890` or `.cqr call:6281234567890` |
| WhatsApp contact | `.cqr wa 6281234567890` — scanning opens WhatsApp to add the contact / start a chat |
| Location | `.cqr -6.2,106.8` |
| WiFi | `.cqr wifi:ssid=MyNetwork;pass=secret123;type=WPA` |
| Contact (vCard) | Reply to a shared WhatsApp contact with `.cqr` |
| Plain text | Anything that doesn't match the patterns above |

A plain phone number by itself generates a QR that just dials the number. To generate a QR that opens WhatsApp instead (matching WhatsApp's own "Scan Code" feature), prefix it with `wa ` (with a space).

Scanning supports three input methods: replying to an image, sending an image directly with caption `.sqr`, or providing an image URL (`.sqr https://...`).

### 📥 Downloader

| Command | Description |
|---|---|
| `.download [url]` / `.dl` | Download video |
| `.mp3 [url]` | Download audio/music |
| `.ytmp3 [url]` | YouTube audio |
| `.ytmp4 [url]` | YouTube video |
| `.tiktok [url]` | TikTok video |
| `.spotify [url]` | Spotify audio |
| `.canceldownload` / `.cdl` | Cancel active download |
| `.cancelprocess` / `.cp` | Cancel active process |

### 🌍 Info & Weather

| Command | Description |
|---|---|
| `.weather [city]` | Real-time weather info |
| `.earthquakeid [city]` | Latest Indonesia earthquakes (BMKG) |
| `.earthquake [city/region]` | Latest worldwide earthquakes (USGS) |

### ⏰ Scheduler

| Command | Description |
|---|---|
| `.reminder [HH:MM] [TZ] [message]` | Set a reminder |
| `.cron [schedule] [message]` | Set a cron job |
| `.dreminder [number/all]` | Delete reminder(s) |
| `.dcron [number/all]` | Delete cron job(s) |
| `.settimezone [timezone]` | Set your timezone (e.g. `Asia/Jakarta`) |

### 🎮 Fun & Games

| Command | Description |
|---|---|
| `.poll [question]` | Create a poll — separate the question and options with pipe characters (see example below the table) |
| `.quiz [category]` | Play a quiz (categories: general, science, history, geo) |
| `.riddle` | Get a random riddle |
| `.answer` | Reveal riddle answer |

Example `.poll` format (question, then options, separated by pipes):

```
.poll What's for lunch?|Pizza|Sushi|Tacos
```

### 📚 Literature

| Command | Description |
|---|---|
| `.poem` | Random poem |
| `.story` | Random short story |
| `.rhyme` | Random rhyme |

### ✨ Inspiration

| Command | Description |
|---|---|
| `.motivation` | Random motivation quote |
| `.funfact` | Random fun fact |
| `.reflection` | Random reflection |
| `.philosophical` | Random philosophical thought |

### ℹ️ General

| Command | Description |
|---|---|
| `.menu` / `.help` | Show command list |
| `.myinfo` / `.whoami` | Show your JID & info |
| `.report [message]` | Report a user to owner (reply to their message) |

---

## 👥 Group Admin Commands

> These commands require you to be a **group admin**. The bot must also be an admin for most commands.

| Command | Description |
|---|---|
| `.kick @user` | Remove a member |
| `.add [number]` | Add a member |
| `.promote @user` | Promote to admin |
| `.demote @user` | Demote from admin |
| `.mute [hours]` | Lock group chat (admins only) |
| `.unmute` | Unlock group chat |
| `.lock` | Lock group settings |
| `.unlock` | Unlock group settings |
| `.tageveryone [msg]` / `.tagall` | Tag all members |
| `.groupinfo` | Show group info |
| `.gstats` | Group message statistics |
| `.groupname [name]` | Change group name |
| `.groupdesc [text]` | Change group description |
| `.setgroupphoto` | Set group photo (reply to image) |
| `.memberaddmode admin/all` | Control who can add members |
| `.ephemeral` | Toggle disappearing messages |
| `.grouplink` | Get group invite link |
| `.groupresetlink` | Reset group invite link |
| `.antilink on/off` | Toggle anti-link (auto-delete invite links) |
| `.welcome on/off` | Toggle welcome message |
| `.setwelcomemsg [text]` | Set custom welcome text |
| `.leave on/off` | Toggle leave message |
| `.setleavemsg [text]` | Set custom leave text |
| `.resetgreeting` | Reset welcome & leave text to default |
| `.filter on/off` | Toggle word filter |
| `.filteradd [word]` | Add word to filter |
| `.filterdel [word]` | Remove word from filter |
| `.filterlist` | View all filter words |
| `.filterclear` | Clear all filter words |
| `.warnreset @user` | Reset filter warning count |
| `.joinrequests` | View pending join requests |
| `.approve @user/all` | Approve join request(s) |
| `.reject @user/all` | Reject join request(s) |
| `.approvalmode on/off` | Toggle join approval |
| `.newcommunity [name]` | Create a community |
| `.linkgroup [communityJid]` | Link group to community |
| `.unlinkgroup` | Unlink group from community |

**Welcome/Leave placeholders:**
```
@user   → mentions the member
@group  → group name
@total  → total member count
@date   → date
@time   → time
```

---

## 👑 Owner Commands

> Only accessible by numbers listed in `OWNER_NUMBERS`.  
> These commands are **hidden from the public menu**.

| Command | Description |
|---|---|
| `.bc [message]` | Broadcast to all known users |
| `.gbc [message]` | Broadcast to all groups |
| `.send n- [numbers] t- [msg]` | Send message to specific numbers |
| `.stats` | Bot statistics |
| `.ban [number]` | Ban a user |
| `.unban [number]` | Unban a user |
| `.block [number]` | Block a number |
| `.unblock [number]` | Unblock a number |
| `.bio [number]` | View WhatsApp bio |
| `.pp [number]` | View profile photo |
| `.setbio [text]` | Set bot bio |
| `.setbotname [name]` | Set bot display name |
| `.businessinfo [number]` | View business profile |
| `.groups` | List all groups the bot is in |
| `.creategroup` | Create a group — separate the group name and number list with a pipe character (see example below the table) |
| `.joingroup [link]` | Join group via link |
| `.leavegroup` | Leave current group |
| `.leaveallgroups` | Leave all groups |
| `.leaveidle [n]` | Leave groups with fewer than n members |
| `.addme [groupJid]` | Add owner to a group |
| `.status [text]` | Post WhatsApp status |
| `.deletestatus` | Delete last posted status |
| `.maintain on/off` | Toggle maintenance mode |
| `.listgroups` | Detailed group list (paginated) |

Example `.creategroup` format (group name, then a pipe, then a comma-separated number list):

```
.creategroup Project Team | 6281234567890, 6289876543210
```

---

## 🔧 Configuration Reference

### `bot.js`

```js
const OWNER_NUMBERS = ['62xxxxxxxxxx']  // Owner number(s) — no + sign
const BOT_NAME = 'AI Bot'               // Bot display name in messages
```

### `modules/ai.js`

Each provider entry has the same shape — a `model` identifier and a `keys` array:

```js
const AI_PROVIDERS = {
    text: [
        { model: '...', keys: ['ENTER_..._KEY_1'] },
        { model: '...', keys: ['ENTER_..._KEY_1', 'ENTER_..._KEY_2'] },  // multiple keys = rotated if one gets rate-limited
        // more providers are pre-listed below this — fill in whichever ones you have keys for
    ],
    image: [
        { model: '...', keys: ['ENTER_..._KEY_1'] }
    ]
}
```

Replace only the `keys: ['ENTER_...']` placeholders for the provider(s) you want to use — leave `model` untouched. Providers with an unfilled placeholder key are automatically skipped, and the bot tries the remaining configured providers in order, falling back to the next one if a request fails or hits a rate limit.

### `modules/weather.js`

No configuration required — it calls Open-Meteo, a free public API with no key or sign-up.

---

## 🔑 Getting API Keys

You only need to sign up for the providers you actually want to enable in `modules/ai.js`. Free tiers are available from most of these — check each provider's site for current limits.

| Service | Where to get a key |
|---|---|
| Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| Google (Gemini) | [aistudio.google.com](https://aistudio.google.com) |
| xAI (Grok) | [console.x.ai](https://console.x.ai) |
| Groq | [console.groq.com](https://console.groq.com) |
| Mistral | [console.mistral.ai](https://console.mistral.ai) |
| Cerebras | [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| OpenRouter | [openrouter.ai](https://openrouter.ai) |
| SambaNova | [cloud.sambanova.ai](https://cloud.sambanova.ai) |
| Cloudflare AI | [dash.cloudflare.com](https://dash.cloudflare.com) |
| Hugging Face | [huggingface.co](https://huggingface.co) |

Weather does not require a key — see above.

---

## 📝 Notes

- The `./auth/` folder contains your session. **Do not delete it** or you will need to log in again.
- The bot supports **LID-based JIDs** (WhatsApp's new account format) for commands like `.myinfo`, `.whoami`, and `.report`.
- Earthquake data from `.earthquakeid` uses **BMKG** (Indonesia official source). `.earthquake` uses **USGS** (worldwide).
- Word filter auto-kicks members after **3 violations** by default (configurable in `modules/group.js`).
- The bot runs in **local mode** if no AI keys are configured — basic commands still work, just no AI chat.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

> Built with [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)
