'use strict'

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────

const INDONESIA_ALIAS = {
    'bali':'denpasar','lombok':'mataram','kepri':'batam','papua':'jayapura',
    'kaltim':'samarinda','kalsel':'banjarmasin','kalteng':'palangkaraya',
    'kalbar':'pontianak','sulteng':'palu','sulsel':'makassar','sulut':'manado',
    'maluku':'ambon','ntb':'mataram','ntt':'kupang','aceh':'banda aceh',
    'sumut':'medan','sumbar':'padang','sumsel':'palembang','riau':'pekanbaru',
    'jambi':'jambi','bengkulu':'bengkulu','lampung':'bandar lampung',
    'babel':'pangkalpinang','jabar':'bandung','jateng':'semarang',
    'jatim':'surabaya','diy':'yogyakarta','banten':'serang','gorontalo':'gorontalo',
    'sulbar':'mamuju','malut':'ternate','papua barat':'manokwari'
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0') }

function getWeatherDesc(code, isDay = true) {
    const map = {
        0:{emoji:'☀️',label:'Clear'},1:{emoji:'🌤️',label:'Mostly Clear'},
        2:{emoji:'⛅',label:'Partly Cloudy'},3:{emoji:'☁️',label:'Overcast'},
        45:{emoji:'🌫️',label:'Foggy'},48:{emoji:'🌫️',label:'Freezing Fog'},
        51:{emoji:'🌦️',label:'Light Drizzle'},53:{emoji:'🌦️',label:'Moderate Drizzle'},
        55:{emoji:'🌧️',label:'Heavy Drizzle'},61:{emoji:'🌧️',label:'Light Rain'},
        63:{emoji:'🌧️',label:'Moderate Rain'},65:{emoji:'🌧️',label:'Heavy Rain'},
        71:{emoji:'🌨️',label:'Light Snow'},73:{emoji:'🌨️',label:'Moderate Snow'},
        75:{emoji:'❄️',label:'Heavy Snow'},77:{emoji:'🌨️',label:'Snow Grains'},
        80:{emoji:'🌦️',label:'Light Local Rain'},81:{emoji:'🌧️',label:'Moderate Local Rain'},
        82:{emoji:'⛈️',label:'Heavy Rain Showers'},85:{emoji:'🌨️',label:'Light Snow Showers'},
        86:{emoji:'❄️',label:'Heavy Snow Showers'},95:{emoji:'⛈️',label:'Thunderstorm'},
        96:{emoji:'⛈️',label:'Thunderstorm + Hail'},99:{emoji:'⛈️',label:'Thunderstorm + Heavy Hailin'}
    }
    const found = map[code]
    if (!found) return { emoji: '🌡️', label: 'Unknown' }
    if (!isDay && (code === 0 || code === 1)) return { emoji: '🌙', label: found.label }
    return found
}
function getUVLabel(uv) {
    if (uv <= 2) return 'Low'; if (uv <= 5) return 'Moderate'
    if (uv <= 7) return 'High'; if (uv <= 10) return 'Very High'; return 'Extreme'
}
function getWindDir(deg) {
    const dirs = ['North','Northeast','East','Southeast','South','Southwest','West','Northwest']
    return dirs[Math.round(deg / 45) % 8]
}
function getTzLabel(tzName) {
    if (!tzName) return ''
    if (tzName.includes('Jakarta')) return 'WIB'
    if (tzName.includes('Makassar')) return 'WITA'
    if (tzName.includes('Jayapura')) return 'WIT'
    return tzName
}
function getDayName(dateStr) {
    const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
    return days[new Date(dateStr).getDay()]
}
function getDateNum(dateStr) { return new Date(dateStr).getDate() }

// ─── GEOCODING ────────────────────────────────────────────────────────────────

async function geocodeCity(cityName, externalSignal = null) {
    try {
        const encoded = encodeURIComponent(cityName)
        const timeoutSignal = AbortSignal.timeout(8000)
        const signal = externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1`,
            { headers: { 'User-Agent': 'WhatsAppWeatherBot/1.0', 'Accept-Language': 'id,en' }, signal }
        )
        const data = await res.json()
        if (!data || data.length === 0) return null
        const place = data[0]
        const addr = place.address || {}
        const displayCity = addr.city || addr.town || addr.village || addr.county || place.display_name.split(',')[0]
        return { lat: parseFloat(place.lat), lon: parseFloat(place.lon), city: displayCity, state: addr.state || addr.province || '', country: addr.country || '', display: place.display_name }
    } catch(e) { return null }
}

async function reverseGeocode(lat, lon, externalSignal = null) {
    try {
        const timeoutSignal = AbortSignal.timeout(8000)
        const signal = externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`,
            { headers: { 'User-Agent': 'WhatsAppWeatherBot/1.0', 'Accept-Language': 'id,en' }, signal }
        )
        const data = await res.json()
        if (!data || data.error) return null
        const addr = data.address || {}
        // Same approach as the Telegram version (fifi.js): don't just pick ONE
        // administrative field (city/town/village) — which one is "correct" is
        // inconsistent across OSM locations. Chain all granularity levels
        // (street → subdistrict → city → province) with dedup, so details like
        // subdistrict names still appear even when Nominatim's official "city"
        // field drifts to a neighbouring area.
        const road        = addr.road || addr.pedestrian || addr.footway || ''
        const subdistrict = addr.suburb || addr.neighbourhood || addr.quarter || addr.village || ''
        const city         = addr.city || addr.town || addr.municipality || addr.county || addr.state || 'Unknowni'
        const state        = addr.state || addr.province || ''
        const country      = addr.country || ''
        const addrParts = [road, subdistrict, city, state, country].filter(Boolean)
        const deduped = addrParts.filter((v, i) => i === 0 || v.toLowerCase() !== addrParts[i - 1].toLowerCase())
        const display = deduped.join(', ')
        return { lat, lon, city, state, country, display, addressLine: display }
    } catch(e) { return null }
}

// ─── FETCH CUACA ──────────────────────────────────────────────────────────────

async function fetchWeather(lat, lon, externalSignal = null) {
    const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        current: ['temperature_2m','apparent_temperature','relative_humidity_2m','weathercode','windspeed_10m','winddirection_10m','uv_index','precipitation_probability','is_day'].join(','),
        hourly: ['temperature_2m','weathercode','precipitation_probability'].join(','),
        daily: ['weathercode','temperature_2m_max','temperature_2m_min','precipitation_probability_max','sunrise','sunset'].join(','),
        timezone: 'auto', forecast_days: 8, wind_speed_unit: 'kmh'
    })
    try {
        const timeoutSignal = AbortSignal.timeout(10000)
        const signal = externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal })
        const data = await res.json()
        if (data && data.current && data.current.temperature_2m !== undefined) return data
    } catch(e) {}
    return null
}

// ─── FORMAT PESAN ─────────────────────────────────────────────────────────────

function formatWeatherMessage(geo, data) {
    const cur = data.current
    const hourly = data.hourly
    const daily = data.daily
    const tz = data.timezone || 'UTC'
    const tzLabel = getTzLabel(tz)
    // current.time from Open-Meteo is already in local time for the location (timezone=auto),
    // formatnya "YYYY-MM-DDTHH:MM". Ini lebih reliable daripada round-trip lewat
    // toLocaleString, which can mis-parse and cause todayDate to be off
    // drift can cause most 3-hour forecast slots to be rejected.
    const currentTimeStr = cur.time || ''
    const todayDate = currentTimeStr.split('T')[0] || new Date().toISOString().slice(0, 10)
    const nowHour = parseInt(currentTimeStr.split('T')[1]?.slice(0, 2)) || 0
    const nowMinute = parseInt(currentTimeStr.split('T')[1]?.slice(3, 5)) || 0
    const nowLocal = new Date(`${todayDate}T${pad2(nowHour)}:${pad2(nowMinute)}:00`)
    const hariNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const bulanNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const hariStr = hariNames[nowLocal.getDay()]
    const tglStr = nowLocal.getDate()
    const bulStr = bulanNames[nowLocal.getMonth()]
    const thnStr = nowLocal.getFullYear()
    const jamStr = `${pad2(nowHour)}:${pad2(nowMinute)}`
    const code = cur.weathercode ?? cur.weather_code ?? 0
    const isDay = cur.is_day === 1
    const desc = getWeatherDesc(code, isDay)
    const uv = cur.uv_index ?? 0
    const windDir = getWindDir(cur.winddirection_10m ?? cur.wind_direction_10m ?? 0)
    const humidity = cur.relative_humidity_2m ?? 0
    const windspeed = Math.round(cur.windspeed_10m ?? cur.wind_speed_10m ?? 0)
    const temp = Math.round(cur.temperature_2m ?? 0)
    const feels = Math.round(cur.apparent_temperature ?? temp)
    const rainChance = cur.precipitation_probability ?? 0
    const todaySunrise = daily.sunrise?.[0] || ''
    const todaySunset = daily.sunset?.[0] || ''
    const sunriseTime = todaySunrise ? todaySunrise.split('T')[1]?.slice(0,5) : '--:--'
    const sunsetTime  = todaySunset  ? todaySunset.split('T')[1]?.slice(0,5)  : '--:--'
    // If from a shared location (reverseGeocode), geo.addressLine already contains
    // full address chain (street, subdistrict, city, province, country) that
    // more detail & accuracy than just city+state+country. If from city name
    // search (geocodeCity), addressLine is absent — fall back
    // to the old format.
    const cityName = geo.city || 'Unknown'
    const stateName = geo.state ? `, ${geo.state}` : ''
    const countryName = geo.country ? ` — ${geo.country}` : ''
    const locationHeader = geo.addressLine || `${cityName}${stateName}${countryName}`
    const hourlyTimes = hourly.time || []
    const hourlyTemps = hourly.temperature_2m || []
    const hourlyCodes = hourly.weathercode || hourly.weather_code || []
    const hourlyRain  = hourly.precipitation_probability || []
    const hourlyLines = []
    const nextSlot = (Math.floor(nowHour / 3) + 1) * 3
    for (let i = 0; i < hourlyTimes.length; i++) {
        const t = hourlyTimes[i]
        const hh = parseInt(t.split('T')[1]?.slice(0,2))
        if (isNaN(hh) || hh % 3 !== 0 || !t.startsWith(todayDate) || hh < nextSlot) continue
        const hDesc = getWeatherDesc(hourlyCodes[i] ?? 0, hh >= 6 && hh < 18)
        hourlyLines.push(`${pad2(hh)}:00 — ${Math.round(hourlyTemps[i] ?? 0)}°C ${hDesc.emoji} ${hourlyRain[i] ?? 0}%`)
    }
    const dailyTimes = daily.time || []
    const dailyCodes = daily.weathercode || daily.weather_code || []
    const dailyMax   = daily.temperature_2m_max || []
    const dailyMin   = daily.temperature_2m_min || []
    const dailyRain  = daily.precipitation_probability_max || []
    const dailyLines = []
    for (let i = 1; i < dailyTimes.length; i++) {
        const dDesc = getWeatherDesc(dailyCodes[i] ?? 0, true)
        dailyLines.push(`${getDayName(dailyTimes[i])} ${getDateNum(dailyTimes[i])} — ${dDesc.emoji} ${Math.round(dailyMin[i] ?? 0)}–${Math.round(dailyMax[i] ?? 0)}°C 💧${dailyRain[i] ?? 0}%`)
    }
    const latStr = geo.lat >= 0 ? `${geo.lat.toFixed(4)}°N` : `${Math.abs(geo.lat).toFixed(4)}°S`
    const lonStr = geo.lon >= 0 ? `${geo.lon.toFixed(4)}°E` : `${Math.abs(geo.lon).toFixed(4)}°W`
    return `🌤️ *Cuaca ${locationHeader}*
🕐 Updated: ${hariStr}, ${tglStr} ${bulanNames[nowLocal.getMonth()]} ${thnStr} • ${jamStr}${tzLabel ? ' ' + tzLabel : ''}

━━━━━━━━━━━━━━━━━━━━
🌡️ *Right Now*
Temp: ${temp}°C (Feels ${feels}°C)
Condition: ${desc.emoji} ${desc.label}
Humidity: ${humidity}%
Wind: ${windspeed} km/h from ${windDir}
UV Index: ${uv} (${getUVLabel(uv)})
Rain Chance: ${rainChance}%
🌅 Sunrise: ${sunriseTime}
🌇 Sunset: ${sunsetTime}

━━━━━━━━━━━━━━━━━━━━
🕐 *3-Hour Forecast Today*
${hourlyLines.length > 0 ? hourlyLines.join('\n') : 'Data unavailable'}

━━━━━━━━━━━━━━━━━━━━
📅 *7-Day Forecast*
${dailyLines.length > 0 ? dailyLines.join('\n') : 'Data unavailable'}

━━━━━━━━━━━━━━━━━━━━
📍 Coordinates: ${latStr}, ${lonStr}

_⚠️ Weather forecasts are subject to change
without prior notice. Data is provided for
informational purposes only and may not
reflect real-time atmospheric conditions._`
}

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

async function handleWeatherCommand(sock, from, args, msg, shouldQuote, signal = null) {
    const quoteOpt = shouldQuote(msg) ? { quoted: msg } : {}
    if (!args || args.trim() === '') {
        await sock.sendMessage(from, { text: `🌤️ Usage:
.weather [city/area name]
Examples:
.weather london
.weather new york
.weather tokyo` }, quoteOpt)
        return
    }
    await sock.sendMessage(from, { text: '⏳ Fetching weather data...' })
    const input = args.trim().toLowerCase()
    const resolved = INDONESIA_ALIAS[input] || input
    const geo = await geocodeCity(resolved, signal)
    if (!geo) { await sock.sendMessage(from, { text: `❌ Location *${args.trim()}* not found.` }, quoteOpt); return }
    const weatherData = await fetchWeather(geo.lat, geo.lon, signal)
    if (!weatherData) { await sock.sendMessage(from, { text: '❌ Failed to fetch weather data. Please try again later.' }, quoteOpt); return }
    await sock.sendMessage(from, { text: formatWeatherMessage(geo, weatherData) }, quoteOpt)
}

async function handleLocationWeather(sock, from, msg, signal = null) {
    const loc = msg.message?.locationMessage
    if (!loc) return false
    const lat = loc.degreesLatitude; const lon = loc.degreesLongitude
    if (lat === undefined || lon === undefined) return false
    await sock.sendMessage(from, { text: '📍 Location received! Fetching weather data...' })
    const geo = await reverseGeocode(lat, lon, signal)
    const geoData = geo || { lat, lon, city: 'Your Location', state: '', country: '' }
    const weatherData = await fetchWeather(lat, lon, signal)
    if (!weatherData) { await sock.sendMessage(from, { text: '❌ Failed to fetch weather data for this location.' }); return true }
    await sock.sendMessage(from, { text: formatWeatherMessage(geoData, weatherData) })
    return true
}

module.exports = {
    INDONESIA_ALIAS,
    getWeatherDesc, getUVLabel, getWindDir, getTzLabel, getDayName, getDateNum,
    geocodeCity, reverseGeocode, fetchWeather, formatWeatherMessage,
    handleWeatherCommand, handleLocationWeather
}
