const BASE = 'https://plant-care-mcp.egbert-degroot.workers.dev'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

interface PlantRecord {
  id: number
  name: string
  notes: string | null
  [key: string]: unknown
}

async function getPlant(plantId: number): Promise<PlantRecord> {
  return req<PlantRecord>(`/plants/${plantId}`)
}

// Appends a dated note line to the plant's running notes field (GET → append → PUT).
export async function addNote(plantId: number, note: string): Promise<void> {
  const plant = await getPlant(plantId)
  const current = plant.notes?.trim() ?? ''
  const updated = current ? `${current}\n${note}` : note
  await req(`/plants/${plantId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: updated }),
  })
}

// Logs a watering event to the waterings table.
export async function logWatering(
  plantId: number,
  volumeMl: number | null,
  notes: string,
): Promise<void> {
  await req(`/plants/${plantId}/waterings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ volume_ml: volumeMl, notes }),
  })
}

// Uploads a photo via multipart/form-data.
export async function uploadPhoto(
  plantId: number,
  file: File,
  caption: string,
): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  form.append('caption', caption)
  await req(`/plants/${plantId}/photos`, {
    method: 'POST',
    body: form,
  })
}
