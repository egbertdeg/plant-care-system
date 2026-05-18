const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', ...init })
  if (res.status === 401) {
    window.location.replace('/')
    return new Promise(() => {})
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export interface Collection {
  id: number
  user_id: string
  name: string
  description: string | null
  indoor_outdoor: string
  sort_order: number
}

export interface Plant {
  id: number
  name: string
  label: string | null
  short_name: string | null
  species: string | null
  location: string | null
  indoor_outdoor: string
  notes: string | null
  created_at: string | null
  updated_at: string | null
  user_id: string
  collection_id: number | null
  collection_name: string | null
  parent_id: number | null
  slot_number: number | null
  children?: Plant[]
}

export interface CreatePlantInput {
  name: string
  label?: string
  short_name?: string
  species?: string
  location?: string
  indoor_outdoor?: 'indoor' | 'outdoor'
  notes?: string
  parent_id?: number | null
  slot_number?: number | null
}

export async function getPlants(): Promise<Plant[]> {
  return req<Plant[]>('/plants')
}

export async function createPlant(input: CreatePlantInput): Promise<Plant> {
  return req<Plant>('/plants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function getPlant(plantId: number): Promise<Plant> {
  return req<Plant>(`/plants/${plantId}`)
}

export async function updatePlant(plantId: number, fields: Partial<Plant>): Promise<void> {
  await req(`/plants/${plantId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
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
  neem?: boolean
  potassium_bicarb?: boolean
  insecticidal_soap?: boolean
  notes?: string | null
}

export interface PlantHomeStatus {
  id: number
  name: string
  label: string | null
  short_name: string | null
  indoor_outdoor: string
  needs_water: boolean
  reason: 'et0' | 'moisture' | 'both' | null
  soil_deficit_mm: number | null
  et0_budget_mm: number | null
  last_watered: string | null
  forecast_next_due: string | null
  days_until_due: number | null
  latest_moisture: number | null
}

export interface ScheduleItem {
  id: number
  plant_id: number | null
  treatment: string
  interval_days: number
  last_applied: string | null
  next_due: string | null
  active: number
  notes: string | null
  overdue: boolean
  days_until_due: number | null
  conflict_with: number[]
}

export interface HomeData {
  plants: PlantHomeStatus[]
  overdue_schedules: ScheduleItem[]
  due_today: ScheduleItem[]
}

export async function getHomeData(): Promise<HomeData> {
  return req<HomeData>('/home')
}

export async function getSchedules(includeInactive = false): Promise<ScheduleItem[]> {
  const qs = includeInactive ? '?include_inactive=true' : ''
  return req<ScheduleItem[]>(`/schedules${qs}`)
}

export async function updateSchedule(
  id: number,
  fields: Partial<Pick<ScheduleItem, 'active' | 'interval_days' | 'next_due' | 'treatment'>>
): Promise<void> {
  await req(`/schedules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
}

export async function createSchedule(input: {
  treatment: string
  interval_days: number
  plant_id?: number | null
  start_date?: string
  notes?: string
}): Promise<ScheduleItem> {
  return req<ScheduleItem>('/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function applySchedule(
  id: number,
  force = false
): Promise<{ ok?: boolean; error?: string; warning?: string; conflict_with?: number }> {
  const res = await fetch(`${BASE}/schedules/${id}/apply${force ? '?force=true' : ''}`, {
    method: 'POST',
    credentials: 'include',
  })
  if (res.ok || res.status === 409) return res.json()
  const text = await res.text().catch(() => res.statusText)
  throw new Error(`${res.status}: ${text}`)
}

export async function deleteSchedule(id: number): Promise<void> {
  await req(`/schedules/${id}`, { method: 'DELETE' })
}

export async function createNeemBicarbTemplate(plantId?: number | null): Promise<void> {
  await req('/schedules/template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: 'neem-bicarb', plant_id: plantId ?? null }),
  })
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
  unit: string
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

export interface ChatPhoto {
  id: number
  caption: string
  base64: string
  mediaType: string
}

export interface ChatReply {
  reply: string
  photos: ChatPhoto[]
}

// Sends one chat turn for a plant and returns the reply plus any photos Claude chose to show.
export async function chatWithPlant(plantId: number, messages: ChatMessage[]): Promise<ChatReply> {
  const data = await req<{ reply: string; photos?: ChatPhoto[] }>(`/plants/${plantId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  return { reply: data.reply, photos: data.photos ?? [] }
}

// Sends one settings/management chat turn (supports plant editing tools server-side).
export async function chatWithSettings(messages: ChatMessage[]): Promise<ChatReply> {
  const data = await req<{ reply: string; photos?: ChatPhoto[] }>('/settings/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  return { reply: data.reply, photos: data.photos ?? [] }
}

// Sends one garden-wide chat turn and returns the reply plus any photos Claude chose to show.
export async function chatWithGarden(messages: ChatMessage[]): Promise<ChatReply> {
  const data = await req<{ reply: string; photos?: ChatPhoto[] }>('/garden/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  return { reply: data.reply, photos: data.photos ?? [] }
}

export interface GardenNote {
  id: number
  category: string
  body: string
  recorded_at?: string
}

// Summarizes a full conversation. Saves plant note (always) and garden note (if applicable).
export async function summarizeChat(
  plantId: number,
  messages: ChatMessage[]
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

export async function updateGardenNote(id: number, category: string, body: string): Promise<void> {
  await req(`/garden/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, body }),
  })
}

export async function deleteGardenNote(id: number): Promise<void> {
  await req(`/garden/notes/${id}`, { method: 'DELETE' })
}

// ── Sightings ─────────────────────────────────────────────────────────────────

export interface PlantNetCandidate {
  common_name: string
  scientific_name: string
  score: number
  image_url: string | null
}

export interface Sighting {
  id: number
  r2_key: string
  content_type: string
  lat: number | null
  lng: number | null
  location_label: string | null
  common_name: string | null
  scientific_name: string | null
  confidence: string | null
  features: string | null
  notes: string | null
  want_in_garden: number
  captured_at: string
  candidates: string | null // JSON array of PlantNetCandidate
}

export async function getSightings(): Promise<Sighting[]> {
  return req<Sighting[]>('/sightings')
}

export async function addSighting(
  file: File,
  lat: number | null,
  lng: number | null
): Promise<Sighting> {
  const form = new FormData()
  form.append('file', file)
  if (lat !== null) form.append('lat', String(lat))
  if (lng !== null) form.append('lng', String(lng))
  return req<Sighting>('/sightings', { method: 'POST', body: form })
}

export async function getSightingPhoto(id: number): Promise<{ base64: string; mediaType: string }> {
  return req(`/sightings/${id}/photo`)
}

export async function toggleWantInGarden(id: number, want: boolean): Promise<void> {
  await req(`/sightings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ want_in_garden: want }),
  })
}

export async function updateSightingId(
  id: number,
  common_name: string,
  scientific_name: string | null,
  confidence: string
): Promise<void> {
  await req(`/sightings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ common_name, scientific_name, confidence }),
  })
}

export async function chatSighting(
  id: number,
  messages: { role: string; content: string }[]
): Promise<{ reply: string }> {
  return req(`/sightings/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
}

export async function deleteSighting(id: number): Promise<void> {
  await req(`/sightings/${id}`, { method: 'DELETE' })
}

export interface PlantPhoto {
  id: number
  plant_id: number
  tier: string
  caption: string | null
  uploaded_at: string
  base64?: string
  content_type?: string
}

export async function getPlantPhotos(plantId: number, tier?: string): Promise<PlantPhoto[]> {
  const qs = tier ? `?tier=${tier}` : ''
  return req<PlantPhoto[]>(`/plants/${plantId}/photos${qs}`)
}

export async function getPhotoById(
  photoId: number
): Promise<PlantPhoto & { base64: string; content_type: string }> {
  return req(`/photos/${photoId}`)
}

// Uploads a photo via multipart/form-data.
export async function uploadPhoto(
  plantId: number,
  file: File,
  caption: string,
  tier = 'round',
  uploadedAt?: string
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

// ── Collections ───────────────────────────────────────────────────────────────

export async function getCollections(): Promise<Collection[]> {
  return req<Collection[]>('/collections')
}

export async function createCollection(input: {
  name: string
  description?: string
  indoor_outdoor?: 'indoor' | 'outdoor'
  sort_order?: number
}): Promise<Collection> {
  return req<Collection>('/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function updateCollection(
  id: number,
  fields: Partial<Pick<Collection, 'name' | 'description' | 'indoor_outdoor' | 'sort_order'>>
): Promise<void> {
  await req(`/collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
}

export async function deleteCollection(id: number): Promise<void> {
  await req(`/collections/${id}`, { method: 'DELETE' })
}
