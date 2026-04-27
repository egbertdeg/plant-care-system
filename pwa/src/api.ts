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

export interface CareEvent {
  watered: boolean
  volume_ml?: number | null
  fertilizer?: 'liquid' | 'rose-tone' | null
  pruned?: boolean
  notes?: string | null
}

// Logs a care event (watering, fertilizer, pruning, notes) for a plant.
export async function logCareEvent(plantId: number, event: CareEvent): Promise<void> {
  await req(`/plants/${plantId}/care`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
}

// Returns plant IDs that have moisture ≤ 4 in the past 24h with no watering since.
export async function getThirstyPlants(): Promise<number[]> {
  return req<number[]>('/plants/needs-water')
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

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  imageData?: { base64: string; mediaType: string }
}

// Sends one chat turn for a plant and returns the assistant reply.
export async function chatWithPlant(plantId: number, messages: ChatMessage[]): Promise<string> {
  const data = await req<{ reply: string }>(`/plants/${plantId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  return data.reply
}

export interface GardenNote {
  id?: number
  category: string
  body: string
  recorded_at?: string
}

// Summarizes a full conversation. Saves plant note (always) and garden note (if applicable).
export async function summarizeChat(
  plantId: number,
  messages: ChatMessage[],
): Promise<{ plant_note: string; garden_note?: { category: string; body: string } }> {
  return req(`/plants/${plantId}/chat/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
}

// Returns all garden-wide notes, optionally filtered by category.
export async function getGardenNotes(category?: string): Promise<GardenNote[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : ''
  return req<GardenNote[]>(`/garden/notes${qs}`)
}

// Saves a new garden-wide note.
export async function addGardenNote(category: string, body: string): Promise<void> {
  await req('/garden/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, body }),
  })
}

// Uploads a photo via multipart/form-data.
export async function uploadPhoto(
  plantId: number,
  file: File,
  caption: string,
  tier = 'round',
  uploadedAt?: string,
): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  form.append('caption', caption)
  form.append('tier', tier)
  if (uploadedAt) form.append('uploaded_at', uploadedAt)
  await req(`/plants/${plantId}/photos`, {
    method: 'POST',
    body: form,
  })
}
