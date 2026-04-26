const BASE = 'https://plant-care-api.egbert-degroot.workers.dev'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// Atomically appends a dated note line to the plant's notes field.
export async function addNote(plantId: number, note: string): Promise<void> {
  await req(`/plants/${plantId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })
}

// Logs a watering event to the watering_events table.
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

// Logs a manual sensor reading (moisture, pH, etc.) to the manual_readings table.
export async function logReading(
  plantId: number,
  type: string,
  value: number,
  unit: string,
): Promise<void> {
  await req(`/plants/${plantId}/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, value, unit }),
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
