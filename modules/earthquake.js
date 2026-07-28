'use strict'

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',
]

const FALLBACK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

function getRandomUA() {
    if (!USER_AGENTS.length) return FALLBACK_USER_AGENT
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] || FALLBACK_USER_AGENT
}

const KATA_KUNCI_TERBARU = ['terbaru', 'update', 'terkini', 'baru']
const JUMLAH_DATA_DEFAULT = 15

const NEGARA_NON_INDONESIA = [
    'china','tiongkok','jepang','japan','korea','korea selatan','korea utara',
    'amerika','usa','filipina','philippines','vietnam','thailand','malaysia',
    'singapura','singapore','india','pakistan','afghanistan','iran','turki','turkey',
    'meksiko','mexico','chile','peru','selandia baru','new zealand','australia',
    'taiwan','myanmar','nepal','italia','italy','yunani','greece','spanyol','spain'
]

const PROVINSI_KABKOTA = {
    'aceh': ['Simeulue','Aceh Singkil','Aceh Selatan','Aceh Tenggara','Aceh Timur','Aceh Tengah','Aceh Barat','Aceh Besar','Pidie','Bireuen','Aceh Utara','Aceh Barat Daya','Gayo Lues','Aceh Tamiang','Nagan Raya','Aceh Jaya','Bener Meriah','Pidie Jaya','Banda Aceh','Sabang','Langsa','Lhokseumawe','Subulussalam'],
    'sumatera utara': ['Nias','Mandailing Natal','Tapanuli Selatan','Tapanuli Tengah','Tapanuli Utara','Toba Samosir','Toba','Labuhan Batu','Asahan','Simalungun','Dairi','Karo','Deli Serdang','Langkat','Nias Selatan','Humbang Hasundutan','Pakpak Bharat','Samosir','Serdang Bedagai','Batu Bara','Padang Lawas Utara','Padang Lawas','Labuhan Batu Selatan','Labuhan Batu Utara','Nias Utara','Nias Barat','Sibolga','Tanjung Balai','Pematangsiantar','Pematang Siantar','Tebing Tinggi','Medan','Binjai','Padang Sidempuan','Padangsidimpuan','Gunungsitoli'],
    'sumatera barat': ['Kepulauan Mentawai','Pesisir Selatan','Solok','Sijunjung','Tanah Datar','Padang Pariaman','Agam','Lima Puluh Kota','Pasaman','Solok Selatan','Dharmasraya','Pasaman Barat','Padang','Sawah Lunto','Sawahlunto','Padang Panjang','Bukittinggi','Payakumbuh','Pariaman'],
    'riau': ['Kuantan Singingi','Indragiri Hulu','Indragiri Hilir','Pelalawan','Siak','Kampar','Rokan Hulu','Bengkalis','Rokan Hilir','Kepulauan Meranti','Pekanbaru','Dumai'],
    'jambi': ['Kerinci','Merangin','Sarolangun','Batang Hari','Muaro Jambi','Tanjung Jabung Timur','Tanjung Jabung Barat','Tebo','Bungo','Jambi','Sungai Penuh'],
    'sumatera selatan': ['Ogan Komering Ulu','Ogan Komering Ilir','Muara Enim','Lahat','Musi Rawas','Musi Banyuasin','Banyuasin','Ogan Komering Ulu Selatan','Ogan Komering Ulu Timur','Ogan Ilir','Empat Lawang','Penukal Abab Lematang Ilir','Musi Rawas Utara','Palembang','Prabumulih','Pagar Alam','Lubuk Linggau','Lubuklinggau'],
    'bengkulu': ['Bengkulu Selatan','Rejang Lebong','Bengkulu Utara','Kaur','Seluma','Mukomuko','Lebong','Kepahiang','Bengkulu Tengah','Bengkulu'],
    'lampung': ['Lampung Barat','Tanggamus','Lampung Selatan','Lampung Timur','Lampung Tengah','Lampung Utara','Way Kanan','Tulang Bawang','Pesawaran','Pringsewu','Mesuji','Tulang Bawang Barat','Pesisir Barat','Bandar Lampung','Metro'],
    'kepulauan bangka belitung': ['Bangka','Belitung','Bangka Barat','Bangka Tengah','Bangka Selatan','Belitung Timur','Pangkal Pinang','Pangkalpinang'],
    'kepulauan riau': ['Karimun','Bintan','Natuna','Lingga','Kepulauan Anambas','Anambas','Batam','Tanjung Pinang','Tanjungpinang'],
    'dki jakarta': ['Kepulauan Seribu','Jakarta Selatan','Jakarta Timur','Jakarta Pusat','Jakarta Barat','Jakarta Utara'],
    'jawa barat': ['Bogor','Sukabumi','Cianjur','Bandung','Garut','Tasikmalaya','Ciamis','Kuningan','Cirebon','Majalengka','Sumedang','Indramayu','Subang','Purwakarta','Karawang','Bekasi','Bandung Barat','Pangandaran','Kota Bogor','Kota Sukabumi','Kota Bandung','Kota Cirebon','Kota Bekasi','Depok','Cimahi','Kota Tasikmalaya','Banjar'],
    'jawa tengah': ['Cilacap','Banyumas','Purbalingga','Banjarnegara','Kebumen','Purworejo','Wonosobo','Magelang','Boyolali','Klaten','Sukoharjo','Wonogiri','Karanganyar','Sragen','Grobogan','Blora','Rembang','Pati','Kudus','Jepara','Demak','Semarang','Temanggung','Kendal','Batang','Pekalongan','Pemalang','Tegal','Brebes','Kota Magelang','Surakarta','Solo','Salatiga','Kota Semarang','Kota Pekalongan','Kota Tegal'],
    'daerah istimewa yogyakarta': ['Kulon Progo','Bantul','Gunungkidul','Gunung Kidul','Sleman','Yogyakarta'],
    'jawa timur': ['Pacitan','Ponorogo','Trenggalek','Tulungagung','Blitar','Kediri','Malang','Lumajang','Jember','Banyuwangi','Bondowoso','Situbondo','Probolinggo','Pasuruan','Sidoarjo','Mojokerto','Jombang','Nganjuk','Madiun','Magetan','Ngawi','Bojonegoro','Tuban','Lamongan','Gresik','Bangkalan','Sampang','Pamekasan','Sumenep','Kota Kediri','Kota Blitar','Kota Malang','Kota Probolinggo','Kota Pasuruan','Kota Mojokerto','Kota Madiun','Surabaya','Batu'],
    'banten': ['Pandeglang','Lebak','Tangerang','Serang','Cilegon','Tangerang Selatan'],
    'bali': ['Jembrana','Tabanan','Badung','Gianyar','Klungkung','Bangli','Karangasem','Buleleng','Denpasar'],
    'nusa tenggara barat': ['Lombok Barat','Lombok Tengah','Lombok Timur','Sumbawa','Dompu','Bima','Sumbawa Barat','Lombok Utara','Mataram'],
    'nusa tenggara timur': ['Sumba Barat','Sumba Timur','Kupang','Timor Tengah Selatan','Timor Tengah Utara','Belu','Alor','Lembata','Flores Timur','Sikka','Ende','Ngada','Manggarai','Rote Ndao','Manggarai Barat','Sumba Tengah','Sumba Barat Daya','Nagekeo','Manggarai Timur','Sabu Raijua','Malaka'],
    'kalimantan barat': ['Sambas','Bengkayang','Landak','Pontianak','Sanggau','Ketapang','Sintang','Kapuas Hulu','Sekadau','Melawi','Kayong Utara','Kubu Raya','Singkawang'],
    'kalimantan tengah': ['Kotawaringin Barat','Kotawaringin Timur','Kapuas','Barito Selatan','Barito Utara','Sukamara','Lamandau','Seruyan','Katingan','Pulang Pisau','Gunung Mas','Barito Timur','Murung Raya','Palangka Raya','Palangkaraya'],
    'kalimantan selatan': ['Tanah Laut','Kotabaru','Banjar','Barito Kuala','Tapin','Hulu Sungai Selatan','Hulu Sungai Tengah','Hulu Sungai Utara','Tabalong','Tanah Bumbu','Balangan','Banjarmasin','Banjarbaru'],
    'kalimantan timur': ['Paser','Kutai Barat','Kutai Kartanegara','Kutai Timur','Berau','Penajam Paser Utara','Mahakam Ulu','Balikpapan','Samarinda','Bontang'],
    'kalimantan utara': ['Malinau','Bulungan','Tana Tidung','Nunukan','Tarakan'],
    'sulawesi utara': ['Bolaang Mongondow','Minahasa','Kepulauan Sangihe','Sangihe','Kepulauan Talaud','Talaud','Minahasa Selatan','Minahasa Utara','Bolaang Mongondow Utara','Kepulauan Siau Tagulandang Biaro','Siau Tagulandang Biaro','Minahasa Tenggara','Bolaang Mongondow Selatan','Bolaang Mongondow Timur','Manado','Bitung','Tomohon','Kotamobagu'],
    'sulawesi tengah': ['Banggai','Banggai Kepulauan','Banggai Laut','Morowali','Morowali Utara','Poso','Donggala','Toli-Toli','Tolitoli','Buol','Parigi Moutong','Tojo Una-Una','Sigi','Sigi Biromaru','Palu'],
    'sulawesi selatan': ['Kepulauan Selayar','Selayar','Bulukumba','Bantaeng','Jeneponto','Takalar','Gowa','Sinjai','Maros','Pangkajene','Pangkajene Kepulauan','Barru','Bone','Soppeng','Wajo','Sidenreng Rappang','Pinrang','Enrekang','Luwu','Tana Toraja','Luwu Utara','Luwu Timur','Toraja Utara','Makassar','Pare-Pare','Parepare','Palopo'],
    'sulawesi tenggara': ['Buton','Muna','Konawe','Kolaka','Konawe Selatan','Bombana','Wakatobi','Kolaka Utara','Buton Utara','Konawe Utara','Kolaka Timur','Konawe Kepulauan','Muna Barat','Buton Tengah','Buton Selatan','Kendari','Baubau','Bau-Bau'],
    'gorontalo': ['Boalemo','Gorontalo','Pohuwato','Bone Bolango','Gorontalo Utara'],
    'sulawesi barat': ['Majene','Polewali Mandar','Polewali','Mamasa','Mamuju','Mamuju Utara','Mamuju Tengah','Pasangkayu'],
    'maluku': ['Maluku Tenggara Barat','Maluku Tenggara','Maluku Tengah','Buru','Kepulauan Aru','Seram Bagian Barat','Seram Bagian Timur','Maluku Barat Daya','Buru Selatan','Ambon','Tual'],
    'maluku utara': ['Halmahera Barat','Halmahera Tengah','Kepulauan Sula','Halmahera Selatan','Halmahera Utara','Halmahera Timur','Pulau Morotai','Morotai','Pulau Taliabu','Taliabu','Ternate','Tidore Kepulauan','Tidore'],
    'papua': ['Merauke','Jayawijaya','Jayapura','Nabire','Kepulauan Yapen','Yapen','Biak Numfor','Biak','Paniai','Puncak Jaya','Mimika','Boven Digoel','Mappi','Asmat','Yahukimo','Pegunungan Bintang','Tolikara','Sarmi','Keerom','Waropen','Supiori','Mamberamo Raya','Mamberamo Tengah','Yalimo','Lanny Jaya','Nduga','Puncak','Dogiyai','Intan Jaya','Deiyai'],
    'papua barat': ['Fakfak','Kaimana','Teluk Wondama','Teluk Bintuni','Manokwari','Sorong Selatan','Sorong','Raja Ampat','Tambrauw','Maybrat','Manokwari Selatan','Pegunungan Arfak'],
    'papua selatan': ['Merauke','Mappi','Asmat','Boven Digoel'],
    'papua tengah': ['Nabire','Paniai','Mimika','Puncak Jaya','Puncak','Dogiyai','Intan Jaya','Deiyai'],
    'papua pegunungan': ['Jayawijaya','Pegunungan Bintang','Yahukimo','Tolikara','Yalimo','Lanny Jaya','Nduga','Mamberamo Tengah'],
    'papua barat daya': ['Sorong','Sorong Selatan','Raja Ampat','Tambrauw','Maybrat']
}

const SINGKATAN_PROVINSI = {
    'sumut':'sumatera utara','sumbar':'sumatera barat','sumsel':'sumatera selatan',
    'kepri':'kepulauan riau','babel':'kepulauan bangka belitung','jakarta':'dki jakarta',
    'dki':'dki jakarta','jabar':'jawa barat','jateng':'jawa tengah','jatim':'jawa timur',
    'jogja':'daerah istimewa yogyakarta','yogyakarta':'daerah istimewa yogyakarta','diy':'daerah istimewa yogyakarta',
    'ntb':'nusa tenggara barat','lombok':'nusa tenggara barat','ntt':'nusa tenggara timur',
    'kalbar':'kalimantan barat','kalteng':'kalimantan tengah','kalsel':'kalimantan selatan',
    'kaltim':'kalimantan timur','kaltara':'kalimantan utara',
    'sulut':'sulawesi utara','sulteng':'sulawesi tengah','sulsel':'sulawesi selatan',
    'sultra':'sulawesi tenggara','sulbar':'sulawesi barat',
    'malut':'maluku utara','papbar':'papua barat'
}

function resolveProvinsiKeyword(kwAsli) {
    const key = SINGKATAN_PROVINSI[kwAsli] || kwAsli
    return PROVINSI_KABKOTA[key] || null
}

function formatSatuGempa(g, i) {
    let t = `${i + 1}. *${g.Wilayah}*\n`
    t += `   📅 ${g.Tanggal} — ${g.Jam}\n`
    t += `   📏 Magnitude: *${g.Magnitude} SR*\n`
    t += `   ⬇️ Depth: ${g.Kedalaman}`
    if (g.Potensi) t += `\n   ⚠️ Potential: ${g.Potensi}`
    if (g.Dirasakan) t += `\n   📢 Felt in: ${g.Dirasakan}`
    return t
}

function formatGempaList(data, header) {
    const lines = data.map((g, i) => formatSatuGempa(g, i)).join('\n\n')
    return `🌋 *${header}*\n\n${lines}`
}

function gabungkanGempa(resTerkini, dirasakan) {
    const map = new Map()

    for (const g of resTerkini) {
        const key = g.DateTime || `${g.Tanggal}_${g.Jam}_${g.Wilayah}`
        map.set(key, { ...g })
    }

    for (const g of dirasakan) {
        const key = g.DateTime || `${g.Tanggal}_${g.Jam}_${g.Wilayah}`
        if (map.has(key)) {

            map.get(key).Dirasakan = g.Dirasakan
        } else {

            map.set(key, { ...g })
        }
    }

    return Array.from(map.values()).sort((a, b) => {
        const ta = new Date(a.DateTime || 0).getTime()
        const tb = new Date(b.DateTime || 0).getTime()
        return tb - ta
    })
}

function formatGempaTunggal(g) {
    let t = `🌋 *INFO GEMPA TERBARU*\n\n`
    t += `📍 *${g.Wilayah}*\n`
    t += `📅 ${g.Tanggal} — ${g.Jam}\n`
    t += `📏 Magnitude: *${g.Magnitude} SR*\n`
    t += `⬇️ Depth: ${g.Kedalaman}`
    if (g.Coordinates) t += `\n🧭 Coordinates: ${g.Coordinates}`
    if (g.Potensi) t += `\n⚠️ Potential: ${g.Potensi}`
    if (g.Dirasakan) t += `\n📢 Felt in: ${g.Dirasakan}`
    return t
}

async function ambilFeedBMKG(signal) {
    const [resTerkini, dirasakan] = await Promise.all([
        fetch('https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json', { headers: { 'User-Agent': getRandomUA() }, signal })
            .then(r => r.json()).then(j => j?.Infogempa?.gempa || []).catch(() => []),
        fetch('https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json', { headers: { 'User-Agent': getRandomUA() }, signal })
            .then(r => r.json()).then(j => j?.Infogempa?.gempa || []).catch(() => [])
    ])
    return { resTerkini, dirasakan }
}

async function fetchGempaID(wilayah, externalSignal = null) {
    try {

        const signal = externalSignal || AbortSignal.timeout(10000)

        const kwAsli = String(wilayah ?? '').trim().toLowerCase()

        const wilayahDisplay = String(wilayah ?? '').trim()

        const kwProvinsi = resolveProvinsiKeyword(kwAsli)
        const kwList = kwProvinsi ? kwProvinsi.map(x => x.toLowerCase()) : (kwAsli ? [kwAsli] : [])

        if (NEGARA_NON_INDONESIA.includes(kwAsli)) {
            return `🌐 *.gempaid* khusus untuk data gempa Indonesia.\n\nData gempa untuk *${wilayahDisplay}* tidak tersedia di sini.\n\nGunakan *.gempa ${wilayahDisplay}* untuk pencarian gempa di luar Indonesia.`
        }

        if (KATA_KUNCI_TERBARU.includes(kwAsli)) {
            const res = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json', { headers: { 'User-Agent': getRandomUA() }, signal })
                .then(r => r.json()).catch(() => null)
            const gempa = res?.Infogempa?.gempa
            if (!gempa) return '❌ Failed to fetch earthquake data. Please try again shortly!'
            return formatGempaTunggal(gempa)
        }

        const { resTerkini, dirasakan } = await ambilFeedBMKG(signal)

        if (!resTerkini.length && !dirasakan.length) return '❌ Failed to fetch earthquake data. Please try again shortly!'

        const gabungan = gabungkanGempa(resTerkini, dirasakan)

        if (kwList.length) {
            const filtered = gabungan.filter(g => {
                const w = g.Wilayah?.toLowerCase() || ''
                const d = g.Dirasakan?.toLowerCase() || ''
                return kwList.some(kw => w.includes(kw) || d.includes(kw))
            })

            if (filtered.length) {
                return formatGempaList(filtered, `EARTHQUAKES: ${wilayahDisplay.toUpperCase()} (${filtered.length} found)`)
            }
            return `📍 No earthquakes found for *${wilayahDisplay}*.\n\n` + formatGempaList(gabungan.slice(0, JUMLAH_DATA_DEFAULT), `${JUMLAH_DATA_DEFAULT} GEMPA TERBARU NASIONAL`)
        }

        return formatGempaList(gabungan.slice(0, JUMLAH_DATA_DEFAULT), `${JUMLAH_DATA_DEFAULT} GEMPA TERBARU NASIONAL`)
    } catch(e) {

        return '❌ Failed to fetch earthquake data. Please try again shortly!'
    }
}

const USGS_FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson'
const JUMLAH_DATA_DEFAULT_USGS = 15

async function ambilFeedUSGS(signal) {
    const res = await fetch(USGS_FEED_URL, { headers: { 'User-Agent': getRandomUA() }, signal })
    const data = await res.json()
    return Array.isArray(data?.features) ? data.features : []
}

const ALIAS_NEGARA_USGS = {

    'china': 'china', 'cina': 'china', 'tiongkok': 'china', 'chinese': 'china',

    'japan': 'japan', 'jepang': 'japan', 'japanese': 'japan',

    'philippines': 'philippines', 'filipina': 'philippines', 'philipines': 'philippines',
    'filipino': 'philippines', 'filipino islands': 'philippines',

    'indonesia': 'indonesia', 'indonesian': 'indonesia',

    'korea selatan': 'south korea', 'south korea': 'south korea', 'korea utara': 'north korea',
    'north korea': 'north korea', 'korea': 'korea',

    'amerika': 'united states', 'amerika serikat': 'united states', 'usa': 'united states',
    'us': 'united states', 'united states': 'united states', 'american': 'united states',

    'vietnam': 'vietnam', 'vietnamese': 'vietnam',
    'thailand': 'thailand', 'thai': 'thailand',
    'malaysia': 'malaysia', 'malaysian': 'malaysia',
    'singapura': 'singapore', 'singapore': 'singapore', 'singaporean': 'singapore',

    'india': 'india', 'indian': 'india',
    'pakistan': 'pakistan', 'pakistani': 'pakistan',
    'afghanistan': 'afghanistan', 'afghan': 'afghanistan',
    'iran': 'iran', 'iranian': 'iran',
    'turki': 'turkey', 'turkey': 'turkey', 'turkish': 'turkey',

    'meksiko': 'mexico', 'mexico': 'mexico', 'mexican': 'mexico',
    'chile': 'chile', 'chilean': 'chile',
    'peru': 'peru', 'peruvian': 'peru',

    'selandia baru': 'new zealand', 'new zealand': 'new zealand',
    'australia': 'australia', 'australian': 'australia',

    'taiwan': 'taiwan', 'taiwanese': 'taiwan',
    'myanmar': 'myanmar', 'burma': 'myanmar', 'burmese': 'myanmar',
    'nepal': 'nepal', 'nepali': 'nepal', 'nepalese': 'nepal',

    'italia': 'italy', 'italy': 'italy', 'italian': 'italy',
    'yunani': 'greece', 'greece': 'greece', 'greek': 'greece',
    'spanyol': 'spain', 'spain': 'spain', 'spanish': 'spain',
}

function filterByKeywordUSGS(features, keyword) {
    const kwAsli = keyword.toLowerCase().trim()
    const kw = ALIAS_NEGARA_USGS[kwAsli] || kwAsli
    return features.filter(f => (f.properties?.place || '').toLowerCase().includes(kw))
}

const NAMA_BULAN_ID_USGS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const NAMA_BULAN_EN_USGS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function pad2USGS(n) { return String(n).padStart(2, '0') }

function formatTanggalIDUSGS(epochMs) {

    const d = new Date(epochMs + 7 * 3600 * 1000)
    return `${d.getUTCDate()} ${NAMA_BULAN_ID_USGS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad2USGS(d.getUTCHours())}:${pad2USGS(d.getUTCMinutes())}:${pad2USGS(d.getUTCSeconds())} WIB`
}

function formatTanggalENUSGS(epochMs) {
    const d = new Date(epochMs)
    return `${NAMA_BULAN_EN_USGS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${pad2USGS(d.getUTCHours())}:${pad2USGS(d.getUTCMinutes())}:${pad2USGS(d.getUTCSeconds())} UTC`
}

function getMagnitudeEmojiUSGS(mag) {
    if (mag === null || mag === undefined) return '🟡'
    if (mag >= 6.0) return '🔴'
    if (mag >= 5.0) return '🟠'
    if (mag >= 4.0) return '🟡'
    return '🟢'
}

function formatSatuFeatureIDUSGS(feat, i) {
    const p = feat.properties || {}
    const emoji = getMagnitudeEmojiUSGS(p.mag)
    let t = `${i + 1}. ${emoji} *${p.place || 'Location unknown'}*\n`
    t += `   📅 ${formatTanggalIDUSGS(p.time)}\n`
    t += `   📏 Magnitude: *${p.mag ?? '-'} ${p.magType ? `(${p.magType})` : ''}*`
    const depth = feat.geometry?.coordinates?.[2]
    if (depth !== undefined && depth !== null) t += `\n   ⬇️ Depth: ${depth} km`
    if (p.tsunami === 1) t += `\n   🌊 Warning: tsunami potential`
    if (p.felt) t += `\n   👥 Dirasakan oleh: ${p.felt} laporan`
    return t
}

function formatSatuFeatureENUSGS(feat, i) {
    const p = feat.properties || {}
    const emoji = getMagnitudeEmojiUSGS(p.mag)
    let t = `${i + 1}. ${emoji} *${p.place || 'Unknown location'}*\n`
    t += `   📅 ${formatTanggalENUSGS(p.time)}\n`
    t += `   📏 Magnitude: *${p.mag ?? '-'} ${p.magType ? `(${p.magType})` : ''}*`
    const depth = feat.geometry?.coordinates?.[2]
    if (depth !== undefined && depth !== null) t += `\n   ⬇️ Depth: ${depth} km`
    if (p.tsunami === 1) t += `\n   🌊 Tsunami potential`
    if (p.felt) t += `\n   👥 Felt reports: ${p.felt}`
    return t
}

function formatListIDUSGS(features, header) {
    const lines = features.map((f, i) => formatSatuFeatureIDUSGS(f, i)).join('\n\n')
    return `🌍 *${header}*\n\n${lines}`
}

function formatListENUSGS(features, header) {
    const lines = features.map((f, i) => formatSatuFeatureENUSGS(f, i)).join('\n\n')
    return `🌍 *${header}*\n\n${lines}`
}

async function fetchGempaGlobal(wilayah, lang, externalSignal = null) {
    const isID = lang === 'id'
    try {
        const signal = externalSignal || AbortSignal.timeout(10000)
        const kwAsli = String(wilayah ?? '').trim()

        const features = await ambilFeedUSGS(signal)

        if (!features.length) {
            return isID
                ? '❌ Failed to fetch earthquake data. Please try again shortly!'
                : '❌ Failed to fetch earthquake data. Please try again shortly!'
        }

        const sorted = [...features].sort((a, b) => (b.properties?.time || 0) - (a.properties?.time || 0))

        if (!kwAsli) {
            const top = sorted.slice(0, JUMLAH_DATA_DEFAULT_USGS)
            return isID
                ? formatListIDUSGS(top, `${JUMLAH_DATA_DEFAULT_USGS} LATEST WORLDWIDE EARTHQUAKES (M2.5+)`)
                : formatListENUSGS(top, `${JUMLAH_DATA_DEFAULT_USGS} LATEST WORLDWIDE EARTHQUAKES (M2.5+)`)
        }

        const filtered = filterByKeywordUSGS(sorted, kwAsli)

        if (filtered.length) {
            const top = filtered.slice(0, JUMLAH_DATA_DEFAULT_USGS)
            return isID
                ? formatListIDUSGS(top, `EARTHQUAKES: ${kwAsli.toUpperCase()} (${filtered.length} found)`)
                : formatListENUSGS(top, `EARTHQUAKES: ${kwAsli.toUpperCase()} (${filtered.length} found)`)
        }

        const fallback = sorted.slice(0, JUMLAH_DATA_DEFAULT_USGS)
        return isID
            ? `📍 No earthquakes found for *${kwAsli}* in the past 30 days.\n\n` + formatListIDUSGS(fallback, `${JUMLAH_DATA_DEFAULT_USGS} LATEST WORLDWIDE EARTHQUAKES (M2.5+)`)
            : `📍 No earthquakes found for *${kwAsli}* in the past 30 days.\n\n` + formatListENUSGS(fallback, `${JUMLAH_DATA_DEFAULT_USGS} LATEST WORLDWIDE EARTHQUAKES (M2.5+)`)
    } catch (e) {

        return isID
            ? '❌ Failed to fetch earthquake data. Please try again shortly!'
            : '❌ Failed to fetch earthquake data. Please try again shortly!'
    }
}

async function fetchGempaUSGS(wilayah, signal = null) {
    return fetchGempaGlobal(wilayah, 'id', signal)
}

async function fetchEarthquakeUSGS(wilayah, signal = null) {
    return fetchGempaGlobal(wilayah, 'en', signal)
}

module.exports = { fetchGempaID, fetchGempaUSGS, fetchEarthquakeUSGS }
