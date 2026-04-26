const BASE = 'https://plant-care-api.egbert-degroot.workers.dev'

async function cleanPlant(id) {
  const res = await fetch(`${BASE}/plants/${id}`)
  const plant = await res.json()

  if (!plant.notes) { console.log(`O${id}: no notes`); return }

  const cleaned = plant.notes
    .split('\n')
    .filter(line => {
      if (/^\[\d{4}-\d{2}-\d{2}\] Sensor:/.test(line)) return false
      if (/^\[\d{4}-\d{2}-\d{2}\] General:/.test(line)) return false
      if (/^test note$/i.test(line.trim())) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (cleaned === plant.notes.trim()) {
    console.log(`O${id}: no changes`)
    return
  }

  const put = await fetch(`${BASE}/plants/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: cleaned }),
  })
  const result = await put.json()
  console.log(`O${id}: cleaned — ${result.ok ? 'ok' : JSON.stringify(result)}`)
}

for (let i = 1; i <= 10; i++) {
  await cleanPlant(i)
}
