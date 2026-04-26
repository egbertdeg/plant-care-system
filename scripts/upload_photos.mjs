import { readFileSync } from 'fs'

const BASE  = 'https://plant-care-api.egbert-degroot.workers.dev'
const ROSES = '/workspaces/plant-care-system/uploads/Roses'

const UPLOADS = [
  // ── Heroes ────────────────────────────────────────────────────────────────
  { plant: 1,  tier: 'hero',    file: '1. Jackson Morden Blush Shrub Rose (Cold Tolerant) - Pink/1.0. Jackson Morden Blush Shrub Rose.png' },
  { plant: 3,  tier: 'hero',    file: '3. Snowcone Shrub/3.0. Jackson Snowcone.png' },
  { plant: 4,  tier: 'hero',    file: '4. Mardi Gras/4.0. Jackson - Mardi Gras.png' },
  { plant: 5,  tier: 'hero',    file: '5. Earth angel Perfuma Floribunda/5.0. Jackson - Earth Angel.jpg' },
  { plant: 7,  tier: 'hero',    file: '7. Moon Dance Floribunda/7.0. Jackson - Moondance.png' },
  { plant: 8,  tier: 'hero',    file: '8. Bubblicious/8.0. Jackson Bubblicious.png' },
  { plant: 10, tier: 'hero',    file: '10. Mardi Gras/10.0. Jackson - Mardi Gras.png' },

  // ── O1 Morden Blush ───────────────────────────────────────────────────────
  { plant: 1,  tier: 'history', date: '2025-10-15', file: '1. Jackson Morden Blush Shrub Rose (Cold Tolerant) - Pink/1.2. 79D01EAD-FC4F-45EE-9568-44CEB910DD19.jpg' },

  // ── O3 Snowcone ───────────────────────────────────────────────────────────
  { plant: 3,  tier: 'history', date: '2024-03-24', file: '3. Snowcone Shrub/3.3. IMG_9656.JPEG' },
  { plant: 3,  tier: 'history', date: '2024-03-24', file: '3. Snowcone Shrub/3.4. IMG_9657.JPEG' },
  { plant: 3,  tier: 'history', date: '2025-07-01', file: '3. Snowcone Shrub/3.5. Small white flowers shrub.png' },

  // ── O4 Mardi Gras ─────────────────────────────────────────────────────────
  { plant: 4,  tier: 'history', date: '2024-08-07', file: '4. Mardi Gras/4.2. A64F809A-43A4-462C-92EB-8E8320B3716A.jpg' },
  { plant: 4,  tier: 'history', date: '2024-08-12', file: '4. Mardi Gras/4.3. ED5CE273-8A1D-44A7-8C20-8CC293916473.jpg' },
  { plant: 4,  tier: 'history', date: '2024-06-04', file: '4. Mardi Gras/4.4. IMG_0498.JPEG' },

  // ── O5 Earth Angel ────────────────────────────────────────────────────────
  { plant: 5,  tier: 'history', date: '2025-10-15', file: '5. Earth angel Perfuma Floribunda/5.2. 79D01EAD-FC4F-45EE-9568-44CEB910DD19.jpg' },
  { plant: 5,  tier: 'history', date: '2024-05-08', file: '5. Earth angel Perfuma Floribunda/5.3. IMG_0116.JPEG' },
  { plant: 5,  tier: 'history', date: '2024-03-24', file: '5. Earth angel Perfuma Floribunda/5.4. IMG_9650.JPEG' },
  { plant: 5,  tier: 'history', date: '2024-03-24', file: '5. Earth angel Perfuma Floribunda/5.5. IMG_9651.JPEG' },
  { plant: 5,  tier: 'history', date: '2024-03-24', file: '5. Earth angel Perfuma Floribunda/5.6. IMG_9654.JPEG' },
  { plant: 5,  tier: 'history', date: '2024-03-24', file: '5. Earth angel Perfuma Floribunda/5.7. IMG_9655.JPEG' },
  { plant: 5,  tier: 'history', date: '2025-07-01', file: '5. Earth angel Perfuma Floribunda/5.8. Showy Pink Roses (Morden Blush maybe).png' },

  // ── O6 Unknown Yellow-White ───────────────────────────────────────────────
  { plant: 6,  tier: 'history', date: '2024-08-12', file: '6. Original Yellow Small Flowers nice smell/6.2. AB2B1F8C-2E73-4F4B-B918-A7AB156291F9.jpg' },
  { plant: 6,  tier: 'history', date: '2024-05-08', file: '6. Original Yellow Small Flowers nice smell/6.3. IMG_0115.JPEG' },
  { plant: 6,  tier: 'history', date: '2024-09-13', file: '6. Original Yellow Small Flowers nice smell/6.4. IMG_1531.JPEG' },
  { plant: 6,  tier: 'history', date: '2025-05-12', file: '6. Original Yellow Small Flowers nice smell/6.5. IMG_3130.JPEG' },
  { plant: 6,  tier: 'history', date: '2024-03-24', file: '6. Original Yellow Small Flowers nice smell/6.6. IMG_9652.JPEG' },
  { plant: 6,  tier: 'history', date: '2024-03-24', file: '6. Original Yellow Small Flowers nice smell/6.7. IMG_9653.JPEG' },

  // ── O7 Moondance ──────────────────────────────────────────────────────────
  { plant: 7,  tier: 'history', date: '2024-08-12', file: '7. Moon Dance Floribunda/7.2. 1EADD737-ADD8-425F-891A-D4F210A79D65.jpg' },
  { plant: 7,  tier: 'history', date: '2024-05-25', file: '7. Moon Dance Floribunda/7.3. A43EECCE-02A6-4C53-B42D-F9CAEBBE6257.jpg' },

  // ── O8 Bubblicious ────────────────────────────────────────────────────────
  { plant: 8,  tier: 'history', date: '2024-03-24', file: '8. Bubblicious/8.3. IMG_9649.JPEG' },
  { plant: 8,  tier: 'history', date: '2025-07-01', file: '8. Bubblicious/8.4. Small Pink Flowres.png' },

  // ── O10 Mardi Gras ────────────────────────────────────────────────────────
  { plant: 10, tier: 'history', date: '2024-08-07', file: '10. Mardi Gras/10.2. A64F809A-43A4-462C-92EB-8E8320B3716A.jpg' },
  { plant: 10, tier: 'history', date: '2024-08-12', file: '10. Mardi Gras/10.3. ED5CE273-8A1D-44A7-8C20-8CC293916473.jpg' },
  { plant: 10, tier: 'history', date: '2024-06-04', file: '10. Mardi Gras/10.4. IMG_0498.JPEG' },
]

function contentType(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  if (ext === 'png')  return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

async function upload({ plant, tier, file, date }) {
  const fullPath = `${ROSES}/${file}`
  const filename = file.split('/').pop()
  const ct = contentType(filename)

  const data = readFileSync(fullPath)
  const form = new FormData()
  form.append('file', new Blob([data], { type: ct }), filename)
  form.append('caption', `O${plant} - ${tier}`)
  form.append('tier', tier)
  if (date) form.append('uploaded_at', `${date} 12:00:00`)

  const res  = await fetch(`${BASE}/plants/${plant}/photos`, { method: 'POST', body: form })
  const json = await res.json()

  const status = json.ok ? '✓' : '✗'
  const label  = date ? `${date}` : 'hero'
  console.log(`${status} O${String(plant).padEnd(2)} ${tier.padEnd(7)} ${label.padEnd(12)} ${filename}`)
  if (!json.ok) console.error('  ERROR:', json)
}

console.log('Uploading photos…\n')
for (const u of UPLOADS) {
  await upload(u)
}
console.log('\nDone.')
