'use strict'

const AI_PROVIDERS = {
    text: [
        {
            model: 'claude-sonnet-4-6',
            keys: [
                'ENTER_CLAUDE_KEY_1',
            ]
        },
        {
            model: 'gemini-2.5-flash',
            keys: [
                'ENTER_GEMINI_KEY_1',
                'ENTER_GEMINI_KEY_2',
            ]
        },
        {
            model: 'grok-4.3-latest',
            keys: [
                'ENTER_GROK_KEY_1',
            ]
        },
        {
            model: 'gpt-oss-120b',
            keys: [
                'ENTER_CEREBRAS_KEY_1',
            ]
        },
        {
            model: 'meta-llama/llama-4-maverick:free',
            keys: [
                'ENTER_OPENROUTER_KEY_1',
            ]
        },
        {
            model: 'Meta-Llama-3.3-70B-Instruct',
            keys: [
                'ENTER_SAMBANOVA_KEY_1',
            ]
        },
        {

            model: '@cf/meta/llama-4-scout-17b-16e-instruct',
            keys: [
                'ENTER_CF_ACCOUNT_ID:ENTER_CF_API_TOKEN',
            ]
        },
        {
            model: 'llama-3.3-70b-versatile',
            keys: [
                'ENTER_GROQ_KEY_1',
            ]
        },
        {
            model: 'mistral-small-latest',
            keys: [
                'ENTER_MISTRAL_KEY_1',
            ]
        },

    ],
    image: [
        {
            model: 'black-forest-labs/FLUX.1-schnell',
            keys: [
                'ENTER_HF_KEY_1',
            ]
        },
        {

            model: '@cf/black-forest-labs/flux-1-schnell',
            keys: [
                'ENTER_CF_ACCOUNT_ID:ENTER_CF_API_TOKEN',
            ]
        },

    ],
    video: [

    ],
    audio: [
        {
            model: 'openai/whisper-large-v3',
            keys: [
                'ENTER_HF_KEY_1',
            ]
        },
    ],
}

const TOOL_DEFINITIONS_BASE = [
    { name: 'make_sticker',        desc: 'Create a sticker from a replied or sent image',                               params: {} },
    { name: 'make_text_sticker',   desc: 'Create a sticker with text',                                                  params: { text: { type: 'string', desc: 'Text to convert into a sticker' } }, required: ['text'] },
    { name: 'show_menu',           desc: 'Show the bot menu and feature list',                                          params: {} },
    { name: 'send_poll',           desc: 'Create and send a poll',                                                      params: { question: { type: 'string', desc: 'Poll question' }, options: { type: 'array', desc: 'Answer options, minimum 2 maximum 12' } }, required: ['question', 'options'] },
    { name: 'forward_message',     desc: 'Forward a message to the user',                                               params: { text: { type: 'string', desc: 'Text to forward' } }, required: ['text'] },
    { name: 'react_message',       desc: 'React to a user message with an emoji',                                       params: { emoji: { type: 'string', desc: 'Reaction emoji' }, reply: { type: 'string', desc: 'Optional reply text' } }, required: ['emoji'] },
    { name: 'edit_message',        desc: 'Edit the previous bot message',                                               params: { new_text: { type: 'string', desc: 'New replacement text' } }, required: ['new_text'] },
    { name: 'delete_message',      desc: 'Delete the previous bot message',                                             params: {} },
    { name: 'send_gif',            desc: 'Send an animated GIF via public mp4 URL',                                     params: { url: { type: 'string', desc: 'mp4 GIF URL' }, caption: { type: 'string', desc: 'GIF caption' } }, required: ['url', 'caption'] },
    { name: 'search_web',          desc: 'Search for the latest information on the internet',                                          params: { query: { type: 'string', desc: 'Search keywords' } }, required: ['query'] },
    { name: 'get_weather',         desc: 'Get real-time weather data for a city or location',                           params: { city: { type: 'string', desc: 'City or location name' } }, required: ['city'] },
    { name: 'download_media',      desc: 'Download video or audio from a URL on platforms like YouTube, TikTok, etc.',   params: { url: { type: 'string', desc: 'Media URL' }, type: { type: 'string', desc: 'Type: video or audio' } }, required: ['url'] },
    { name: 'get_earthquake',      desc: 'Get the latest earthquake data from BMKG Indonesia. Can filter by region/province, or show the 10 latest national earthquakes if no region is specified.', params: { region: { type: 'string', desc: 'Region or province name to check. DO NOT fill with words like "latest", "recent", "now" — those are not region names, leave this parameter empty for such requests.' } } },
    { name: 'get_earthquake_global', desc: 'Get the latest earthquake data from USGS (international source, covering the whole world including countries other than Indonesia). Use this, NOT get_earthquake, if the user asks about earthquakes in another country (e.g. Japan, China, Philippines, America) or global earthquakes in general. Can filter by country/city/region name, or show the latest world earthquakes if no region is specified.', params: { region: { type: 'string', desc: 'Country, city, or region name to check (e.g. "japan", "california"). DO NOT fill with words like "latest", "recent", "now" — leave this parameter empty for such requests.' } } },
    { name: 'clear_history',       desc: 'Clear the conversation/chat history between the user and this bot (AI memory). Use when the user asks to "clear conversation", "clear chat", "clear history", "forget the conversation", or similar.', params: {} },
    { name: 'create_qr_code',      desc: 'Generate a QR code image for the user from text, a URL, an email address, a phone number, a WiFi network, or GPS coordinates. Use when the user asks to "create a QR code", "make a QR", "generate QR for...", or similar.', params: { data: { type: 'string', desc: 'The raw content to encode. For WiFi use the format: wifi:ssid=NAME;pass=PASSWORD;type=WPA (type defaults to WPA, pass is optional for open networks). For location use: latitude,longitude. Otherwise pass the URL, email, phone number, or plain text as-is — do not add any URI prefix yourself.' } }, required: ['data'] },
    { name: 'scan_qr_code',        desc: 'Scan and decode a QR code from an image the user just sent or replied to in this message. Use when the user asks to "scan this QR", "read this QR code", "what does this QR say", or similar, AND an image is attached to the current message. Do NOT use this if no image is present in the current message — ask the user to send or reply to a QR image first instead.', params: {} },
    { name: 'delete_status',       desc: 'Called when the user (not the owner) asks to delete a recently posted WhatsApp status. This feature is NOT supported — this function only triggers a clear rejection message to the user.', params: {} },
]

const TOOL_DEFINITION_GENERATE_IMAGE = {
    name: 'generate_image',
    desc: 'Generate an image from a text description (text-to-image AI)',
    params: { prompt: { type: 'string', desc: 'Description of the image to generate in English' } },
    required: ['prompt'],
}

const TOOL_DEFINITION_GENERATE_VIDEO = {
    name: 'generate_video',
    desc: 'Generate a video from a text description (text-to-video AI)',
    params: { prompt: { type: 'string', desc: 'Description of the video to generate in English' } },
    required: ['prompt'],
}

function buildActiveToolDefinitions() {
    const tools = [...TOOL_DEFINITIONS_BASE]
    if (getValidProviders('image') !== null) tools.push(TOOL_DEFINITION_GENERATE_IMAGE)
    if (getValidProviders('video') !== null) tools.push(TOOL_DEFINITION_GENERATE_VIDEO)
    return tools
}

function buildSystemPrompt(botName, extraContext = '') {
    const hasImage = getValidProviders('image') !== null
    const hasVideo = getValidProviders('video') !== null

    const imageCapability = hasImage
        ? '- Generate images from text descriptions via generate_image'
        : ''
    const videoCapability = hasVideo
        ? '- Generate videos from text descriptions via generate_video'
        : ''
    const imageRule = hasImage
        ? `
generate_image rules:
- Use generate_image if the user requests creating an image, illustration, or photo from a description
- Translate the prompt to descriptive English before sending to the tool
- Do not use for searching images from the internet`
        : ''
    const videoRule = hasVideo
        ? `
generate_video rules:
- Use generate_video if the user requests creating a video from a description
- Translate the prompt to descriptive English before sending to the tool`
        : ''

    return `You are ${botName}, a smart and versatile WhatsApp assistant.
Reply in the same language as the user (Indonesian or English).

Your capabilities:
- Smart and contextual AI chat
- Analyse images, videos, documents
- Create stickers from images or text
- Create polls
- Transcribe voice notes
- Summarise content from URLs sent by the user
- Search for the latest information on the internet via search_web
- Check real-time weather via get_weather
- Check the latest Indonesian earthquakes via get_earthquake, and global earthquakes via get_earthquake_global
- Download video/audio from 1000+ platforms via download_media
- Generate QR codes via create_qr_code
- Scan QR codes from images via scan_qr_code
- React to messages based on mood
- Edit or delete your own messages${imageCapability ? '\n- ' + imageCapability.trim() : ''}${videoCapability ? '\n- ' + videoCapability.trim() : ''}

clear_history rules:
- "Clear conversation" / "clear chat" / "clear history" / "forget everything" → the user wants to delete the MEMORY/HISTORY of the chat. Use clear_history for this.
- clear_history does NOT delete WhatsApp messages themselves (you cannot delete other people's WhatsApp messages, only your own via delete_message).
- After calling clear_history, DO NOT discuss or remember any topics from before the deletion, even if the user asks about them again afterward.

create_qr_code rules:
- Pass the data exactly as the user provided it (URL, email, plain text) — do not add mailto: or other URI prefixes yourself, the tool handles that automatically.
- For phone numbers: by default, a plain number (e.g. 6281234567890) generates a QR that dials the number when scanned. If the user wants a QR that opens WhatsApp to add the contact or start a chat (e.g. "make a QR for my WhatsApp", "QR to add me on WhatsApp"), prefix it with "wa " (with a space) e.g. wa 6281234567890
- For WiFi requests, build the data param as: wifi:ssid=NAME;pass=PASSWORD;type=WPA — ask the user for SSID and password first if they weren't provided.
- For location/coordinates requests, build the data param as: latitude,longitude
- This tool cannot scan or decode an existing QR code from an image — use scan_qr_code for that instead.

scan_qr_code rules:
- Only use this if the current message has an image attached (the user sent a photo or replied to one). If there is no image in this message, do not call this tool — ask the user to send or reply to the QR image instead.
- This tool only decodes — it cannot generate a QR code. Use create_qr_code for generation requests.

download_media rules:
- Use download_media if the user requests to download, save, or send a media file
- If the user mentions "the music", "the audio", "the song" → type: "audio"
- If the user mentions "the video", "the reels", "the tiktok" → type: "video"
- If unclear → type: "video" as default
- Spotify is ALWAYS type: "audio"
- Do not use download_media if the user only wants to summarise or analyse URL content
- DO NOT call download_media if the URL is an IP address (e.g. 192.168.x.x, 10.x.x.x, 127.0.0.1) or hostnames like "localhost"/"local". Simply reply that the URL cannot be downloaded — DO NOT call the tool.
- The above rule ONLY applies to download_media. If the user is discussing an IP or localhost in another context (debugging, coding, testing a server, etc.), that is not a download request and can be helped normally.

Weather rules:
- Use get_weather ONLY if the user specifically asks about the weather in a place
- If the user asks about the weather here without location data, ask them to share their location

Earthquake rules:
- get_earthquake (BMKG) for earthquakes in Indonesia or Indonesian regions/provinces
- get_earthquake_global (USGS) for earthquakes in other countries (Japan, China, Philippines, America, etc.) or global earthquakes
- If the user doesn't mention any location and context is unclear, assume Indonesia → use get_earthquake
${imageRule}${videoRule}
react_message rules:
- Use react_message ONLY as an additional/supplementary response, NOT as the primary response
- DO NOT use react_message when receiving images, videos, audio, or documents — always reply with a text description/analysis
- react_message may only be used for short text messages that genuinely only need an emotional reaction (e.g. user says "thanks")

General rules:
- Don't show the menu unless asked
- Respect masked data
- Use search_web for current news, prices, or real-time info

${extraContext ? 'Additional context:\n' + extraContext : ''}`
}

function detectProvider(model) {
    if (!model) return 'unknown'
    const m = model.toLowerCase()
    if (m.startsWith('claude'))                                         return 'claude'
    if (m.startsWith('gemini'))                                         return 'gemini'
    if (m.startsWith('grok'))                                           return 'grok'
    if (m.startsWith('@cf/'))                                           return 'cloudflare'
    if (m.startsWith('gpt-oss'))                                        return 'cerebras'
    if (m.startsWith('meta-llama-') && /^meta-llama-\d/.test(m))        return 'sambanova'
    if (m.includes('/') && m.endsWith(':free'))                         return 'openrouter'
    if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai'
    if (m.startsWith('deepseek'))                                          return 'deepseek'
    if (m.startsWith('llama') || m.startsWith('mixtral') || m.startsWith('meta-llama') || m.startsWith('qwen') || m.startsWith('gemma')) return 'groq'
    if (m.startsWith('mistral') || m.startsWith('codestral') || m.startsWith('magistral') || m.startsWith('devstral') || m.startsWith('pixtral')) return 'mistral'
    if (m.startsWith('cerebras'))                                          return 'cerebras'
    if (m.includes('/') && !m.startsWith('black-forest') && !m.startsWith('openai/')) return 'openrouter'
    if (m.includes('/'))                                                return 'huggingface'
    return 'openai'
}

function getEndpoint(provider, model) {
    switch (provider) {
        case 'claude':      return 'https://api.anthropic.com/v1/messages'
        case 'gemini':      return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
        case 'grok':        return 'https://api.x.ai/v1/chat/completions'
        case 'groq':        return 'https://api.groq.com/openai/v1/chat/completions'
        case 'mistral':     return 'https://api.mistral.ai/v1/chat/completions'
        case 'deepseek':    return 'https://api.deepseek.com/v1/chat/completions'
        case 'cerebras':    return 'https://api.cerebras.ai/v1/chat/completions'
        case 'openrouter':  return 'https://openrouter.ai/api/v1/chat/completions'
        case 'sambanova':   return 'https://api.sambanova.ai/v1/chat/completions'
        case 'cloudflare':  return null
        case 'openai':      return 'https://api.openai.com/v1/chat/completions'
        case 'huggingface': return `https://api-inference.huggingface.co/models/${model}`
        default:            return 'https://api.openai.com/v1/chat/completions'
    }
}

function buildGeminiTools() {
    const activeTools = buildActiveToolDefinitions()
    return [{
        functionDeclarations: activeTools.map(t => {
            const props = {}
            for (const [k, v] of Object.entries(t.params || {})) {
                props[k] = {
                    type: v.type === 'array' ? 'ARRAY' : 'STRING',
                    description: v.desc,
                    ...(v.type === 'array' ? { items: { type: 'STRING' } } : {})
                }
            }
            return {
                name: t.name,
                description: t.desc,
                parameters: { type: 'OBJECT', properties: props, required: t.required || [] }
            }
        })
    }]
}

function buildClaudeTools() {
    const activeTools = buildActiveToolDefinitions()
    return activeTools.map(t => {
        const props = {}
        for (const [k, v] of Object.entries(t.params || {})) {
            props[k] = {
                type: v.type === 'array' ? 'array' : 'string',
                description: v.desc,
                ...(v.type === 'array' ? { items: { type: 'string' } } : {})
            }
        }
        return {
            name: t.name,
            description: t.desc,
            input_schema: { type: 'object', properties: props, required: t.required || [] }
        }
    })
}

function buildOpenAITools() {
    const activeTools = buildActiveToolDefinitions()
    return activeTools.map(t => {
        const props = {}
        for (const [k, v] of Object.entries(t.params || {})) {
            props[k] = {
                type: v.type === 'array' ? 'array' : 'string',
                description: v.desc,
                ...(v.type === 'array' ? { items: { type: 'string' } } : {})
            }
        }
        return {
            type: 'function',
            function: {
                name: t.name,
                description: t.desc,
                parameters: { type: 'object', properties: props, required: t.required || [] }
            }
        }
    })
}

function convertHistoryForProvider(history, provider) {
    if (provider === 'gemini') return history

    return history.map(h => ({
        role: h.role === 'model' ? 'assistant' : h.role,
        content: Array.isArray(h.parts) ? (h.parts[0]?.text || '') : (h.content || '')
    }))
}

const userHistory = {}
const userHistoryOrder = []
const MAX_HISTORY_USERS = 500

function touchHistoryOrder(jid) {
    const idx = userHistoryOrder.indexOf(jid)
    if (idx !== -1) userHistoryOrder.splice(idx, 1)
    userHistoryOrder.push(jid)
}

function evictOldestHistoryIfNeeded() {
    while (userHistoryOrder.length > MAX_HISTORY_USERS) {
        const oldest = userHistoryOrder.shift()
        delete userHistory[oldest]
    }
}

function getHistory(jid) {
    if (!userHistory[jid]) userHistory[jid] = []
    touchHistoryOrder(jid)
    return userHistory[jid]
}

function addHistory(jid, role, text) {
    if (!userHistory[jid]) userHistory[jid] = []

    userHistory[jid].push({ role, parts: [{ text }] })
    if (userHistory[jid].length > 20) {
        userHistory[jid] = userHistory[jid].slice(-20)
    }
    touchHistoryOrder(jid)
    evictOldestHistoryIfNeeded()
}

function clearHistory(jid) {
    userHistory[jid] = []
    touchHistoryOrder(jid)
}

function maskSensitiveData(text) {
    if (!text) return text

    text = text.replace(/(\+?62|0)[\s-]?8[0-9]{8,11}/g, m => {
        const d = m.replace(/[\s-]/g, '')
        return d.slice(0,4) + d.slice(4,-1).replace(/[0-9]/g,'x') + d.slice(-1)
    })

    text = text.replace(/[a-zA-Z0-9._%+\-]+@(?:[a-zA-Z0-9.\-]+\.)+[a-zA-Z]{2,}/g, m => {
        const [local, domain] = m.split('@')
        return local.slice(0,2) + local.slice(2).replace(/[a-zA-Z0-9]/g,'x') + '@' + domain
    })

    text = text.replace(/-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/g, '[LOCATION_HIDDEN]')
    text = text.replace(/https?:\/\/(maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl)[^\s]*/g, '[MAPS_LINK_HIDDEN]')

    text = text.replace(/\b([0-9]{6})[0-9]{6}([0-9]{4})\b/g, '$1xxxxxx$2')

    text = text.replace(/\b([0-9]{3})[0-9]{5,10}([0-9]{2})\b/g, m => {
        if (m.length < 10 || m.length > 16) return m
        return m.slice(0,3) + 'x'.repeat(m.length-5) + m.slice(-2)
    })

    text = text.replace(/\b([0-9]{4})[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?([0-9]{4})\b/g, '$1-xxxx-xxxx-$2')

    text = text.replace(/(password|sandi|pin|passwd|secret)\s*[:=]\s*\S+/gi, '$1: [HIDDEN]')
    text = text.replace(/(kode|otp|token|verifikasi|verification)\s*[:=]?\s*([0-9]{4,8})\b/gi, '$1: [CODE_HIDDEN]')
    return text
}

function buildGeminiRequest(key, model, history, text, mediaBase64, mediaMime, botName, extraContext) {
    const parts = []
    if (mediaBase64 && mediaMime) parts.push({ inline_data: { mime_type: mediaMime, data: mediaBase64 } })
    if (text) parts.push({ text: maskSensitiveData(text) })

    return {
        url: `${getEndpoint('gemini', model)}?key=${key}`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [...history, { role: 'user', parts }],
            tools: buildGeminiTools(),
            systemInstruction: { parts: [{ text: buildSystemPrompt(botName, extraContext) }] }
        })
    }
}

function buildClaudeRequest(key, model, history, text, mediaBase64, mediaMime, botName, extraContext) {

    const convertedHistory = history.map(h => ({
        role: h.role === 'model' ? 'assistant' : h.role,
        content: Array.isArray(h.parts) ? (h.parts[0]?.text || '') : (h.content || '')
    }))

    const userContent = []
    if (mediaBase64 && mediaMime && mediaMime.startsWith('image/')) {
        userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaMime, data: mediaBase64 } })
    }
    if (text) userContent.push({ type: 'text', text: maskSensitiveData(text) })

    const messages = [
        ...convertedHistory,
        { role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent }
    ]

    return {
        url: getEndpoint('claude', model),
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: buildSystemPrompt(botName, extraContext),
            messages,
            tools: buildClaudeTools(),
        })
    }
}

function buildOpenAICompatRequest(key, model, provider, history, text, mediaBase64, mediaMime, botName, extraContext) {
    const convertedHistory = convertHistoryForProvider(history, provider)
    const userContent = []

    if (mediaBase64 && mediaMime && mediaMime.startsWith('image/')) {
        userContent.push({ type: 'image_url', image_url: { url: `data:${mediaMime};base64,${mediaBase64}` } })
    }
    if (text) userContent.push({ type: 'text', text: maskSensitiveData(text) })

    const messages = [
        { role: 'system', content: buildSystemPrompt(botName, extraContext) },
        ...convertedHistory,
        { role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent }
    ]

    return {
        url: getEndpoint(provider, model),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
            model,
            messages,
            tools: buildOpenAITools(),
            tool_choice: 'auto',
            max_tokens: 1024,
            temperature: 0.7
        })
    }
}

function buildCloudflareRequest(key, model, history, text, mediaBase64, mediaMime, botName, extraContext) {
    const sep = key.indexOf(':')
    const accountId = sep === -1 ? '' : key.slice(0, sep)
    const apiToken = sep === -1 ? key : key.slice(sep + 1)

    const reqData = buildOpenAICompatRequest(apiToken, model, 'cloudflare', history, text, mediaBase64, mediaMime, botName, extraContext)
    reqData.url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`
    return reqData
}

function parseGeminiResponse(data) {
    if (data.error) return { error: true, code: data.error.code, message: data.error.message }
    if (!data.candidates || !data.candidates.length) return { error: true, message: 'No candidates' }
    const candidate = data.candidates[0]
    if (!candidate.content?.parts) return { error: true, message: 'No content parts' }

    const parts = candidate.content.parts
    const funcCall = parts.find(p => p.functionCall)
    if (funcCall) {
        return { type: 'function', name: funcCall.functionCall.name, args: funcCall.functionCall.args || {} }
    }
    const textPart = parts.find(p => p.text)
    return { type: 'text', text: textPart?.text || 'No response' }
}

function parseClaudeResponse(data) {
    if (data.error) return { error: true, code: data.error.type, message: data.error.message }
    if (!data.content || !data.content.length) return { error: true, message: 'No content in response' }

    const toolUse = data.content.find(b => b.type === 'tool_use')
    if (toolUse) {
        return { type: 'function', name: toolUse.name, args: toolUse.input || {} }
    }
    const textBlock = data.content.find(b => b.type === 'text')
    let content = textBlock?.text || 'No response'

    content = content.replace(/<\/?function[^>]*>/gi, '').replace(/<\/?tool_call[^>]*>/gi, '').trim()
    if (!content) content = 'No response'
    return { type: 'text', text: content }
}

function parseOpenAICompatResponse(data) {
    if (data.error) return { error: true, code: data.error.code || data.error.type, message: data.error.message }
    const choice = data.choices?.[0]
    if (!choice) return { error: true, message: 'No choices in response' }

    const msg = choice.message
    if (msg.tool_calls?.length) {
        const tc = msg.tool_calls[0]
        let args = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch(e) {}
        return { type: 'function', name: tc.function.name, args }
    }

    let content = msg.content || 'No response'
    content = content.replace(/<\/?function[^>]*>/gi, '').replace(/<\/?tool_call[^>]*>/gi, '').trim()
    if (!content) content = 'No response'
    return { type: 'text', text: content }
}

const PLACEHOLDER_MODELS   = ['Enter Model ID']
const PLACEHOLDER_KEYS     = ['Enter API Key']
const PLACEHOLDER_PREFIXES = ['ENTER_']

function isPlaceholderModel(model) {
    if (!model || !model.trim()) return true
    return PLACEHOLDER_MODELS.includes(model.trim())
}

function isPlaceholderKey(key) {
    if (!key || key.length <= 10) return true
    if (PLACEHOLDER_KEYS.includes(key.trim())) return true
    if (PLACEHOLDER_PREFIXES.some(p => key.startsWith(p))) return true
    return false
}

const _providerCache = {}
function getValidProviders(category) {
    if (category in _providerCache) return _providerCache[category]
    const list = AI_PROVIDERS[category] || []
    const valid = list.filter(p =>
        !isPlaceholderModel(p.model) &&
        p.keys && p.keys.some(k => !isPlaceholderKey(k))
    )
    const result = valid.length > 0 ? valid : null
    _providerCache[category] = result
    if (result === null) {
        console.log(`⚠️  [AI:${category}] Model/key is still placeholder or empty → feature disabled`)
    } else {
        console.log(`✅ [AI:${category}] ${result.length} valid provider(s) found`)
    }
    return result
}

function hasValidKeys() { return getValidProviders('text') !== null }

function log(level, provider, model, msg, extra = '') {
    const ts = new Date().toISOString().slice(11,19)
    const tag = `[${ts}][AI:${provider}/${model}]`
    if (level === 'info')  console.log(`ℹ️  ${tag} ${msg}${extra ? ' | ' + extra : ''}`)
    if (level === 'ok')    console.log(`✅ ${tag} ${msg}${extra ? ' | ' + extra : ''}`)
    if (level === 'warn')  console.warn(`⚠️  ${tag} ${msg}${extra ? ' | ' + extra : ''}`)
    if (level === 'error') console.error(`❌ ${tag} ${msg}${extra ? ' | ' + extra : ''}`)
    if (level === 'skip')  console.log(`⏭️  ${tag} ${msg}${extra ? ' | ' + extra : ''}`)
}

async function callAI(jid, text, mediaBase64 = null, mediaMime = null, extraContext = '', botName = 'AI Bot') {
    const validProviders = getValidProviders('text')

    if (validProviders === null) {
        return null
    }

    const history = getHistory(jid)

    for (const provider of validProviders) {
        const { model, keys } = provider
        const providerName = detectProvider(model)

        for (const key of keys) {
            if (!key || key.length <= 10 || key.startsWith('ENTER_') || key === 'Enter API Key') {
                log('skip', providerName, model, `Invalid key, skipping`)
                continue
            }

            log('info', providerName, model, `Attempting request...`, `jid=${jid.split('@')[0]}`)

            try {
                let reqData
                if (providerName === 'gemini') {
                    reqData = buildGeminiRequest(key, model, history, text, mediaBase64, mediaMime, botName, extraContext)
                } else if (providerName === 'claude') {
                    reqData = buildClaudeRequest(key, model, history, text, mediaBase64, mediaMime, botName, extraContext)
                } else if (providerName === 'cloudflare') {
                    reqData = buildCloudflareRequest(key, model, history, text, mediaBase64, mediaMime, botName, extraContext)
                } else {
                    reqData = buildOpenAICompatRequest(key, model, providerName, history, text, mediaBase64, mediaMime, botName, extraContext)
                }

                const res = await fetch(reqData.url, {
                    method: 'POST',
                    headers: reqData.headers,
                    body: reqData.body,
                    signal: AbortSignal.timeout(providerName === 'gemini' ? 10000 : 8000)
                })

                const data = await res.json()

                const parsed = providerName === 'gemini'
                    ? parseGeminiResponse(data)
                    : providerName === 'claude'
                        ? parseClaudeResponse(data)
                        : parseOpenAICompatResponse(data)

                if (parsed.error) {
                    const code = parsed.code

                    if (code === 429 || code === 503 || code === 'rate_limit_exceeded' || code === 'server_error' || code === 'rate_limit_error' || code === 'overloaded_error' || code === 'api_error') {
                        log('warn', providerName, model, `Rate limit / server error, trying next`, `code=${code} httpStatus=${res.status}`)
                        continue
                    }

                    log('error', providerName, model, `API error`, `code=${code} msg=${parsed.message} httpStatus=${res.status}`)
                    continue
                }

                log('ok', providerName, model, `Response received`, `type=${parsed.type}${parsed.name ? ' fn=' + parsed.name : ''}`)

                if (parsed.type === 'text') {
                    addHistory(jid, 'user', maskSensitiveData(text) || '[media]')
                    addHistory(jid, 'model', parsed.text)
                }

                return parsed

            } catch (e) {
                if (e.name === 'TimeoutError' || e.name === 'AbortError') {
                    log('warn', providerName, model, `Timeout (15s), trying next`)
                } else if (e.message?.includes('fetch')) {
                    log('warn', providerName, model, `Network error, trying next`, e.message)
                } else {
                    log('error', providerName, model, `Unexpected exception`, e.message)
                }
                continue
            }
        }

        log('skip', providerName, model, `All keys failed, moving to next provider`)
    }

    console.error('❌ [AI] All text providers failed. Falling back to local bot.')
    return null
}

async function generateImage(prompt, externalSignal = null) {
    const validProviders = getValidProviders('image')

    if (validProviders === null) {
        console.warn('⚠️  [AI:image] No image provider configured. Image generation feature disabled.')
        return null
    }

    for (const provider of validProviders) {
        const { model, keys } = provider
        const isCloudflare = model.startsWith('@cf/')
        const providerLabel = isCloudflare ? 'cloudflare' : 'huggingface'

        for (const key of keys) {
            if (!key || key.length <= 10 || key.startsWith('ENTER_') || key === 'Enter API Key') {
                log('skip', providerLabel, model, `Invalid key, skipping`)
                continue
            }

            log('info', providerLabel, model, `Generating image...`, `prompt="${prompt.slice(0,40)}..."`)

            try {

                const timeoutSignal = AbortSignal.timeout(30000)
                const signal = externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal

                if (isCloudflare) {

                    const sep = key.indexOf(':')
                    const accountId = sep === -1 ? '' : key.slice(0, sep)
                    const apiToken = sep === -1 ? key : key.slice(sep + 1)

                    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ prompt }),
                        signal
                    })

                    if (!res.ok) {
                        const errText = await res.text()
                        log('warn', providerLabel, model, `HTTP ${res.status}, trying next`, errText.slice(0,100))
                        continue
                    }

                    const data = await res.json()
                    if (!data.success || !data.result?.image) {
                        log('warn', providerLabel, model, `Invalid response, trying next`, JSON.stringify(data.errors || data).slice(0,150))
                        continue
                    }

                    const buffer = Buffer.from(data.result.image, 'base64')
                    log('ok', providerLabel, model, `Image generated successfully`, `size=${(buffer.length/1024).toFixed(1)}KB`)
                    return buffer
                }

                const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ inputs: prompt }),
                    signal
                })

                if (!res.ok) {
                    const errText = await res.text()
                    log('warn', providerLabel, model, `HTTP ${res.status}, trying next`, errText.slice(0,100))
                    continue
                }

                const buffer = Buffer.from(await res.arrayBuffer())
                log('ok', providerLabel, model, `Image generated successfully`, `size=${(buffer.length/1024).toFixed(1)}KB`)
                return buffer

            } catch (e) {
                if (e.name === 'TimeoutError' || e.name === 'AbortError') {
                    log('warn', providerLabel, model, `Timeout (30s), trying next`)
                } else {
                    log('error', providerLabel, model, `Exception`, e.message)
                }
                continue
            }
        }
    }

    console.error('❌ [AI:image] All image providers failed.')
    return null
}

async function generateVideo(prompt, externalSignal = null) {
    const validProviders = getValidProviders('video')

    if (validProviders === null) {
        console.warn('⚠️  [AI:video] No video provider configured. Video generation feature disabled.')
        return null
    }

    for (const provider of validProviders) {
        const { model, keys } = provider

        for (const key of keys) {
            if (!key || key.length <= 10 || key.startsWith('ENTER_') || key === 'Enter API Key') {
                log('skip', 'huggingface', model, `Invalid key, skipping`)
                continue
            }

            log('info', 'huggingface', model, `Generating video...`, `prompt="${prompt.slice(0,40)}..."`)

            try {
                const timeoutSignal = AbortSignal.timeout(60000)
                const signal = externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal

                const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ inputs: prompt }),
                    signal
                })

                if (!res.ok) {
                    const errText = await res.text()
                    log('warn', 'huggingface', model, `HTTP ${res.status}, trying next`, errText.slice(0,100))
                    continue
                }

                const buffer = Buffer.from(await res.arrayBuffer())
                log('ok', 'huggingface', model, `Video generated successfully`, `size=${(buffer.length/1024).toFixed(1)}KB`)
                return buffer

            } catch (e) {
                if (e.name === 'TimeoutError' || e.name === 'AbortError') {
                    log('warn', 'huggingface', model, `Timeout (60s), trying next`)
                } else {
                    log('error', 'huggingface', model, `Exception`, e.message)
                }
                continue
            }
        }
    }

    console.error('❌ [AI:video] All video providers failed.')
    return null
}

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

function spawnPromise(cmd, args, onSpawn = null) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args)
        if (onSpawn) onSpawn(proc)
        let stderr = ''
        proc.stderr.on('data', d => { stderr += d.toString() })
        proc.on('close', code => {
            if (code !== 0) reject(new Error(`${cmd} exit ${code}: ${stderr}`))
            else resolve()
        })
        proc.on('error', reject)
    })
}

async function imageToSticker(buffer, onSpawn = null) {
    const tmpIn  = path.join(os.tmpdir(), `sticker_in_${Date.now()}.jpg`)
    const tmpOut = path.join(os.tmpdir(), `sticker_out_${Date.now()}.webp`)
    fs.writeFileSync(tmpIn, buffer)
    try {
        await spawnPromise('ffmpeg', ['-i', tmpIn, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease', '-y', tmpOut], onSpawn)
        return fs.readFileSync(tmpOut)
    } finally {
        try { fs.unlinkSync(tmpIn) } catch(e) {}
        try { fs.unlinkSync(tmpOut) } catch(e) {}
    }
}

async function videoToSticker(buffer, onSpawn = null) {
    const tmpIn  = path.join(os.tmpdir(), `sticker_vin_${Date.now()}.mp4`)
    const tmpOut = path.join(os.tmpdir(), `sticker_vout_${Date.now()}.webp`)
    fs.writeFileSync(tmpIn, buffer)
    try {
        await spawnPromise('ffmpeg', [
            '-i', tmpIn,
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15',
            '-vcodec', 'libwebp', '-lossless', '0', '-compression_level', '6',
            '-q:v', '50', '-loop', '0', '-preset', 'picture', '-an', '-t', '5', '-y', tmpOut
        ], onSpawn)
        return fs.readFileSync(tmpOut)
    } finally {
        try { fs.unlinkSync(tmpIn) } catch(e) {}
        try { fs.unlinkSync(tmpOut) } catch(e) {}
    }
}

async function textToSticker(text, onSpawn = null) {
    const tmpOut = path.join(os.tmpdir(), `sticker_text_${Date.now()}.webp`)
    const safeText = text.replace(/[^\w\s\u00C0-\u024F\u0400-\u04FF.,!?:;\-]/g, '').slice(0, 100).trim() || 'Hello!'
    try {
        await spawnPromise('convert', [
            '-size', '512x512', 'xc:white',
            '-font', 'DejaVu-Sans-Bold', '-fill', 'black', '-gravity', 'Center',
            '-size', '480x480', `caption:${safeText}`,
            '-gravity', 'Center', '-composite', tmpOut
        ], onSpawn)
        return fs.readFileSync(tmpOut)
    } finally {
        try { fs.unlinkSync(tmpOut) } catch(e) {}
    }
}

module.exports = {
    callAI,
    generateImage,
    generateVideo,
    getValidProviders,
    getHistory,
    addHistory,
    clearHistory,
    maskSensitiveData,
    hasValidKeys,
    imageToSticker,
    videoToSticker,
    textToSticker,
}
