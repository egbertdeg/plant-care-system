import { getUser, unauthorized } from '../../shared/auth'

interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  ANTHROPIC_API_KEY: string
  PLANTNET_API_KEY?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  imageData?: { base64: string; mediaType: string }
}

const CORS = {
  'Access-Control-Allow-Origin': 'https://plant-care-pwa.egbert-degroot.workers.dev',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runWeatherCron(env)
  },
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RAIN_EFFICIENCY = 0.4 // fraction of rainfall that reaches pot soil (canopy deflects ~60%)
const DEFAULT_ET0_BUDGET = 25 // mm cumulative ET0 before watering needed (~5-7 days in summer)
const DEFAULT_MIN_MOISTURE = 3.0
const PERSISTENCE_DAYS = 30 // how many days to extrapolate beyond the forecast window
const MAX_MOISTURE = 10 // field capacity reading right after watering

type WeatherRow = { date: string; et0_mm: number; precip_mm: number; is_forecast: number }

// Compute current soil deficit and forecast, anchoring from a moisture reading if one exists
// after the last watering. Returns soilDeficit, anchor info, and forecast date.
function computeDeficit(
  weatherRows: WeatherRow[],
  lastWatered: string,
  moistureAnchor: { moisture: number; moisture_at: string } | null,
  budget: number,
  minMoisture: number,
  today: string
): {
  soilDeficit: number
  anchorDate: string | null
  anchorMoisture: number | null
  forecastNextDue: string | null
  daysUntilDue: number | null
} {
  let soilDeficit: number
  let anchorDate: string | null = null
  let anchorMoisture: number | null = null

  if (moistureAnchor && moistureAnchor.moisture_at > lastWatered) {
    // Anchor from fresh moisture reading: convert reading → implied deficit, then add ET0 since
    const implied = Math.max(
      0,
      ((MAX_MOISTURE - moistureAnchor.moisture) / (MAX_MOISTURE - minMoisture)) * budget
    )
    const etSince = weatherRows
      .filter((w) => w.is_forecast === 0 && w.date > moistureAnchor.moisture_at)
      .reduce((s, w) => s + Math.max(0, w.et0_mm - w.precip_mm * RAIN_EFFICIENCY), 0)
    soilDeficit = implied + etSince
    anchorDate = moistureAnchor.moisture_at
    anchorMoisture = moistureAnchor.moisture
  } else {
    soilDeficit = weatherRows
      .filter((w) => w.is_forecast === 0 && w.date > lastWatered)
      .reduce((s, w) => s + Math.max(0, w.et0_mm - w.precip_mm * RAIN_EFFICIENCY), 0)
  }

  let forecastNextDue: string | null = null
  let daysUntilDue: number | null = null

  if (soilDeficit >= budget) {
    daysUntilDue = Math.min(0, Math.floor((soilDeficit - budget) / (budget / 7)) * -1)
  } else {
    let accumulated = soilDeficit
    const forecasts = weatherRows.filter((w) => w.is_forecast === 1 && w.date >= today)
    for (const fw of forecasts) {
      accumulated += Math.max(0, fw.et0_mm - fw.precip_mm * RAIN_EFFICIENCY)
      if (accumulated >= budget) {
        forecastNextDue = fw.date
        daysUntilDue = Math.round(
          (new Date(fw.date).getTime() - new Date(today).getTime()) / 86400000
        )
        break
      }
    }
    if (!forecastNextDue) {
      const forecastTail = forecasts.slice(-7)
      const persistenceSrc =
        forecastTail.length >= 3
          ? forecastTail
          : weatherRows.filter((w) => w.is_forecast === 0).slice(-7)
      const avgDraw =
        persistenceSrc.length > 0
          ? persistenceSrc.reduce(
              (s, w) => s + Math.max(0, w.et0_mm - w.precip_mm * RAIN_EFFICIENCY),
              0
            ) / persistenceSrc.length
          : DEFAULT_ET0_BUDGET / 7
      if (avgDraw > 0) {
        const lastForecastDate = forecasts.length > 0 ? forecasts[forecasts.length - 1].date : today
        const remaining = budget - accumulated
        const extraDays = Math.ceil(remaining / avgDraw)
        const base = new Date(lastForecastDate + 'T12:00:00')
        base.setDate(base.getDate() + extraDays)
        forecastNextDue = base.toISOString().split('T')[0]
        daysUntilDue = Math.round((base.getTime() - new Date(today).getTime()) / 86400000)
        if (daysUntilDue > PERSISTENCE_DAYS) {
          forecastNextDue = null
          daysUntilDue = null
        }
      }
    }
  }

  return { soilDeficit, anchorDate, anchorMoisture, forecastNextDue, daysUntilDue }
}

// ── Weather cron ──────────────────────────────────────────────────────────────

interface OpenMeteoDaily {
  time: string[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  precipitation_sum: number[]
  relative_humidity_2m_mean: number[]
  et0_fao_evapotranspiration: number[]
}

async function runWeatherCron(env: Env): Promise<void> {
  const LAT = '40.6782'
  const LON = '-73.9442'

  // Single call: yesterday's actuals + 3-day forecast
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', LAT)
  url.searchParams.set('longitude', LON)
  url.searchParams.set(
    'daily',
    [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'relative_humidity_2m_mean',
      'et0_fao_evapotranspiration',
    ].join(',')
  )
  url.searchParams.set('timezone', 'America/New_York')
  url.searchParams.set('past_days', '1')
  url.searchParams.set('forecast_days', '16')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)
  const data = (await res.json()) as { daily: OpenMeteoDaily }
  const d = data.daily

  // yesterday (index 0) = actual; today+2 (indices 1-3) = forecast
  for (let i = 0; i < d.time.length; i++) {
    const isForecast = i > 0 ? 1 : 0
    const tmax = d.temperature_2m_max[i]
    const tmin = d.temperature_2m_min[i]
    const gdd = Math.max(0, (tmax + tmin) / 2 - 10)
    await env.DB.prepare(
      `
      INSERT OR REPLACE INTO weather_daily
        (date, max_temp_c, min_temp_c, precip_mm, humidity_pct, et0_mm, gdd, is_forecast)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
      .bind(
        d.time[i],
        tmax,
        tmin,
        d.precipitation_sum[i],
        Math.round(d.relative_humidity_2m_mean[i]),
        d.et0_fao_evapotranspiration[i],
        Math.round(gdd * 10) / 10,
        isForecast
      )
      .run()
  }
}

interface PlantNetCandidate {
  common_name: string
  scientific_name: string
  score: number
  image_url: string | null
}

interface PlantNetResult {
  text: string
  candidates: PlantNetCandidate[]
}

async function callPlantNet(
  base64: string,
  mediaType: string,
  apiKey: string
): Promise<PlantNetResult | null> {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mediaType })
    const form = new FormData()
    form.append('images', blob, 'photo.jpg')
    form.append('organs', 'auto')

    const res = await fetch(
      `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&nb-results=5&lang=en`,
      { method: 'POST', body: form }
    )
    if (!res.ok) return null

    const data = (await res.json()) as {
      results: Array<{
        score: number
        species: { scientificNameWithoutAuthor: string; commonNames: string[] }
        images: Array<{ url: { s: string; m: string; o: string } }>
      }>
    }
    if (!data.results?.length) return null

    const candidates: PlantNetCandidate[] = data.results.slice(0, 5).map((r) => ({
      common_name: r.species.commonNames[0] ?? r.species.scientificNameWithoutAuthor,
      scientific_name: r.species.scientificNameWithoutAuthor,
      score: Math.round(r.score * 100),
      image_url: r.images?.[0]?.url?.m ?? r.images?.[0]?.url?.s ?? null,
    }))
    console.log('PlantNet candidates:', JSON.stringify(candidates.map((c) => ({ name: c.common_name, image_url: c.image_url }))))

    const lines = candidates.map(
      (c, i) => `${i + 1}. ${c.common_name} (${c.scientific_name}) — ${c.score}%`
    )
    return { text: `PlantNet analysis:\n${lines.join('\n')}`, candidates }
  } catch {
    return null
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {}
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0]) as Record<string, unknown>
    } catch {}
  }
  return null
}

// Copies an existing plant photo into the hero slot, replacing any current hero.
// The source photo is left in place so it remains visible in the timeline feed.
async function copyAsHero(
  env: Env,
  plantId: number,
  userId: string,
  photoId: number
): Promise<string> {
  const src = (await env.DB.prepare(
    'SELECT r2_key, filename, content_type, caption, tier FROM plant_photos WHERE id = ? AND plant_id = ? AND user_id = ?'
  )
    .bind(photoId, plantId, userId)
    .first()) as {
    r2_key: string
    filename: string
    content_type: string
    caption: string | null
    tier: string
  } | null
  if (!src) return `Error: photo ${photoId} not found`
  if (src.tier === 'hero') return `Photo ${photoId} is already the hero`

  const obj = await env.PHOTOS.get(src.r2_key)
  if (!obj) return `Error: source photo ${photoId} R2 object missing`
  const buf = await obj.arrayBuffer()

  const ext = (src.filename.split('.').pop() || 'jpg').toLowerCase()
  const heroKey = `plants/${plantId}/hero.${ext}`

  const existing = (await env.DB.prepare(
    "SELECT r2_key FROM plant_photos WHERE plant_id = ? AND user_id = ? AND tier = 'hero'"
  )
    .bind(plantId, userId)
    .first()) as { r2_key: string } | null
  if (existing) {
    await env.PHOTOS.delete(existing.r2_key)
    await env.DB.prepare(
      "DELETE FROM plant_photos WHERE plant_id = ? AND user_id = ? AND tier = 'hero'"
    )
      .bind(plantId, userId)
      .run()
  }

  await env.PHOTOS.put(heroKey, buf, {
    httpMetadata: { contentType: src.content_type },
  })

  await env.DB.prepare(
    `INSERT INTO plant_photos (plant_id, user_id, r2_key, filename, content_type, caption, tier, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, 'hero', datetime('now'))`
  )
    .bind(plantId, userId, heroKey, src.filename, src.content_type, src.caption ?? '')
    .run()

  return `Copied photo ${photoId} as the new hero. Original is still in the photo feed.`
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  let userId: string
  try {
    userId = await getUser(request)
  } catch {
    return unauthorized()
  }

  const url = new URL(request.url)
  const { pathname } = url
  const method = request.method

  // GET /plants — returns top-level plants only (parent_id IS NULL) by default
  if (method === 'GET' && pathname === '/plants') {
    const includeAll = url.searchParams.get('include_children') === 'true'
    const query = includeAll
      ? 'SELECT * FROM plants WHERE user_id = ? ORDER BY id'
      : 'SELECT * FROM plants WHERE user_id = ? AND parent_id IS NULL ORDER BY id'
    const { results } = await env.DB.prepare(query).bind(userId).all()
    return json(results)
  }

  // POST /plants — create a new plant or planter slot
  if (method === 'POST' && pathname === '/plants') {
    const body = (await request.json()) as {
      name?: string
      label?: string
      short_name?: string
      species?: string
      location?: string
      indoor_outdoor?: string
      notes?: string
      parent_id?: number | null
      slot_number?: number | null
    }
    if (!body.name?.trim()) return err('name is required')
    const row = await env.DB.prepare(
      `INSERT INTO plants (name, label, short_name, species, location, indoor_outdoor, notes, user_id, parent_id, slot_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       RETURNING *`
    )
      .bind(
        body.name.trim(),
        body.label?.trim() || null,
        body.short_name?.trim() || null,
        body.species?.trim() || null,
        body.location?.trim() || null,
        body.indoor_outdoor ?? 'outdoor',
        body.notes?.trim() || null,
        userId,
        body.parent_id ?? null,
        body.slot_number ?? null
      )
      .first()
    return json(row, 201)
  }

  // GET /plants/:id  PUT /plants/:id
  const plantMatch = pathname.match(/^\/plants\/(\d+)$/)
  if (plantMatch) {
    const id = Number(plantMatch[1])

    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM plants WHERE id = ? AND user_id = ?')
        .bind(id, userId)
        .first() as Record<string, unknown> | null
      if (!row) return err('Not found', 404)
      // If this is a planter (has children), attach them sorted by slot_number
      const children = await env.DB.prepare(
        'SELECT * FROM plants WHERE parent_id = ? AND user_id = ? ORDER BY slot_number ASC, id ASC'
      ).bind(id, userId).all()
      if (children.results.length > 0) {
        return json({ ...row, children: children.results })
      }
      return json(row)
    }

    if (method === 'PUT') {
      const body = (await request.json()) as Record<string, unknown>
      const fields = Object.keys(body).filter((k) => k !== 'id')
      if (fields.length === 0) return err('No fields to update')
      // Auto-sync short_name when name changes and short_name isn't explicitly provided
      if ('name' in body && !('short_name' in body) && typeof body.name === 'string') {
        body.short_name = body.name.split(' ')[0]
        fields.push('short_name')
      }
      const set = fields.map((f) => `${f} = ?`).join(', ')
      const vals = fields.map((f) => body[f])
      await env.DB.prepare(`UPDATE plants SET ${set} WHERE id = ? AND user_id = ?`)
        .bind(...vals, id, userId)
        .run()
      return json({ ok: true })
    }
  }

  // POST /plants/:id/notes — atomic append
  const notesMatch = pathname.match(/^\/plants\/(\d+)\/notes$/)
  if (notesMatch && method === 'POST') {
    const id = Number(notesMatch[1])
    const { note } = (await request.json()) as { note: string }
    if (!note?.trim()) return err('note is required')
    await env.DB.prepare(
      `
        UPDATE plants
        SET notes = CASE
          WHEN notes IS NULL OR notes = '' THEN ?
          ELSE notes || char(10) || ?
        END
        WHERE id = ? AND user_id = ?
      `
    )
      .bind(note, note, id, userId)
      .run()
    return json({ ok: true })
  }

  // GET /plants/:id/care  POST /plants/:id/care
  const careMatch = pathname.match(/^\/plants\/(\d+)\/care$/)
  if (careMatch) {
    const id = Number(careMatch[1])

    if (method === 'GET') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
      const { results } = await env.DB.prepare(
        'SELECT * FROM care_events WHERE plant_id = ? AND user_id = ? ORDER BY recorded_at DESC LIMIT ?'
      )
        .bind(id, userId, limit)
        .all()
      return json(results)
    }

    if (method === 'POST') {
      const body = (await request.json()) as {
        watered: boolean
        volume_ml?: number | null
        fertilizer?: 'liquid' | 'rose-tone' | null
        pruned?: boolean
        neem?: boolean
        potassium_bicarb?: boolean
        insecticidal_soap?: boolean
        notes?: string | null
      }

      const today = new Date().toISOString().split('T')[0]

      // EMA budget learning: when watering, estimate budget from completed cycle's ET0
      if (body.watered) {
        const [plantRow, prevWateringRow] = await Promise.all([
          env.DB.prepare(
            'SELECT et0_budget_mm, indoor_outdoor FROM plants WHERE id = ? AND user_id = ?'
          )
            .bind(id, userId)
            .first(),
          env.DB.prepare(
            'SELECT DATE(MAX(recorded_at)) as last_watered FROM care_events WHERE plant_id = ? AND user_id = ? AND watered = 1'
          )
            .bind(id, userId)
            .first(),
        ])
        const prevLW =
          (prevWateringRow as { last_watered: string | null } | null)?.last_watered ?? null
        const isIndoor =
          (plantRow as { indoor_outdoor: string } | null)?.indoor_outdoor === 'indoor'
        if (prevLW && !isIndoor) {
          const daysDiff = Math.round(
            (new Date(today + 'T12:00:00').getTime() - new Date(prevLW + 'T12:00:00').getTime()) /
              86400000
          )
          if (daysDiff >= 3) {
            const { results: etRows } = await env.DB.prepare(
              'SELECT et0_mm, precip_mm FROM weather_daily WHERE date > ? AND date <= ? AND is_forecast = 0'
            )
              .bind(prevLW, today)
              .all()
            const budgetEstimate = (etRows as { et0_mm: number; precip_mm: number }[]).reduce(
              (s, w) => s + Math.max(0, w.et0_mm - w.precip_mm * RAIN_EFFICIENCY),
              0
            )
            if (budgetEstimate >= 5 && budgetEstimate <= 150) {
              const currentBudget =
                (plantRow as { et0_budget_mm: number | null } | null)?.et0_budget_mm ??
                DEFAULT_ET0_BUDGET
              const newBudget = Math.round((0.7 * currentBudget + 0.3 * budgetEstimate) * 10) / 10
              await env.DB.prepare(
                'UPDATE plants SET et0_budget_mm = ? WHERE id = ? AND user_id = ?'
              )
                .bind(newBudget, id, userId)
                .run()
            }
          }
        }
      }

      await env.DB.prepare(
        `
        INSERT INTO care_events
          (plant_id, user_id, watered, volume_ml, fertilizer, pruned, neem, potassium_bicarb, insecticidal_soap, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
        .bind(
          id,
          userId,
          body.watered ? 1 : 0,
          body.watered ? (body.volume_ml ?? null) : null,
          body.fertilizer ?? null,
          body.pruned ? 1 : 0,
          body.neem ? 1 : 0,
          body.potassium_bicarb ? 1 : 0,
          body.insecticidal_soap ? 1 : 0,
          body.notes?.trim() || null
        )
        .run()

      // Auto-append a dated note to plants.notes
      const parts: string[] = []
      if (body.watered && body.volume_ml) parts.push(`${body.volume_ml}ml water`)
      else if (!body.watered) parts.push('no water')
      if (body.fertilizer === 'liquid') parts.push('liquid feed')
      if (body.fertilizer === 'rose-tone') parts.push('Rose-Tone')
      if (body.pruned) parts.push('pruned')
      if (body.neem) parts.push('neem oil')
      if (body.potassium_bicarb) parts.push('potassium bicarbonate')
      if (body.insecticidal_soap) parts.push('insecticidal soap')
      if (body.notes?.trim()) parts.push(body.notes.trim())

      let category = 'General'
      if (body.watered) category = 'Watering'
      else if (body.fertilizer && !body.pruned) category = 'Feeding'
      else if (!body.fertilizer && body.pruned) category = 'Pruning'
      else if (body.neem || body.potassium_bicarb || body.insecticidal_soap) category = 'Spray'

      const note = `[${today}] ${category}: ${parts.join(', ')}.`
      await env.DB.prepare(
        `
        UPDATE plants SET notes = CASE
          WHEN notes IS NULL OR notes = '' THEN ?
          ELSE notes || char(10) || ?
        END WHERE id = ? AND user_id = ?
      `
      )
        .bind(note, note, id, userId)
        .run()

      // Auto-advance matching treatment schedules
      const schedulesUpdated: number[] = []
      const advanceTreatment = async (treatment: string) => {
        const { results: scheds } = (await env.DB.prepare(
          `
          SELECT id, interval_days FROM treatment_schedules
          WHERE user_id = ? AND treatment = ? AND active = 1
            AND (plant_id = ? OR plant_id IS NULL)
        `
        )
          .bind(userId, treatment, id)
          .all()) as { results: { id: number; interval_days: number }[] }
        for (const s of scheds) {
          const due = new Date()
          due.setDate(due.getDate() + s.interval_days)
          const nextDue = due.toISOString().split('T')[0]
          await env.DB.prepare(
            `UPDATE treatment_schedules SET last_applied = ?, next_due = ? WHERE id = ?`
          )
            .bind(today, nextDue, s.id)
            .run()
          schedulesUpdated.push(s.id)
        }
      }
      if (body.neem) await advanceTreatment('neem')
      if (body.potassium_bicarb) await advanceTreatment('potassium-bicarb')

      return json({ ok: true, schedules_updated: schedulesUpdated }, 201)
    }
  }

  // GET /plants/:id/photos  POST /plants/:id/photos
  const photosMatch = pathname.match(/^\/plants\/(\d+)\/photos$/)
  if (photosMatch) {
    const id = Number(photosMatch[1])

    if (method === 'GET') {
      const tierFilter = url.searchParams.get('tier')
      const { results } = tierFilter
        ? await env.DB.prepare(
            'SELECT * FROM plant_photos WHERE plant_id = ? AND tier = ? AND user_id = ? ORDER BY uploaded_at DESC'
          )
            .bind(id, tierFilter, userId)
            .all()
        : await env.DB.prepare(
            'SELECT * FROM plant_photos WHERE plant_id = ? AND user_id = ? ORDER BY uploaded_at DESC'
          )
            .bind(id, userId)
            .all()
      return json(results)
    }

    if (method === 'POST') {
      const form = await request.formData()
      const file = form.get('file') as File | null
      const caption = (form.get('caption') as string | null) ?? ''
      const tier = (form.get('tier') as string | null) ?? 'round'
      const uploadedAt = (form.get('uploaded_at') as string | null) ?? null

      if (!file) return err('file is required')

      const ext = file.name.split('.').pop() ?? 'jpg'
      const contentType = file.type || 'image/jpeg'
      const r2Key =
        tier === 'hero' ? `plants/${id}/hero.${ext}` : `plants/${id}/${Date.now()}.${ext}`

      // Hero: replace existing hero in R2 + DB before inserting new one
      if (tier === 'hero') {
        const existing = await env.DB.prepare(
          'SELECT r2_key FROM plant_photos WHERE plant_id = ? AND tier = ? AND user_id = ?'
        )
          .bind(id, 'hero', userId)
          .first()
        if (existing) {
          await env.PHOTOS.delete(existing.r2_key as string)
          await env.DB.prepare(
            'DELETE FROM plant_photos WHERE plant_id = ? AND tier = ? AND user_id = ?'
          )
            .bind(id, 'hero', userId)
            .run()
        }
      }

      await env.PHOTOS.put(r2Key, await file.arrayBuffer(), {
        httpMetadata: { contentType },
      })

      await env.DB.prepare(
        `
          INSERT INTO plant_photos (plant_id, user_id, r2_key, filename, content_type, caption, tier, uploaded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `
      )
        .bind(id, userId, r2Key, file.name, contentType, caption, tier, uploadedAt)
        .run()

      return json({ ok: true, r2_key: r2Key }, 201)
    }
  }

  // DELETE /plants/:id/photos/:photoId
  const photoDeleteMatch = pathname.match(/^\/plants\/(\d+)\/photos\/(\d+)$/)
  if (photoDeleteMatch && method === 'DELETE') {
    const photoId = Number(photoDeleteMatch[2])
    await env.DB.prepare('DELETE FROM plant_photos WHERE id = ? AND user_id = ?')
      .bind(photoId, userId)
      .run()
    return json({ ok: true })
  }

  // GET /photos/:id — fetch photo from R2, return base64 + metadata
  const photoGetMatch = pathname.match(/^\/photos\/(\d+)$/)
  if (photoGetMatch && method === 'GET') {
    const photoId = Number(photoGetMatch[1])
    const row = (await env.DB.prepare('SELECT * FROM plant_photos WHERE id = ? AND user_id = ?')
      .bind(photoId, userId)
      .first()) as Record<string, unknown> | null
    if (!row) return err('Photo not found', 404)

    const obj = await env.PHOTOS.get(row.r2_key as string)
    if (!obj) return err('Photo data not found in storage', 404)

    const bytes = new Uint8Array(await obj.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    }
    const base64 = btoa(binary)

    return json({
      id: row.id,
      plant_id: row.plant_id,
      filename: row.filename,
      content_type: row.content_type,
      caption: row.caption,
      tier: row.tier,
      uploaded_at: row.uploaded_at,
      base64,
    })
  }

  // GET /plants/needs-water
  if (method === 'GET' && pathname === '/plants/needs-water') {
    const { results } = await env.DB.prepare(
      `
        SELECT DISTINCT mr.plant_id
        FROM manual_readings mr
        WHERE mr.type = 'moisture'
          AND mr.value <= 3
          AND mr.user_id = ?
          AND mr.recorded_at >= datetime('now', '-24 hours')
          AND NOT EXISTS (
            SELECT 1 FROM care_events ce
            WHERE ce.plant_id = mr.plant_id
              AND ce.user_id = ?
              AND ce.watered = 1
              AND ce.recorded_at > mr.recorded_at
          )
      `
    )
      .bind(userId, userId)
      .all()
    return json(results.map((r: Record<string, unknown>) => r.plant_id))
  }

  // DELETE /plants/:id/readings/:readingId
  const readingDeleteMatch = pathname.match(/^\/plants\/(\d+)\/readings\/(\d+)$/)
  if (readingDeleteMatch && method === 'DELETE') {
    const plantId = Number(readingDeleteMatch[1])
    const readingId = Number(readingDeleteMatch[2])
    const { meta } = await env.DB.prepare(
      'DELETE FROM manual_readings WHERE id = ? AND plant_id = ? AND user_id = ?'
    )
      .bind(readingId, plantId, userId)
      .run()
    if (meta.changes === 0) return err('Not found', 404)
    return json({ ok: true })
  }

  // GET /plants/:id/readings  POST /plants/:id/readings
  const readingsMatch = pathname.match(/^\/plants\/(\d+)\/readings$/)
  if (readingsMatch) {
    const id = Number(readingsMatch[1])

    if (method === 'GET') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
      const { results } = await env.DB.prepare(
        'SELECT * FROM manual_readings WHERE plant_id = ? AND user_id = ? ORDER BY recorded_at DESC LIMIT ?'
      )
        .bind(id, userId, limit)
        .all()
      return json(results)
    }

    if (method === 'POST') {
      const body = (await request.json()) as {
        type: string
        value: number
        unit?: string
        recorded_at?: string
      }
      if (!body.type || body.value === undefined) return err('type and value are required')
      await env.DB.prepare(
        `
          INSERT INTO manual_readings (plant_id, user_id, type, value, unit, recorded_at)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `
      )
        .bind(id, userId, body.type, body.value, body.unit ?? '', body.recorded_at ?? null)
        .run()
      return json({ ok: true }, 201)
    }
  }

  // ── Collections ───────────────────────────────────────────────────────────

  // GET /collections  POST /collections
  if (pathname === '/collections') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM collections WHERE user_id = ? ORDER BY sort_order, id'
      ).bind(userId).all()
      return json(results)
    }
    if (method === 'POST') {
      const body = (await request.json()) as {
        name: string
        description?: string
        indoor_outdoor?: string
        sort_order?: number
      }
      if (!body.name?.trim()) return err('name required')
      const row = await env.DB.prepare(
        `INSERT INTO collections (user_id, name, description, indoor_outdoor, sort_order)
         VALUES (?, ?, ?, ?, ?) RETURNING *`
      ).bind(
        userId,
        body.name.trim(),
        body.description ?? null,
        body.indoor_outdoor ?? 'outdoor',
        body.sort_order ?? 0
      ).first()
      return json(row, 201)
    }
  }

  // PUT /collections/:id  DELETE /collections/:id
  const collectionMatch = pathname.match(/^\/collections\/(\d+)$/)
  if (collectionMatch) {
    const id = Number(collectionMatch[1])
    if (method === 'PUT') {
      const body = (await request.json()) as Record<string, unknown>
      const fields = Object.keys(body).filter((k) => ['name', 'description', 'indoor_outdoor', 'sort_order'].includes(k))
      if (fields.length === 0) return err('no valid fields to update')
      const set = fields.map((f) => `${f} = ?`).join(', ')
      const vals = fields.map((f) => body[f])
      await env.DB.prepare(`UPDATE collections SET ${set} WHERE id = ? AND user_id = ?`)
        .bind(...vals, id, userId).run()
      return json({ ok: true })
    }
    if (method === 'DELETE') {
      await env.DB.prepare('UPDATE plants SET collection_id = NULL WHERE collection_id = ? AND user_id = ?')
        .bind(id, userId).run()
      await env.DB.prepare('DELETE FROM collections WHERE id = ? AND user_id = ?')
        .bind(id, userId).run()
      return json({ ok: true })
    }
  }

  // GET /garden/notes  POST /garden/notes
  if (pathname === '/garden/notes') {
    if (method === 'GET') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
      const category = url.searchParams.get('category')
      const { results } = category
        ? await env.DB.prepare(
            'SELECT * FROM garden_notes WHERE user_id = ? AND category = ? ORDER BY recorded_at DESC LIMIT ?'
          )
            .bind(userId, category, limit)
            .all()
        : await env.DB.prepare(
            'SELECT * FROM garden_notes WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?'
          )
            .bind(userId, limit)
            .all()
      return json(results)
    }
    if (method === 'POST') {
      const { category, body } = (await request.json()) as { category: string; body: string }
      if (!category?.trim() || !body?.trim()) return err('category and body are required')
      await env.DB.prepare('INSERT INTO garden_notes (user_id, category, body) VALUES (?, ?, ?)')
        .bind(userId, category.trim(), body.trim())
        .run()
      return json({ ok: true }, 201)
    }
  }

  // PUT /garden/notes/:id  DELETE /garden/notes/:id
  const gardenNoteMatch = pathname.match(/^\/garden\/notes\/(\d+)$/)
  if (gardenNoteMatch) {
    const noteId = Number(gardenNoteMatch[1])
    if (method === 'PUT') {
      const { category, body } = (await request.json()) as { category?: string; body?: string }
      if (!body?.trim()) return err('body is required')
      await env.DB.prepare(
        'UPDATE garden_notes SET category = COALESCE(?, category), body = ? WHERE id = ? AND user_id = ?'
      )
        .bind(category?.trim() ?? null, body.trim(), noteId, userId)
        .run()
      return json({ ok: true })
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM garden_notes WHERE id = ? AND user_id = ?')
        .bind(noteId, userId)
        .run()
      return json({ ok: true })
    }
  }

  // POST /garden/chat
  if (pathname === '/garden/chat' && method === 'POST') {
    const { messages } = (await request.json()) as { messages: ChatMessage[] }
    if (!Array.isArray(messages)) return err('messages array required')

    const [plantsRes, gardenNotesRes, photosRes, readingsRes] = await Promise.all([
      env.DB.prepare(
        `SELECT p.id, p.name, p.label, p.short_name, p.species, p.location, p.indoor_outdoor, p.notes,
                c.name as collection_name
         FROM plants p LEFT JOIN collections c ON p.collection_id = c.id
         WHERE p.user_id = ? ORDER BY p.id`
      )
        .bind(userId)
        .all() as Promise<{ results: Record<string, unknown>[] }>,
      env.DB.prepare(
        'SELECT category, body FROM garden_notes WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 20'
      )
        .bind(userId)
        .all() as Promise<{ results: Record<string, unknown>[] }>,
      env.DB.prepare(
        'SELECT id, plant_id, tier, caption, uploaded_at FROM plant_photos WHERE user_id = ? ORDER BY uploaded_at DESC LIMIT 40'
      )
        .bind(userId)
        .all() as Promise<{ results: Record<string, unknown>[] }>,
      env.DB.prepare(
        'SELECT plant_id, type, value, recorded_at FROM manual_readings WHERE user_id = ? AND recorded_at > datetime("now", "-7 days") ORDER BY recorded_at DESC'
      )
        .bind(userId)
        .all() as Promise<{ results: Record<string, unknown>[] }>,
    ])

    const plantLabels: Record<number, string> = Object.fromEntries(
      plantsRes.results.map((p) => [p.id as number, (p.label as string | null) ?? `Plant ${p.id}`])
    )

    const plantContext = plantsRes.results
      .map((p) => {
        const label = plantLabels[p.id as number] ?? `Plant ${p.id}`
        const collection = p.collection_name ? ` [${p.collection_name}]` : ''
        const notesSnippet =
          typeof p.notes === 'string' && p.notes.trim()
            ? p.notes.trim().split('\n').slice(-3).join('\n')
            : 'No notes.'
        return `${label} — ${p.name}${collection}:\n${notesSnippet}`
      })
      .join('\n\n')

    const latestMoisture = readingsRes.results
      .filter((r) => r.type === 'moisture')
      .reduce(
        (acc, r) => {
          const pid = r.plant_id as number
          if (!acc[pid]) acc[pid] = r
          return acc
        },
        {} as Record<number, Record<string, unknown>>
      )
    const moistureLines =
      Object.entries(latestMoisture)
        .map(
          ([pid, r]) =>
            `${plantLabels[Number(pid)] ?? pid}: moisture ${(r as Record<string, unknown>).value} (${String((r as Record<string, unknown>).recorded_at).split('T')[0]})`
        )
        .join('\n') || 'No recent moisture readings.'

    const gardenContext =
      gardenNotesRes.results.length > 0
        ? gardenNotesRes.results.map((n) => `[${n.category}]\n${n.body}`).join('\n\n---\n\n')
        : 'No garden notes yet.'

    const photoInventory =
      photosRes.results.length > 0
        ? 'Photo library (use [SHOW_PHOTO:id] to display any photo):\n' +
          photosRes.results
            .map(
              (p) =>
                `  ID ${p.id} | ${plantLabels[p.plant_id as number] ?? `plant ${p.plant_id}`} | ${p.tier} | ${p.caption || 'no caption'} | ${String(p.uploaded_at).split('T')[0]}`
            )
            .join('\n')
        : 'No photos on file.'

    const plantListForTools = plantsRes.results
      .map(
        (p) =>
          `ID ${p.id}: "${p.name}" | label: ${p.label ?? '—'} | species: ${p.species ?? '—'} | location: ${p.location ?? '—'} | ${p.indoor_outdoor}`
      )
      .join('\n')

    const systemPrompt = `You are a helpful assistant for a gardener with a container garden.

You have full context on all plants, the garden knowledge base, recent moisture readings, and a photo library. Chat freely about anything — plant care, diagnosis, planning, whatever is useful. Keep replies concise; this is used on a mobile device outdoors.

You can also manage plant records and the garden knowledge base using tools: rename plants, update species/location, delete photos, set hero photos, and add garden-wide notes. Make changes immediately when asked and confirm what you changed.

IMPORTANT: You CAN display photos. When asked to show a photo, use [SHOW_PHOTO:id] with the exact numeric ID — the app renders it inline. Never say you cannot show photos.

All plants:
${plantContext}

Recent moisture readings (last 7 days):
${moistureLines}

${photoInventory}

Garden-wide knowledge:
${gardenContext}`

    const gardenTools = [
      {
        name: 'update_plant',
        description: 'Update a field on a plant record',
        input_schema: {
          type: 'object' as const,
          properties: {
            plant_id: { type: 'number', description: 'The plant ID' },
            field: {
              type: 'string',
              enum: [
                'name',
                'short_name',
                'species',
                'location',
                'indoor_outdoor',
                'notes',
              ],
              description: 'The field to update',
            },
            value: { type: 'string', description: 'New value. Empty string to clear.' },
          },
          required: ['plant_id', 'field', 'value'],
        },
      },
      {
        name: 'list_photos',
        description: 'List all photos for a specific plant',
        input_schema: {
          type: 'object' as const,
          properties: {
            plant_id: { type: 'number', description: 'The plant ID' },
          },
          required: ['plant_id'],
        },
      },
      {
        name: 'delete_photo',
        description: 'Permanently delete a photo by ID',
        input_schema: {
          type: 'object' as const,
          properties: {
            photo_id: { type: 'number', description: 'The photo ID to delete' },
          },
          required: ['photo_id'],
        },
      },
      {
        name: 'set_hero_photo',
        description:
          'Set a photo as the hero (main display) for its plant. Copies the photo into the hero slot and replaces any existing hero — the original stays in the photo feed so it remains visible in the timeline. Safe to use on a real plant photo without losing it from the feed.',
        input_schema: {
          type: 'object' as const,
          properties: {
            photo_id: { type: 'number', description: 'The photo ID to set as hero' },
          },
          required: ['photo_id'],
        },
      },
      {
        name: 'add_garden_note',
        description: 'Add a note to the garden-wide knowledge base. Use a collection name (e.g. "Roses", "Tree Pit") as category for collection-specific notes, "outdoor" or "indoor" for general location notes, or "general" for garden-wide notes.',
        input_schema: {
          type: 'object' as const,
          properties: {
            category: { type: 'string', description: 'Category: collection name, "outdoor", "indoor", or "general"' },
            body: { type: 'string', description: 'The note content' },
          },
          required: ['category', 'body'],
        },
      },
    ]

    type GardenToolBlock = {
      type: string
      id?: string
      name?: string
      input?: Record<string, unknown>
      text?: string
    }

    const executeGardenTool = async (
      name: string,
      input: Record<string, unknown>
    ): Promise<string> => {
      const ALLOWED = [
        'name',
        'short_name',
        'species',
        'location',
        'indoor_outdoor',
        'notes',
      ]
      try {
        if (name === 'update_plant') {
          const { plant_id, field, value } = input as {
            plant_id: number
            field: string
            value: string
          }
          if (!ALLOWED.includes(field)) return `Error: unknown field "${field}"`
          const found = await env.DB.prepare('SELECT id FROM plants WHERE id = ? AND user_id = ?')
            .bind(plant_id, userId)
            .first()
          if (!found) return `Error: plant ${plant_id} not found`
          await env.DB.prepare(
            `UPDATE plants SET ${field} = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
          )
            .bind(value || null, plant_id, userId)
            .run()
          // When name changes, keep short_name in sync (use first word of new name)
          if (field === 'name' && value) {
            const short = value.split(' ')[0]
            await env.DB.prepare(
              `UPDATE plants SET short_name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
            )
              .bind(short, plant_id, userId)
              .run()
          }
          return `Updated plant ${plant_id} ${field} → "${value}"`
        }
        if (name === 'list_photos') {
          const { plant_id } = input as { plant_id: number }
          const { results } = await env.DB.prepare(
            'SELECT id, tier, caption, uploaded_at FROM plant_photos WHERE plant_id = ? AND user_id = ? ORDER BY uploaded_at DESC'
          )
            .bind(plant_id, userId)
            .all()
          if (!results.length) return 'No photos for this plant.'
          return results
            .map(
              (p) =>
                `ID ${p.id} | ${p.tier} | ${p.caption || 'no caption'} | ${String(p.uploaded_at).split('T')[0]}`
            )
            .join('\n')
        }
        if (name === 'delete_photo') {
          const { photo_id } = input as { photo_id: number }
          const photo = (await env.DB.prepare(
            'SELECT r2_key FROM plant_photos WHERE id = ? AND user_id = ?'
          )
            .bind(photo_id, userId)
            .first()) as Record<string, unknown> | null
          if (!photo) return `Error: photo ${photo_id} not found`
          await env.PHOTOS.delete(photo.r2_key as string)
          await env.DB.prepare('DELETE FROM plant_photos WHERE id = ? AND user_id = ?')
            .bind(photo_id, userId)
            .run()
          return `Deleted photo ${photo_id}`
        }
        if (name === 'set_hero_photo') {
          const { photo_id } = input as { photo_id: number }
          const photo = (await env.DB.prepare(
            'SELECT plant_id FROM plant_photos WHERE id = ? AND user_id = ?'
          )
            .bind(photo_id, userId)
            .first()) as { plant_id: number } | null
          if (!photo) return `Error: photo ${photo_id} not found`
          return await copyAsHero(env, photo.plant_id, userId, photo_id)
        }
        if (name === 'add_garden_note') {
          const { category, body } = input as { category: string; body: string }
          if (!category?.trim() || !body?.trim()) return 'Error: category and body are required'
          await env.DB.prepare(
            `INSERT INTO garden_notes (user_id, category, body, recorded_at) VALUES (?, ?, ?, datetime('now'))`
          )
            .bind(userId, category.trim(), body.trim())
            .run()
          return `Added garden note in category "${category}"`
        }
        return `Unknown tool: ${name}`
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    }

    // suppress unused variable warning — included in system prompt indirectly via plantListForTools
    void plantListForTools

    const claudeMessages = messages.map((m: ChatMessage) => {
      if (m.imageData) {
        return {
          role: m.role,
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: m.imageData.mediaType,
                data: m.imageData.base64,
              },
            },
            { type: 'text', text: m.content },
          ],
        }
      }
      return { role: m.role, content: m.content }
    })

    const callGardenClaude = async (msgs: unknown[]) => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 768,
          system: systemPrompt,
          tools: gardenTools,
          messages: msgs,
        }),
      })
      if (!res.ok)
        throw new Error(`Claude API error: ${await res.text().catch(() => res.statusText)}`)
      return res.json() as Promise<{ content: GardenToolBlock[]; stop_reason: string }>
    }

    let gardenMsgs: unknown[] = claudeMessages
    let gardenData = await callGardenClaude(gardenMsgs)

    if (gardenData.stop_reason === 'tool_use') {
      const toolUseBlocks = gardenData.content.filter((b) => b.type === 'tool_use')
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (b) => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: await executeGardenTool(b.name!, b.input ?? {}),
        }))
      )
      gardenMsgs = [
        ...gardenMsgs,
        { role: 'assistant', content: gardenData.content },
        { role: 'user', content: toolResults },
      ]
      gardenData = await callGardenClaude(gardenMsgs)
    }

    const rawReply = gardenData.content.find((c) => c.type === 'text')?.text ?? ''

    const photoMarkerRe2 = /\[SHOW_PHOTO:(\d+)\]/g
    const requestedIds2 = new Set<number>()
    let match2: RegExpExecArray | null
    while ((match2 = photoMarkerRe2.exec(rawReply)) !== null) requestedIds2.add(Number(match2[1]))
    const reply2 = rawReply
      .replace(/\[SHOW_PHOTO:\d+\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    type PhotoResult2 = { id: number; caption: string; base64: string; mediaType: string }
    const resolvedPhotos2: PhotoResult2[] = []
    for (const photoId of requestedIds2) {
      const row = photosRes.results.find((p) => Number(p.id) === photoId)
      if (!row) continue
      const obj = await env.PHOTOS.get(row.r2_key as string)
      if (!obj) continue
      const bytes = new Uint8Array(await obj.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      resolvedPhotos2.push({
        id: photoId,
        caption: (row.caption as string) || '',
        base64: btoa(binary),
        mediaType: (row.content_type as string) || 'image/jpeg',
      })
    }

    return json({ reply: reply2, photos: resolvedPhotos2 })
  }

  // GET /sightings
  if (pathname === '/sightings' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM sightings WHERE user_id = ? ORDER BY captured_at DESC'
    )
      .bind(userId)
      .all()
    return json(results)
  }

  // POST /sightings
  if (pathname === '/sightings' && method === 'POST') {
    const form = await request.formData()
    const file = form.get('file') as File | null
    const lat = form.get('lat') ? parseFloat(form.get('lat') as string) : null
    const lng = form.get('lng') ? parseFloat(form.get('lng') as string) : null
    if (!file) return err('file is required')

    const contentType = file.type || 'image/jpeg'
    const ext = file.name?.split('.').pop() ?? 'jpg'
    const r2Key = `sightings/${Date.now()}.${ext}`

    const fileBuffer = await file.arrayBuffer()
    await env.PHOTOS.put(r2Key, fileBuffer, { httpMetadata: { contentType } })

    // Reverse geocode via Nominatim
    let locationLabel: string | null = null
    if (lat !== null && lng !== null) {
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'User-Agent': 'PlantCareApp/1.0 (egbert.degroot@gmail.com)' } }
        )
        if (geoRes.ok) {
          const geo = (await geoRes.json()) as Record<string, unknown>
          const addr = (geo.address ?? {}) as Record<string, string>
          const addrParts = [
            addr.road,
            addr.neighbourhood ?? addr.suburb ?? addr.city_district ?? addr.town ?? addr.city,
          ].filter(Boolean)
          locationLabel =
            addrParts.join(', ') || (geo.display_name as string)?.split(',')[0] || null
        }
      } catch {
        /* geolocation optional */
      }
    }

    // Build base64 for Claude
    const bytes = new Uint8Array(fileBuffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    const b64 = btoa(binary)

    // PlantNet first-pass ID (runs before Claude to give it a ranked shortlist)
    const plantNetResult = env.PLANTNET_API_KEY
      ? await callPlantNet(b64, contentType, env.PLANTNET_API_KEY)
      : null

    // Claude plant ID
    let commonName = 'Unknown plant',
      scientificName: string | null = null
    let confidence = 'Low',
      features = '',
      plantNotes = ''
    try {
      const identifyPrompt = plantNetResult?.text
        ? `${plantNetResult.text}\n\nNow identify this plant using both the photo and the PlantNet results above as a starting point. Reply with JSON only, no markdown:\n{"common_name":"best match common name","scientific_name":"species or null","confidence":"High|Medium|Low","features":"2-3 key visible features supporting this ID","uncertainty":"what is ambiguous or what additional angle would confirm","notes":"brief care notes relevant to a container garden"}`
        : `Identify the plant or flower in this photo. Reply with JSON only, no markdown:\n{"common_name":"best match common name","scientific_name":"species or null","confidence":"High|Medium|Low","features":"2-3 key visible features supporting this ID","uncertainty":"what is ambiguous or what additional angle would confirm","notes":"brief care notes relevant to a container garden"}`
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: contentType, data: b64 } },
                { type: 'text', text: identifyPrompt },
              ],
            },
          ],
        }),
      })
      if (claudeRes.ok) {
        const cd = (await claudeRes.json()) as { content: { type: string; text: string }[] }
        const raw = cd.content.find((c) => c.type === 'text')?.text ?? ''
        const parsed = extractJson(raw)
        if (parsed) {
          commonName = (parsed.common_name as string) || 'Unknown plant'
          scientificName = (parsed.scientific_name as string) || null
          confidence = (parsed.confidence as string) || 'Low'
          const uncertainty = parsed.uncertainty ? ` Uncertainty: ${parsed.uncertainty}` : ''
          features = (parsed.features as string) || ''
          plantNotes = ((parsed.notes as string) || '') + uncertainty
        }
      }
    } catch {
      /* ID optional — record still saved */
    }

    const candidatesJson = plantNetResult?.candidates
      ? JSON.stringify(plantNetResult.candidates)
      : null

    const row = await env.DB.prepare(
      `
        INSERT INTO sightings (user_id, r2_key, content_type, lat, lng, location_label, common_name, scientific_name, confidence, features, notes, candidates)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `
    )
      .bind(
        userId,
        r2Key,
        contentType,
        lat,
        lng,
        locationLabel,
        commonName,
        scientificName,
        confidence,
        features,
        plantNotes,
        candidatesJson
      )
      .first()

    return json(row, 201)
  }

  // GET /sightings/:id/photo
  const sightingPhotoMatch = pathname.match(/^\/sightings\/(\d+)\/photo$/)
  if (sightingPhotoMatch && method === 'GET') {
    const row = (await env.DB.prepare('SELECT * FROM sightings WHERE id = ? AND user_id = ?')
      .bind(Number(sightingPhotoMatch[1]), userId)
      .first()) as Record<string, unknown> | null
    if (!row) return err('Not found', 404)
    const obj = await env.PHOTOS.get(row.r2_key as string)
    if (!obj) return err('Photo not found', 404)
    const bytes = new Uint8Array(await obj.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return json({ base64: btoa(binary), mediaType: row.content_type as string })
  }

  // POST /sightings/:id/chat
  const sightingChatMatch = pathname.match(/^\/sightings\/(\d+)\/chat$/)
  if (sightingChatMatch && method === 'POST') {
    const sightingId = Number(sightingChatMatch[1])
    const { messages } = (await request.json()) as {
      messages: { role: string; content: string }[]
    }
    const sighting = (await env.DB.prepare(
      'SELECT * FROM sightings WHERE id = ? AND user_id = ?'
    )
      .bind(sightingId, userId)
      .first()) as Record<string, unknown> | null
    if (!sighting) return err('Not found', 404)

    const sys = `You are helping identify a plant from a photo taken around town. Current identification: ${sighting.common_name ?? 'Unknown'} (${sighting.scientific_name ?? '?'}), confidence: ${sighting.confidence ?? 'Low'}. Features noted: ${sighting.features ?? 'none'}. Notes: ${sighting.notes ?? 'none'}. Answer questions about the plant, suggest corrections if the user thinks the ID is wrong, and be concise.`

    // Attach photo to first user message only, and only if under 4MB (Claude's effective limit)
    const isFirstMessage = messages.filter((m) => m.role === 'user').length === 1
    let photoB64: string | null = null
    let mediaType = 'image/jpeg'
    if (isFirstMessage) {
      try {
        const photoObj = await env.PHOTOS.get(sighting.r2_key as string)
        if (photoObj) {
          const photoBytes = await photoObj.arrayBuffer()
          if (photoBytes.byteLength < 4 * 1024 * 1024) {
            const u8 = new Uint8Array(photoBytes)
            let bin = ''
            for (let i = 0; i < u8.length; i += 8192)
              bin += String.fromCharCode(...u8.subarray(i, i + 8192))
            photoB64 = btoa(bin)
            const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
            mediaType = supported.includes(sighting.content_type as string)
              ? (sighting.content_type as string)
              : 'image/jpeg'
          }
        }
      } catch {
        /* photo optional */
      }
    }

    const claudeMsgs = messages.map((m, i) => ({
      role: m.role,
      content:
        i === 0 && photoB64
          ? [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: photoB64 } },
              { type: 'text', text: m.content },
            ]
          : m.content,
    }))

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 512, system: sys, messages: claudeMsgs }),
    })
    if (!claudeRes.ok) {
      const errBody = await claudeRes.text().catch(() => '')
      console.error('Claude sighting chat error:', claudeRes.status, errBody)
      return err(`Claude error ${claudeRes.status}`)
    }
    const cd = (await claudeRes.json()) as { content: { type: string; text: string }[] }
    const reply = cd.content.find((c) => c.type === 'text')?.text ?? ''
    return json({ reply })
  }

  // PATCH /sightings/:id
  const sightingMatch = pathname.match(/^\/sightings\/(\d+)$/)
  if (sightingMatch && method === 'PATCH') {
    const body = (await request.json()) as {
      want_in_garden?: boolean
      common_name?: string
      scientific_name?: string
      confidence?: string
    }
    if (body.want_in_garden !== undefined) {
      await env.DB.prepare('UPDATE sightings SET want_in_garden = ? WHERE id = ? AND user_id = ?')
        .bind(body.want_in_garden ? 1 : 0, Number(sightingMatch[1]), userId)
        .run()
    } else {
      await env.DB.prepare(
        'UPDATE sightings SET common_name = ?, scientific_name = ?, confidence = ? WHERE id = ? AND user_id = ?'
      )
        .bind(
          body.common_name ?? null,
          body.scientific_name ?? null,
          body.confidence ?? 'Low',
          Number(sightingMatch[1]),
          userId
        )
        .run()
    }
    return json({ ok: true })
  }

  // DELETE /sightings/:id
  if (sightingMatch && method === 'DELETE') {
    const row = (await env.DB.prepare('SELECT r2_key FROM sightings WHERE id = ? AND user_id = ?')
      .bind(Number(sightingMatch[1]), userId)
      .first()) as Record<string, unknown> | null
    if (row) await env.PHOTOS.delete(row.r2_key as string)
    await env.DB.prepare('DELETE FROM sightings WHERE id = ? AND user_id = ?')
      .bind(Number(sightingMatch[1]), userId)
      .run()
    return json({ ok: true })
  }

  // POST /admin/migrate — idempotent schema migration
  if (method === 'POST' && pathname === '/admin/migrate') {
    await env.DB.prepare(
      `
        CREATE TABLE IF NOT EXISTS manual_readings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plant_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          value REAL NOT NULL,
          unit TEXT NOT NULL DEFAULT '',
          recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (plant_id) REFERENCES plants(id)
        )
      `
    ).run()
    await env.DB.prepare(
      `
        CREATE TABLE IF NOT EXISTS garden_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL DEFAULT 'General',
          body TEXT NOT NULL,
          recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `
    ).run()
    await env.DB.prepare(
      `
        CREATE TABLE IF NOT EXISTS care_events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          plant_id    INTEGER NOT NULL,
          watered     INTEGER NOT NULL DEFAULT 0,
          volume_ml   REAL,
          fertilizer  TEXT,
          pruned      INTEGER NOT NULL DEFAULT 0,
          notes       TEXT,
          recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (plant_id) REFERENCES plants(id)
        )
      `
    ).run()
    try {
      await env.DB.prepare(
        `ALTER TABLE plant_photos ADD COLUMN tier TEXT NOT NULL DEFAULT 'round'`
      ).run()
    } catch {
      /* column already exists */
    }
    await env.DB.prepare(
      `
        CREATE TABLE IF NOT EXISTS sightings (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          r2_key           TEXT NOT NULL,
          content_type     TEXT NOT NULL DEFAULT 'image/jpeg',
          lat              REAL,
          lng              REAL,
          location_label   TEXT,
          common_name      TEXT,
          scientific_name  TEXT,
          confidence       TEXT,
          features         TEXT,
          notes            TEXT,
          want_in_garden   INTEGER NOT NULL DEFAULT 0,
          captured_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `
    ).run()

    // Phase 3: add user_id to all user-owned tables
    const addUserId = async (table: string) => {
      try {
        await env.DB.prepare(
          `ALTER TABLE ${table} ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`
        ).run()
      } catch {
        /* column already exists */
      }
    }
    await addUserId('plants')
    await addUserId('care_events')
    await addUserId('manual_readings')
    await addUserId('garden_notes')
    await addUserId('plant_photos')
    await addUserId('sightings')

    // Backfill existing rows with the owner's email
    const MY_EMAIL = 'egbert.degroot@gmail.com'
    for (const t of [
      'plants',
      'care_events',
      'manual_readings',
      'garden_notes',
      'plant_photos',
      'sightings',
    ]) {
      await env.DB.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id = ''`).bind(MY_EMAIL).run()
    }

    // Indexes for query performance
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_plants_user ON plants(user_id)`).run()
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_care_events_user_plant ON care_events(user_id, plant_id)`
    ).run()
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_manual_readings_user_plant ON manual_readings(user_id, plant_id)`
    ).run()
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_garden_notes_user ON garden_notes(user_id)`
    ).run()
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_plant_photos_user_plant ON plant_photos(user_id, plant_id)`
    ).run()
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sightings_user ON sightings(user_id)`
    ).run()

    // weather_daily table (was previously only in a separate migration.sql, never run)
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS weather_daily (
        date         TEXT PRIMARY KEY,
        max_temp_c   REAL,
        min_temp_c   REAL,
        precip_mm    REAL,
        humidity_pct INTEGER,
        et0_mm       REAL,
        gdd          REAL,
        is_forecast  INTEGER NOT NULL DEFAULT 0,
        fetched_at   TEXT DEFAULT (datetime('now'))
      )
    `
    ).run()

    // Phase 5: watering intelligence + treatment scheduling columns
    const addCol = async (table: string, col: string, def: string) => {
      try {
        await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run()
      } catch {
        /* exists */
      }
    }
    await addCol('weather_daily', 'is_forecast', 'INTEGER NOT NULL DEFAULT 0')
    await addCol('plants', 'et0_budget_mm', 'REAL')
    await addCol('plants', 'min_moisture', 'REAL')
    await addCol('care_events', 'neem', 'INTEGER NOT NULL DEFAULT 0')
    await addCol('care_events', 'potassium_bicarb', 'INTEGER NOT NULL DEFAULT 0')
    await addCol('care_events', 'insecticidal_soap', 'INTEGER NOT NULL DEFAULT 0')
    await addCol('plants', 'parent_id', 'INTEGER')
    await addCol('plants', 'slot_number', 'INTEGER')

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS treatment_schedules (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       TEXT NOT NULL,
        plant_id      INTEGER,
        treatment     TEXT NOT NULL,
        interval_days INTEGER NOT NULL,
        last_applied  TEXT,
        next_due      TEXT,
        active        INTEGER NOT NULL DEFAULT 1,
        notes         TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
    ).run()
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_schedules_user ON treatment_schedules(user_id)`
    ).run()

    // Phase 4: add label + short_name columns to plants
    try {
      await env.DB.prepare(`ALTER TABLE plants ADD COLUMN label TEXT`).run()
    } catch {
      /* column already exists */
    }
    try {
      await env.DB.prepare(`ALTER TABLE plants ADD COLUMN short_name TEXT`).run()
    } catch {
      /* column already exists */
    }
    // Backfill Egbert's 10 roses with their label / short_name values
    const backfill: Array<{ id: number; label: string; short_name: string }> = [
      { id: 1, label: 'O1', short_name: 'Morden Blush' },
      { id: 2, label: 'O2', short_name: 'Double Delight' },
      { id: 3, label: 'O3', short_name: 'Snowcone' },
      { id: 4, label: 'O4', short_name: 'Campfire' },
      { id: 5, label: 'O5', short_name: 'Earth Angel' },
      { id: 6, label: 'O6', short_name: 'Yellow-White' },
      { id: 7, label: 'O7', short_name: 'Moondance' },
      { id: 8, label: 'O8', short_name: 'Bubblicious' },
      { id: 9, label: 'O9', short_name: 'Disneyland' },
      { id: 10, label: 'O10', short_name: 'Mardi Gras' },
    ]
    for (const row of backfill) {
      await env.DB.prepare(
        `UPDATE plants SET label = ?, short_name = ? WHERE id = ? AND (label IS NULL OR label = '')`
      )
        .bind(row.label, row.short_name, row.id)
        .run()
    }

    try {
      await env.DB.prepare(`ALTER TABLE sightings ADD COLUMN candidates TEXT`).run()
    } catch {
      /* column already exists */
    }

    // Phase 6: collections
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS collections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          indoor_outdoor TEXT NOT NULL DEFAULT 'outdoor',
          sort_order INTEGER NOT NULL DEFAULT 0
        )
      `).run()
    } catch { /* already exists */ }
    try {
      await env.DB.prepare(`ALTER TABLE plants ADD COLUMN collection_id INTEGER REFERENCES collections(id)`).run()
    } catch { /* column already exists */ }

    return json({ ok: true, message: 'migration complete' })
  }

  // GET /readings  GET /readings/latest — sensor data, no user_id
  if (method === 'GET' && pathname === '/readings/latest') {
    const row = await env.DB.prepare(
      'SELECT * FROM sensor_readings ORDER BY recorded_at DESC LIMIT 1'
    ).first()
    return json(row ?? null)
  }

  if (method === 'GET' && pathname === '/readings') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const { results } = await env.DB.prepare(
      'SELECT * FROM sensor_readings ORDER BY recorded_at DESC LIMIT ? OFFSET ?'
    )
      .bind(limit, offset)
      .all()
    return json(results)
  }

  // GET /weather/latest  GET /weather/daily — shared data, no user_id
  if (method === 'GET' && pathname === '/weather/latest') {
    const row = await env.DB.prepare('SELECT * FROM weather_daily ORDER BY date DESC LIMIT 1')
      .first()
      .catch(() => null)
    return json(row ?? null)
  }

  if (method === 'GET' && pathname === '/weather/daily') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 365)
    const results = await env.DB.prepare('SELECT * FROM weather_daily ORDER BY date DESC LIMIT ?')
      .bind(limit)
      .all()
      .then((r) => r.results)
      .catch(() => [])
    return json(results)
  }

  // POST /plants/:id/chat
  const chatMatch = pathname.match(/^\/plants\/(\d+)\/chat$/)
  if (chatMatch && method === 'POST') {
    const id = Number(chatMatch[1])
    const { messages } = (await request.json()) as { messages: ChatMessage[] }
    if (!Array.isArray(messages)) return err('messages array required')

    const plant = await env.DB.prepare(
      `SELECT p.*, c.name as collection_name, c.indoor_outdoor as collection_io
       FROM plants p LEFT JOIN collections c ON p.collection_id = c.id
       WHERE p.id = ? AND p.user_id = ?`
    ).bind(id, userId).first() as Record<string, unknown> | null

    if (!plant) return err('Plant not found', 404)

    const collectionName = plant.collection_name as string | null
    const plantIo = plant.indoor_outdoor as string | null

    // Pull notes relevant to this plant: collection-specific + indoor/outdoor + general
    const [readingsRes, gardenNotesRes, photosRes, childrenRes] = await Promise.all([
      env.DB.prepare(
        'SELECT id, type, value, unit, recorded_at FROM manual_readings WHERE plant_id = ? AND user_id = ? ORDER BY recorded_at DESC LIMIT 6'
      )
        .bind(id, userId)
        .all() as Promise<{ results: Record<string, unknown>[] }>,
      env.DB.prepare(
        `SELECT category, body FROM garden_notes WHERE user_id = ?
         AND (category = 'general' OR category = ? OR category = ?)
         ORDER BY recorded_at DESC LIMIT 15`
      )
        .bind(userId, plantIo ?? '', collectionName ?? '')
        .all() as Promise<{ results: Record<string, unknown>[] }>,
      env.DB.prepare(
        'SELECT id, r2_key, content_type, tier, caption, uploaded_at FROM plant_photos WHERE plant_id = ? AND user_id = ? ORDER BY uploaded_at DESC LIMIT 10'
      )
        .bind(id, userId)
        .all() as Promise<{ results: Record<string, unknown>[] }>,
      env.DB.prepare(
        'SELECT * FROM plants WHERE parent_id = ? AND user_id = ? ORDER BY slot_number ASC, id ASC'
      )
        .bind(id, userId)
        .all() as Promise<{ results: Record<string, unknown>[] }>,
    ])

    const readings = readingsRes.results
    const gardenNotes = gardenNotesRes.results
    const photos = photosRes.results
    const planterChildren = childrenRes.results

    const moistureReadings = readings.filter((r) => r.type === 'moisture').slice(0, 3)
    const phReadings = readings.filter((r) => r.type === 'ph').slice(0, 3)

    const notesSnippet =
      typeof plant.notes === 'string' && plant.notes.trim()
        ? plant.notes.trim().split('\n').slice(-5).join('\n')
        : 'No notes yet.'

    const readingLines =
      [
        ...moistureReadings.map((r) => `ID ${r.id} | Moisture ${r.value} (${r.recorded_at})`),
        ...phReadings.map((r) => `ID ${r.id} | pH ${r.value} (${r.recorded_at})`),
      ].join('\n') || 'No recent sensor readings.'

    const gardenContext =
      gardenNotes.length > 0
        ? gardenNotes.map((n) => `[${n.category}]\n${n.body}`).join('\n\n---\n\n')
        : 'No relevant garden notes yet.'

    const collectionLine = collectionName
      ? `Collection: ${collectionName} (${plantIo ?? 'outdoor'})`
      : `Indoor/outdoor: ${plantIo ?? 'outdoor'}`

    const lastMsg = (messages[messages.length - 1]?.content ?? '').toLowerCase()
    const isCompare = /compar|last week|previous|before|earlier/.test(lastMsg)
    const isPhotoReq =
      isCompare || /show|see|picture|photo|image|recent|latest|look like|what does/.test(lastMsg)

    const photoInventory =
      photos.length > 0
        ? 'Photos on file (most recent first):\n' +
          photos
            .map(
              (p) =>
                `  ID ${p.id} | ${p.tier} | ${p.caption || 'no caption'} | ${String(p.uploaded_at).split('T')[0]}`
            )
            .join('\n')
        : 'No photos on file for this plant.'

    const plantTools = [
      {
        name: 'update_plant',
        description: 'Update a field on this plant record',
        input_schema: {
          type: 'object' as const,
          properties: {
            field: {
              type: 'string',
              enum: [
                'name',
                'short_name',
                'species',
                'location',
                'indoor_outdoor',
                'notes',
              ],
              description: 'The field to update',
            },
            value: { type: 'string', description: 'New value. Empty string to clear.' },
          },
          required: ['field', 'value'],
        },
      },
      {
        name: 'delete_photo',
        description: 'Permanently delete a photo for this plant by ID',
        input_schema: {
          type: 'object' as const,
          properties: {
            photo_id: { type: 'number', description: 'The photo ID to delete' },
          },
          required: ['photo_id'],
        },
      },
      {
        name: 'set_hero_photo',
        description:
          'Set a photo as the hero (main display) for this plant. Copies the photo into the hero slot and replaces any existing hero — the original stays in the photo feed.',
        input_schema: {
          type: 'object' as const,
          properties: {
            photo_id: { type: 'number', description: 'The photo ID to set as hero' },
          },
          required: ['photo_id'],
        },
      },
      {
        name: 'delete_reading',
        description:
          'Delete a sensor reading by ID. Use when a reading is erroneous or the gardener asks to remove it.',
        input_schema: {
          type: 'object' as const,
          properties: {
            reading_id: {
              type: 'number',
              description: 'The reading ID to delete (shown in sensor readings list)',
            },
          },
          required: ['reading_id'],
        },
      },
    ]

    const executePlantTool = async (
      name: string,
      input: Record<string, unknown>
    ): Promise<string> => {
      const ALLOWED = [
        'name',
        'short_name',
        'species',
        'location',
        'indoor_outdoor',
        'notes',
      ]
      try {
        if (name === 'update_plant') {
          const { field, value } = input as { field: string; value: string }
          if (!ALLOWED.includes(field)) return `Error: unknown field "${field}"`
          await env.DB.prepare(
            `UPDATE plants SET ${field} = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
          )
            .bind(value || null, id, userId)
            .run()
          return `Updated ${field} → "${value}"`
        }
        if (name === 'delete_photo') {
          const { photo_id } = input as { photo_id: number }
          const row = (await env.DB.prepare(
            'SELECT r2_key FROM plant_photos WHERE id = ? AND plant_id = ? AND user_id = ?'
          )
            .bind(photo_id, id, userId)
            .first()) as Record<string, unknown> | null
          if (!row) return `Error: photo ${photo_id} not found`
          await env.PHOTOS.delete(row.r2_key as string)
          await env.DB.prepare('DELETE FROM plant_photos WHERE id = ? AND user_id = ?')
            .bind(photo_id, userId)
            .run()
          return `Deleted photo ${photo_id}`
        }
        if (name === 'set_hero_photo') {
          const { photo_id } = input as { photo_id: number }
          return await copyAsHero(env, id, userId, photo_id)
        }
        if (name === 'delete_reading') {
          const { reading_id } = input as { reading_id: number }
          const row = (await env.DB.prepare(
            'SELECT id, type, value FROM manual_readings WHERE id = ? AND plant_id = ? AND user_id = ?'
          )
            .bind(reading_id, id, userId)
            .first()) as Record<string, unknown> | null
          if (!row) return `Error: reading ${reading_id} not found`
          await env.DB.prepare('DELETE FROM manual_readings WHERE id = ? AND user_id = ?')
            .bind(reading_id, userId)
            .run()
          return `Deleted ${row.type} reading ${row.value} (ID ${reading_id})`
        }
        return `Unknown tool: ${name}`
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    }

    const isPlanter = planterChildren.length > 0
    const planterSection = isPlanter
      ? `\nThis is a PLANTER — watering, soil, and care events apply to the whole planter as a unit. When discussing a specific plant's health or appearance, refer to it by slot number and name.\n\nSlots (in order):\n` +
        planterChildren
          .map((c) => {
            const childNotes =
              typeof c.notes === 'string' && c.notes.trim()
                ? c.notes.trim().split('\n').slice(-3).join('\n')
                : 'No notes yet.'
            return `  Slot ${c.slot_number ?? '?'} — ${c.name}${c.species ? ` (${c.species})` : ''}\n  Notes: ${childNotes}`
          })
          .join('\n\n')
      : ''

    const systemPrompt = `You are a helpful assistant for a gardener with a container rose garden.

You have full context on this specific plant${isPlanter ? '/planter' : ''}. Chat freely — plant care, diagnosis, planning, anything useful. Keep replies concise; this is used on a mobile device outdoors.

When photos are shared: if the gardener is asking you to identify something (a pest, disease, or unknown plant), don't rush to a single conclusion. List the 2–3 most likely possibilities, describe what visible features point toward each, and ask one targeted diagnostic question that would help distinguish between them.

You can also update this plant's record using tools. If the gardener asks to rename the plant, change the species, update the location, delete a photo, or set a hero photo — do it immediately with the appropriate tool and confirm what changed.

Photos are displayed automatically when relevant — refer to them naturally.

This conversation is saved as a plant note when the gardener taps "Finish". Feel free to say "I'll note that" or "worth tracking".

Plant: ${plant.name} (${plant.label ?? `ID ${id}`})
${collectionLine}
${planterSection}
Recent care notes:
${notesSnippet}

Recent sensor readings:
${readingLines}

${photoInventory}

Relevant garden knowledge (collection + ${plantIo ?? 'outdoor'} + general notes):
${gardenContext}`

    const claudeMessages = messages.map((m: ChatMessage) => {
      if (m.imageData) {
        return {
          role: m.role,
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: m.imageData.mediaType,
                data: m.imageData.base64,
              },
            },
            { type: 'text', text: m.content },
          ],
        }
      }
      return { role: m.role, content: m.content }
    })

    type PlantToolBlock = {
      type: string
      id?: string
      name?: string
      input?: Record<string, unknown>
      text?: string
    }

    const callPlantClaude = async (msgs: unknown[]) => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          system: systemPrompt,
          tools: plantTools,
          messages: msgs,
        }),
      })
      if (!res.ok)
        throw new Error(`Claude API error: ${await res.text().catch(() => res.statusText)}`)
      return res.json() as Promise<{ content: PlantToolBlock[]; stop_reason: string }>
    }

    let plantMsgs: unknown[] = claudeMessages
    let plantData = await callPlantClaude(plantMsgs)

    if (plantData.stop_reason === 'tool_use') {
      const toolUseBlocks = plantData.content.filter((b) => b.type === 'tool_use')
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (b) => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: await executePlantTool(b.name!, b.input ?? {}),
        }))
      )
      plantMsgs = [
        ...plantMsgs,
        { role: 'assistant', content: plantData.content },
        { role: 'user', content: toolResults },
      ]
      plantData = await callPlantClaude(plantMsgs)
    }

    if (!plantData) return err('No response from Claude', 502)

    const reply = plantData.content.find((c) => c.type === 'text')?.text ?? ''

    type PhotoResult = { id: number; caption: string; base64: string; mediaType: string }
    const resolvedPhotos: PhotoResult[] = []

    if (isPhotoReq && photos.length > 0) {
      const roundPhotos = photos.filter((p) => p.tier === 'round')
      const toFetch = isCompare ? roundPhotos.slice(0, 2) : roundPhotos.slice(0, 1)
      if (toFetch.length === 0) {
        const h = photos.find((p) => p.tier === 'hero')
        if (h) toFetch.push(h)
      }

      for (const row of toFetch) {
        const obj = await env.PHOTOS.get(row.r2_key as string)
        if (!obj) continue
        const bytes = new Uint8Array(await obj.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
        resolvedPhotos.push({
          id: Number(row.id),
          caption: (row.caption as string) || '',
          base64: btoa(binary),
          mediaType: (row.content_type as string) || 'image/jpeg',
        })
      }
    }

    return json({ reply, photos: resolvedPhotos })
  }

  // POST /plants/:id/chat/summarize
  const summarizeMatch = pathname.match(/^\/plants\/(\d+)\/chat\/summarize$/)
  if (summarizeMatch && method === 'POST') {
    const id = Number(summarizeMatch[1])
    const { messages } = (await request.json()) as { messages: ChatMessage[] }
    if (!Array.isArray(messages) || messages.length === 0) return err('messages array required')

    const plant = (await env.DB.prepare('SELECT name FROM plants WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .first()) as Record<string, unknown> | null
    if (!plant) return err('Plant not found', 404)

    const today = new Date().toISOString().split('T')[0]
    const summarizePrompt = `You are summarizing a plant care conversation into structured notes.

Plant: ${plant.name} (${plant.label ?? `ID ${id}`})
Today: ${today}

Conversation:
${messages.map((m) => `${m.role === 'user' ? 'Gardener' : 'Assistant'}: ${m.content}`).join('\n')}

Write a plant-specific note. If the conversation also revealed something broadly applicable to the garden (a technique, product tip, or general observation worth remembering across all plants), write a garden note too.

Respond with a JSON object only — no markdown, no explanation:
{"plant_note":"[${today}] Category: observation.","garden_note":{"category":"Technique|Observation|Climate|Product|General","body":"[${today}] Category: learning."}}

Omit the "garden_note" key entirely if nothing garden-level came up.
Plant note categories: Assessment, Watering, Pruning, Health, Feeding, Photo, Bloom, Sensor, General`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: summarizePrompt }],
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      return err(`Claude API error: ${text}`, 502)
    }

    const data = (await response.json()) as { content: { type: string; text: string }[] }
    const raw = (data.content.find((c) => c.type === 'text')?.text ?? '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()

    let plantNote = ''
    let gardenNote: { category: string; body: string } | null = null

    try {
      const parsed = JSON.parse(raw)
      plantNote = (parsed.plant_note ?? '').trim()
      gardenNote = parsed.garden_note ?? null
    } catch {
      plantNote = raw
    }

    if (plantNote) {
      await env.DB.prepare(
        `
          UPDATE plants
          SET notes = CASE
            WHEN notes IS NULL OR notes = '' THEN ?
            ELSE notes || char(10) || ?
          END
          WHERE id = ? AND user_id = ?
        `
      )
        .bind(plantNote, plantNote, id, userId)
        .run()
    }

    if (gardenNote?.body?.trim()) {
      await env.DB.prepare('INSERT INTO garden_notes (user_id, category, body) VALUES (?, ?, ?)')
        .bind(userId, gardenNote.category ?? 'General', gardenNote.body.trim())
        .run()
    }

    return json({ plant_note: plantNote, garden_note: gardenNote ?? undefined })
  }

  // POST /settings/chat — management chat with tool use (update plants, manage photos)
  if (pathname === '/settings/chat' && method === 'POST') {
    const { messages } = (await request.json()) as { messages: ChatMessage[] }
    if (!Array.isArray(messages)) return err('messages array required')

    const [plantsRes] = await Promise.all([
      env.DB.prepare(
        'SELECT id, name, label, short_name, species, location, indoor_outdoor, notes, parent_id, slot_number FROM plants WHERE user_id = ? ORDER BY id'
      )
        .bind(userId)
        .all() as Promise<{ results: Record<string, unknown>[] }>,
    ])

    type PlantRow = {
      id: number
      name: string
      label: string | null
      short_name: string | null
      species: string | null
      location: string | null
      indoor_outdoor: string
      notes: string | null
      parent_id: number | null
      slot_number: number | null
    }
    const allPlants = plantsRes.results as PlantRow[]
    const topLevel = allPlants.filter((p) => !p.parent_id)
    const children = allPlants.filter((p) => p.parent_id)

    const plantList = topLevel
      .map((p) => {
        const isPlanter = children.some((c) => c.parent_id === p.id)
        const line = `ID ${p.id}: "${p.name}" | label: ${p.label ?? '—'} | short: ${p.short_name ?? '—'} | species: ${p.species ?? '—'} | location: ${p.location ?? '—'} | ${p.indoor_outdoor}${isPlanter ? ' [PLANTER]' : ''}`
        if (!isPlanter) return line
        const slots = children
          .filter((c) => c.parent_id === p.id)
          .sort((a, b) => (a.slot_number ?? 99) - (b.slot_number ?? 99))
          .map(
            (c) =>
              `  └ Slot ${c.slot_number ?? '?'} ID ${c.id}: "${c.name}" | species: ${c.species ?? '—'}`
          )
          .join('\n')
        return `${line}\n${slots}`
      })
      .join('\n')

    const systemPrompt = `You are a plant care app management assistant. You help the gardener manage their plant records.

Use the provided tools to make changes immediately when asked. Always confirm what you changed. Be concise — this is a mobile app.

## Planter convention

A PLANTER is a parent plant record that represents a physical container (windowsill box, Veradek planter, tree pit, etc.). Its child records are the individual plant SLOTS inside it.

Rules:
- The PLANTER gets the O-number label (e.g. "O5") — this is the label on the physical medallion attached to the container. Slots do NOT get labels or medallions.
- Give the planter a descriptive name, e.g. "Pollinator Box 1" or "Windowsill Planter".
- Slots are numbered 1, 2, 3… in left-to-right order as you face the planter.
- Watering, soil data, and care events apply to the whole planter (attach to the planter ID). Plant-specific notes go on the slot.
- When creating a planter, first create the parent (with label), then create each slot (with parent_id and slot_number, no label).

## Creating a planter — what to ask
When the user wants to add a planter, gather:
1. A name for the container (e.g. "Pollinator Box 1")
2. Which O-number label it gets
3. Location and indoor/outdoor
4. How many slots and what plant is in each slot (name + species if known)

Then create the parent first, then each slot in order.

## Current plants
${plantList || 'No plants yet.'}

Only use plant IDs listed above when updating or referencing existing plants.`

    const tools = [
      {
        name: 'update_plant',
        description: 'Update a field on a plant record',
        input_schema: {
          type: 'object' as const,
          properties: {
            plant_id: { type: 'number', description: 'The plant ID' },
            field: {
              type: 'string',
              enum: [
                'name',
                'short_name',
                'species',
                'location',
                'indoor_outdoor',
                'notes',
              ],
              description: 'The field to update',
            },
            value: {
              type: 'string',
              description: 'New value. Pass empty string to clear the field.',
            },
          },
          required: ['plant_id', 'field', 'value'],
        },
      },
      {
        name: 'list_photos',
        description: 'List all photos for a plant',
        input_schema: {
          type: 'object' as const,
          properties: {
            plant_id: { type: 'number', description: 'The plant ID' },
          },
          required: ['plant_id'],
        },
      },
      {
        name: 'delete_photo',
        description: 'Permanently delete a photo by ID',
        input_schema: {
          type: 'object' as const,
          properties: {
            photo_id: { type: 'number', description: 'The photo ID to delete' },
          },
          required: ['photo_id'],
        },
      },
      {
        name: 'set_hero_photo',
        description:
          'Set a photo as the hero (main display) for its plant. Copies the photo into the hero slot and replaces any existing hero — the original stays in the photo feed so it remains visible in the timeline. Safe to use on a real plant photo without losing it from the feed.',
        input_schema: {
          type: 'object' as const,
          properties: {
            photo_id: { type: 'number', description: 'The photo ID to set as hero' },
          },
          required: ['photo_id'],
        },
      },
      {
        name: 'add_garden_note',
        description: 'Add a note to the garden-wide knowledge base. Use a collection name (e.g. "Roses", "Tree Pit") as category for collection-specific notes, "outdoor" or "indoor" for general location notes, or "general" for garden-wide notes.',
        input_schema: {
          type: 'object' as const,
          properties: {
            category: { type: 'string', description: 'Category: collection name, "outdoor", "indoor", or "general"' },
            body: { type: 'string', description: 'The note content' },
          },
          required: ['category', 'body'],
        },
      },
      {
        name: 'create_plant',
        description:
          'Create a new plant or planter slot. For a top-level plant or planter, omit parent_id and slot_number. For a slot inside a planter, set parent_id to the planter ID and slot_number to its position (1-based).',
        input_schema: {
          type: 'object' as const,
          properties: {
            name: { type: 'string', description: 'Full plant name' },
            label: { type: 'string', description: 'O-number label (e.g. "O5"). Only set on top-level plants/planters, NOT on slots.' },
            short_name: { type: 'string', description: 'Short display name (optional)' },
            species: { type: 'string', description: 'Latin or common species name (optional)' },
            location: { type: 'string', description: 'Physical location description (optional)' },
            indoor_outdoor: {
              type: 'string',
              enum: ['indoor', 'outdoor'],
              description: 'Whether the plant is indoor or outdoor',
            },
            notes: { type: 'string', description: 'Initial notes (optional)' },
            parent_id: {
              type: 'number',
              description: 'ID of the parent planter. Only set when creating a slot.',
            },
            slot_number: {
              type: 'number',
              description: 'Slot position within the planter (1-based). Only set when creating a slot.',
            },
          },
          required: ['name', 'indoor_outdoor'],
        },
      },
    ]

    type ToolBlock = {
      type: string
      id?: string
      name?: string
      input?: Record<string, unknown>
      text?: string
    }

    const executeTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
      const ALLOWED_FIELDS = [
        'name',
        'short_name',
        'species',
        'location',
        'indoor_outdoor',
        'notes',
      ]
      try {
        if (name === 'update_plant') {
          const { plant_id, field, value } = input as {
            plant_id: number
            field: string
            value: string
          }
          if (!ALLOWED_FIELDS.includes(field)) return `Error: unknown field "${field}"`
          const found = await env.DB.prepare('SELECT id FROM plants WHERE id = ? AND user_id = ?')
            .bind(plant_id, userId)
            .first()
          if (!found) return `Error: plant ${plant_id} not found`
          await env.DB.prepare(
            `UPDATE plants SET ${field} = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
          )
            .bind(value || null, plant_id, userId)
            .run()
          return `Updated plant ${plant_id} ${field} → "${value}"`
        }

        if (name === 'list_photos') {
          const { plant_id } = input as { plant_id: number }
          const { results } = await env.DB.prepare(
            'SELECT id, tier, caption, uploaded_at FROM plant_photos WHERE plant_id = ? AND user_id = ? ORDER BY uploaded_at DESC'
          )
            .bind(plant_id, userId)
            .all()
          if (!results.length) return 'No photos for this plant.'
          return results
            .map(
              (p) =>
                `ID ${p.id} | ${p.tier} | ${p.caption || 'no caption'} | ${String(p.uploaded_at).split('T')[0]}`
            )
            .join('\n')
        }

        if (name === 'delete_photo') {
          const { photo_id } = input as { photo_id: number }
          const photo = (await env.DB.prepare(
            'SELECT r2_key FROM plant_photos WHERE id = ? AND user_id = ?'
          )
            .bind(photo_id, userId)
            .first()) as Record<string, unknown> | null
          if (!photo) return `Error: photo ${photo_id} not found`
          await env.PHOTOS.delete(photo.r2_key as string)
          await env.DB.prepare('DELETE FROM plant_photos WHERE id = ? AND user_id = ?')
            .bind(photo_id, userId)
            .run()
          return `Deleted photo ${photo_id}`
        }

        if (name === 'set_hero_photo') {
          const { photo_id } = input as { photo_id: number }
          const photo = (await env.DB.prepare(
            'SELECT plant_id FROM plant_photos WHERE id = ? AND user_id = ?'
          )
            .bind(photo_id, userId)
            .first()) as { plant_id: number } | null
          if (!photo) return `Error: photo ${photo_id} not found`
          return await copyAsHero(env, photo.plant_id, userId, photo_id)
        }

        if (name === 'add_garden_note') {
          const { category, body } = input as { category: string; body: string }
          if (!category?.trim() || !body?.trim()) return 'Error: category and body are required'
          await env.DB.prepare(
            `INSERT INTO garden_notes (user_id, category, body, recorded_at) VALUES (?, ?, ?, datetime('now'))`
          )
            .bind(userId, category.trim(), body.trim())
            .run()
          return `Added garden note in category "${category}"`
        }

        if (name === 'create_plant') {
          const inp = input as {
            name: string
            label?: string
            short_name?: string
            species?: string
            location?: string
            indoor_outdoor: string
            notes?: string
            parent_id?: number
            slot_number?: number
          }
          if (!inp.name?.trim()) return 'Error: name is required'
          if (!['indoor', 'outdoor'].includes(inp.indoor_outdoor))
            return 'Error: indoor_outdoor must be "indoor" or "outdoor"'
          if (inp.parent_id) {
            const parent = await env.DB.prepare('SELECT id FROM plants WHERE id = ? AND user_id = ?')
              .bind(inp.parent_id, userId)
              .first()
            if (!parent) return `Error: parent plant ${inp.parent_id} not found`
          }
          const result = await env.DB.prepare(
            `INSERT INTO plants (user_id, name, label, short_name, species, location, indoor_outdoor, notes, parent_id, slot_number, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
          )
            .bind(
              userId,
              inp.name.trim(),
              inp.label?.trim() || null,
              inp.short_name?.trim() || null,
              inp.species?.trim() || null,
              inp.location?.trim() || null,
              inp.indoor_outdoor,
              inp.notes?.trim() || null,
              inp.parent_id ?? null,
              inp.slot_number ?? null
            )
            .run()
          const newId = result.meta?.last_row_id
          const isSlot = !!inp.parent_id
          return `Created ${isSlot ? `slot ${inp.slot_number} in planter ${inp.parent_id}` : 'plant'}: "${inp.name}" (ID ${newId})${inp.label ? ` | label: ${inp.label}` : ''}`
        }

        return `Unknown tool: ${name}`
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    }

    const callClaude = async (msgs: unknown[]) => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: systemPrompt,
          tools,
          messages: msgs,
        }),
      })
      if (!res.ok)
        throw new Error(`Claude API error: ${await res.text().catch(() => res.statusText)}`)
      return res.json() as Promise<{ content: ToolBlock[]; stop_reason: string }>
    }

    let msgs: unknown[] = messages.map((m: ChatMessage) => ({ role: m.role, content: m.content }))
    let data = await callClaude(msgs)

    // Loop up to 6 rounds to support multi-step planter creation (parent + N slots)
    for (let round = 0; round < 6 && data.stop_reason === 'tool_use'; round++) {
      const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use')
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (b) => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: await executeTool(b.name!, b.input ?? {}),
        }))
      )
      msgs = [
        ...msgs,
        { role: 'assistant', content: data.content },
        { role: 'user', content: toolResults },
      ]
      data = await callClaude(msgs)
    }

    const reply = data.content.find((b) => b.type === 'text')?.text ?? ''
    return json({ reply, photos: [] })
  }

  // POST /onboarding/chat — chat-guided plant addition with vision + create_plant tool
  if (pathname === '/onboarding/chat' && method === 'POST') {
    const { messages } = (await request.json()) as { messages: ChatMessage[] }
    if (!Array.isArray(messages)) return err('messages array required')

    const plantsRes = await env.DB.prepare(
      'SELECT id, name, label, indoor_outdoor FROM plants WHERE user_id = ? ORDER BY id'
    )
      .bind(userId)
      .all()

    const plantList =
      (
        plantsRes.results as {
          id: number
          name: string
          label: string | null
          indoor_outdoor: string
        }[]
      )
        .map((p) => `${p.label ?? `Plant ${p.id}`}: ${p.name} (${p.indoor_outdoor})`)
        .join('\n') || 'No plants yet.'

    const systemPrompt = `You are helping the gardener add a new plant to their app. Be friendly but thorough — plant identification matters for care decisions.

When the user uploads a photo:
- List your top 2–3 candidate identifications with a confidence level for each.
- Describe 2–3 key visible features that support your top pick and what distinguishes it from the alternatives.
- Ask ONE targeted diagnostic question to narrow the uncertainty. For roses: bloom form and petal count, cane or stem color, fragrance, whether it reblooms. For other plants: leaf shape/margin, stem texture, bloom color.
- Only commit to a final name once the gardener confirms or you have enough to be confident. Don't create the plant record until identity is confirmed.

For roses specifically: note the class (shrub, hybrid tea, floribunda, climber), repeat-blooming status, and hardiness zone if you can tell.

Collect ALL of these before calling create_plant:
- Plant name (required — full cultivar name, confirmed by the user)
- Label/ID: continue the series from existing plants (e.g. if last is O14, next is O15). Use O for outdoor, I for indoor.
- Short display name: first word or two of the cultivar name (e.g. "Morden Blush" → "Morden")
- Species or variety details (genus, cultivar, class)
- Garden location (which bed, pot, or area it's going in)
- Indoor or outdoor

Do NOT call create_plant until you have confirmed the name AND asked about location and indoor/outdoor. If the user hasn't mentioned location, ask before creating. Keep replies focused — one question at a time.

After create_plant succeeds, confirm what was added and ask if they want to add another.

Existing plants (for label numbering context):
${plantList}`

    const createPlantTool = {
      name: 'create_plant',
      description:
        'Create a new plant record in the database once the user has confirmed the details',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Full plant name / cultivar' },
          label: { type: 'string', description: 'Short tracking ID, e.g. O11' },
          short_name: { type: 'string', description: 'Abbreviated display name for compact lists' },
          species: { type: 'string', description: 'Species or cultivar details' },
          location: { type: 'string', description: 'Garden location / container position' },
          indoor_outdoor: {
            type: 'string',
            enum: ['indoor', 'outdoor'],
            description: 'Plant environment',
          },
          notes: { type: 'string', description: 'Any initial care notes or observations' },
        },
        required: ['name'],
      },
    }

    type OnboardingToolBlock = {
      type: string
      id?: string
      name?: string
      input?: Record<string, unknown>
      text?: string
    }

    const toAnthropicMessages = (msgs: ChatMessage[]) =>
      msgs.map((m) => {
        if (m.imageData) {
          return {
            role: m.role,
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: m.imageData.mediaType,
                  data: m.imageData.base64,
                },
              },
              { type: 'text', text: m.content },
            ],
          }
        }
        return { role: m.role, content: m.content }
      })

    const callClaude = async (msgs: unknown[], sys = systemPrompt) => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 768,
          system: sys,
          tools: [createPlantTool],
          messages: msgs,
        }),
      })
      if (!r.ok) {
        const errText = await r.text()
        console.error(`[onboarding/chat] Anthropic ${r.status}:`, errText)
        throw new Error(`Anthropic error ${r.status}: ${errText}`)
      }
      return r.json() as Promise<{ content: OnboardingToolBlock[]; stop_reason: string }>
    }

    // PlantNet first-pass: call when the latest user message contains an image
    const imageMsg = [...messages].reverse().find((m) => m.role === 'user' && m.imageData)
    let activeSystemPrompt = systemPrompt
    if (imageMsg?.imageData && env.PLANTNET_API_KEY) {
      const pn = await callPlantNet(
        imageMsg.imageData.base64,
        imageMsg.imageData.mediaType,
        env.PLANTNET_API_KEY
      )
      if (pn)
        activeSystemPrompt += `\n\n${pn}\n(Use these results as a starting point — still go through your diagnostic questioning process before creating the plant record.)`
    }

    let msgs: unknown[] = toAnthropicMessages(messages)
    let data = await callClaude(msgs, activeSystemPrompt)
    let createdPlantId: number | null = null
    let createdPlantName: string | null = null

    if (data.stop_reason === 'tool_use') {
      const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use')
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (b) => {
          if (b.name === 'create_plant') {
            const input = b.input as {
              name: string
              label?: string
              short_name?: string
              species?: string
              location?: string
              indoor_outdoor?: string
              notes?: string
            }
            const row = (await env.DB.prepare(
              `INSERT INTO plants (user_id, name, label, short_name, species, location, indoor_outdoor, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, name`
            )
              .bind(
                userId,
                input.name,
                input.label ?? null,
                input.short_name ?? null,
                input.species ?? null,
                input.location ?? null,
                input.indoor_outdoor ?? 'outdoor',
                input.notes ?? null
              )
              .first()) as { id: number; name: string } | null
            createdPlantId = row?.id ?? null
            createdPlantName = row?.name ?? input.name
            return {
              type: 'tool_result',
              tool_use_id: b.id,
              content: `Plant created successfully with ID ${createdPlantId}.`,
            }
          }
          return { type: 'tool_result', tool_use_id: b.id, content: 'Unknown tool.' }
        })
      )
      msgs = [
        ...msgs,
        { role: 'assistant', content: data.content },
        { role: 'user', content: toolResults },
      ]
      data = await callClaude(msgs)
    }

    const reply = data.content.find((b) => b.type === 'text')?.text ?? ''
    return json({ reply, plant_id: createdPlantId, plant_name: createdPlantName })
  }

  // POST /admin/delete-readings — delete all manual readings for user on a given date
  if (method === 'POST' && pathname === '/admin/delete-readings') {
    const body = (await request.json()) as { date: string }
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return err('date required (YYYY-MM-DD)')
    const { meta } = await env.DB.prepare(
      "DELETE FROM manual_readings WHERE user_id = ? AND DATE(recorded_at) = ?"
    )
      .bind(userId, body.date)
      .run()
    return json({ ok: true, deleted: meta.changes })
  }

  // POST /admin/backfill-weather — one-shot: fetches last 90 days of actuals
  if (method === 'POST' && pathname === '/admin/backfill-weather') {
    const LAT = '40.6782',
      LON = '-73.9442'
    const burl = new URL('https://api.open-meteo.com/v1/forecast')
    burl.searchParams.set('latitude', LAT)
    burl.searchParams.set('longitude', LON)
    burl.searchParams.set(
      'daily',
      [
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'relative_humidity_2m_mean',
        'et0_fao_evapotranspiration',
      ].join(',')
    )
    burl.searchParams.set('timezone', 'America/New_York')
    burl.searchParams.set('past_days', '90')
    burl.searchParams.set('forecast_days', '0')
    const bres = await fetch(burl.toString())
    if (!bres.ok) return err(`Open-Meteo error: ${bres.status}`)
    const bdata = (await bres.json()) as { daily: OpenMeteoDaily }
    const bd = bdata.daily
    let inserted = 0
    for (let i = 0; i < bd.time.length; i++) {
      const tmax = bd.temperature_2m_max[i],
        tmin = bd.temperature_2m_min[i]
      const gdd = Math.max(0, (tmax + tmin) / 2 - 10)
      await env.DB.prepare(
        `
        INSERT OR REPLACE INTO weather_daily
          (date, max_temp_c, min_temp_c, precip_mm, humidity_pct, et0_mm, gdd, is_forecast)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `
      )
        .bind(
          bd.time[i],
          tmax,
          tmin,
          bd.precipitation_sum[i],
          Math.round(bd.relative_humidity_2m_mean[i]),
          bd.et0_fao_evapotranspiration[i],
          Math.round(gdd * 10) / 10
        )
        .run()
      inserted++
    }
    return json({ ok: true, inserted })
  }

  // GET /home — combined dashboard: plant watering status + overdue schedules
  if (method === 'GET' && pathname === '/home') {
    const [plantsRes, lastWateredRes, moistureRes, weatherRes, schedulesRes] = await Promise.all([
      env.DB.prepare('SELECT * FROM plants WHERE user_id = ? ORDER BY id').bind(userId).all(),
      env.DB.prepare(
        `
        SELECT plant_id, DATE(MAX(recorded_at)) as last_watered
        FROM care_events WHERE user_id = ? AND watered = 1 GROUP BY plant_id
      `
      )
        .bind(userId)
        .all(),
      env.DB.prepare(
        `
        SELECT plant_id, value as moisture, DATE(MAX(recorded_at)) as moisture_at
        FROM manual_readings WHERE user_id = ? AND type = 'moisture' GROUP BY plant_id
      `
      )
        .bind(userId)
        .all(),
      env.DB.prepare(
        'SELECT date, et0_mm, precip_mm, is_forecast FROM weather_daily ORDER BY date ASC'
      ).all(),
      env.DB.prepare(
        `
        SELECT * FROM treatment_schedules WHERE user_id = ? AND active = 1 ORDER BY next_due ASC
      `
      )
        .bind(userId)
        .all(),
    ])

    const plants = plantsRes.results as Record<string, unknown>[]
    const lastWatered = Object.fromEntries(
      (lastWateredRes.results as { plant_id: number; last_watered: string }[]).map((r) => [
        r.plant_id,
        r.last_watered,
      ])
    )
    const latestMoisture = Object.fromEntries(
      (moistureRes.results as { plant_id: number; moisture: number; moisture_at: string }[]).map(
        (r) => [r.plant_id, { moisture: r.moisture, moisture_at: r.moisture_at }]
      )
    )
    const weatherRows = weatherRes.results as {
      date: string
      et0_mm: number
      precip_mm: number
      is_forecast: number
    }[]
    const hasWeather = weatherRows.length > 0
    const today = new Date().toISOString().split('T')[0]

    const plantStatuses = plants.map((p) => {
      const isIndoor = p.indoor_outdoor === 'indoor'
      const pid = p.id as number
      const budget = (p.et0_budget_mm as number | null) ?? DEFAULT_ET0_BUDGET
      const minMoisture = (p.min_moisture as number | null) ?? DEFAULT_MIN_MOISTURE
      const lw = lastWatered[pid] ?? null

      let soilDeficit: number | null = null
      let forecastNextDue: string | null = null
      let daysUntilDue: number | null = null
      let needsWater = false
      let reason: string | null = null

      const moistureEntry = latestMoisture[pid] ?? null
      const moisture = moistureEntry?.moisture ?? null
      const moistureAt = moistureEntry?.moisture_at ?? null
      const moistureIsStale = lw !== null && moistureAt !== null && moistureAt <= lw

      if (!isIndoor && hasWeather && lw !== null) {
        const cd = computeDeficit(weatherRows, lw, moistureEntry, budget, minMoisture, today)
        soilDeficit = cd.soilDeficit
        forecastNextDue = cd.forecastNextDue
        daysUntilDue = cd.daysUntilDue
        if (soilDeficit >= budget) {
          needsWater = true
          reason = 'et0'
        }
      }

      if (moisture !== null && moisture <= minMoisture && !moistureIsStale) {
        needsWater = true
        reason = reason ? 'both' : 'moisture'
      }

      return {
        id: pid,
        name: p.name,
        label: p.label,
        short_name: p.short_name,
        indoor_outdoor: p.indoor_outdoor,
        needs_water: needsWater,
        reason,
        soil_deficit_mm: isIndoor ? null : soilDeficit,
        et0_budget_mm: isIndoor ? null : budget,
        last_watered: lw,
        forecast_next_due: forecastNextDue,
        days_until_due: daysUntilDue,
        latest_moisture: moisture,
      }
    })

    // Schedule overdue/due-today
    const INCOMPATIBLE = new Set(['neem|potassium-bicarb', 'potassium-bicarb|neem'])
    const schedules = schedulesRes.results as Record<string, unknown>[]
    const schedulesWithMeta = schedules.map((s) => {
      const nextDue = s.next_due as string | null
      const overdue = nextDue ? nextDue < today : false
      const diffDays = nextDue
        ? Math.round((new Date(nextDue).getTime() - new Date(today).getTime()) / 86400000)
        : null
      const conflictWith = schedules
        .filter((other) => {
          if (other.id === s.id) return false
          const pair = `${s.treatment}|${other.treatment}`
          if (!INCOMPATIBLE.has(pair)) return false
          const otherDue = other.next_due as string | null
          if (!nextDue || !otherDue) return false
          return (
            Math.abs(new Date(nextDue).getTime() - new Date(otherDue).getTime()) <= 2 * 86400000
          )
        })
        .map((o) => o.id)
      return { ...s, overdue, days_until_due: diffDays, conflict_with: conflictWith }
    })

    return json({
      plants: plantStatuses,
      overdue_schedules: schedulesWithMeta.filter((s) => s.overdue),
      due_today: schedulesWithMeta.filter((s) => s.days_until_due === 0),
    })
  }

  // GET /debug/watering — per-plant daily deficit data for the debug dashboard
  if (method === 'GET' && pathname === '/debug/watering') {
    const today = new Date().toISOString().split('T')[0]
    const windowStart = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

    const [plantsRes, wateringRes, moistureRes, weatherRes] = await Promise.all([
      env.DB.prepare('SELECT * FROM plants WHERE user_id = ? ORDER BY id').bind(userId).all(),
      env.DB.prepare(
        `
        SELECT plant_id, DATE(recorded_at) as date, SUM(volume_ml) as volume_ml
        FROM care_events WHERE user_id = ? AND watered = 1 AND DATE(recorded_at) >= ?
        GROUP BY plant_id, DATE(recorded_at) ORDER BY date ASC
      `
      )
        .bind(userId, windowStart)
        .all(),
      env.DB.prepare(
        `
        SELECT id, plant_id, value, recorded_at
        FROM manual_readings WHERE user_id = ? AND type = 'moisture' AND DATE(recorded_at) >= ?
        ORDER BY plant_id, recorded_at ASC
      `
      )
        .bind(userId, windowStart)
        .all(),
      env.DB.prepare(
        'SELECT date, et0_mm, precip_mm, is_forecast FROM weather_daily ORDER BY date ASC'
      ).all(),
    ])

    const allPlants = plantsRes.results as Record<string, unknown>[]
    const weatherRows = weatherRes.results as {
      date: string
      et0_mm: number
      precip_mm: number
      is_forecast: number
    }[]

    // Group watering events and moisture readings by plant
    const wateringByPlant = new Map<number, { date: string; volume_ml: number | null }[]>()
    for (const r of wateringRes.results as {
      plant_id: number
      date: string
      volume_ml: number | null
    }[]) {
      if (!wateringByPlant.has(r.plant_id)) wateringByPlant.set(r.plant_id, [])
      wateringByPlant.get(r.plant_id)!.push({ date: r.date, volume_ml: r.volume_ml })
    }
    const moistureByPlant = new Map<number, { id: number; value: number; recorded_at: string }[]>()
    for (const r of moistureRes.results as {
      id: number
      plant_id: number
      value: number
      recorded_at: string
    }[]) {
      if (!moistureByPlant.has(r.plant_id)) moistureByPlant.set(r.plant_id, [])
      moistureByPlant
        .get(r.plant_id)!
        .push({ id: r.id, value: r.value, recorded_at: r.recorded_at })
    }

    // Also pull last_watered and latest moisture from full history (not just 30-day window)
    const [lastWateredRes, latestMoistureRes] = await Promise.all([
      env.DB.prepare(
        `
        SELECT plant_id, DATE(MAX(recorded_at)) as last_watered
        FROM care_events WHERE user_id = ? AND watered = 1 GROUP BY plant_id
      `
      )
        .bind(userId)
        .all(),
      env.DB.prepare(
        `
        SELECT plant_id, value as moisture, DATE(MAX(recorded_at)) as moisture_at
        FROM manual_readings WHERE user_id = ? AND type = 'moisture' GROUP BY plant_id
      `
      )
        .bind(userId)
        .all(),
    ])
    const lastWatered = Object.fromEntries(
      (lastWateredRes.results as { plant_id: number; last_watered: string }[]).map((r) => [
        r.plant_id,
        r.last_watered,
      ])
    )
    const latestMoisture = Object.fromEntries(
      (
        latestMoistureRes.results as { plant_id: number; moisture: number; moisture_at: string }[]
      ).map((r) => [r.plant_id, { moisture: r.moisture, moisture_at: r.moisture_at }])
    )

    const hasWeather = weatherRows.length > 0

    const debugPlants = allPlants.map((p) => {
      const pid = p.id as number
      const isIndoor = p.indoor_outdoor === 'indoor'
      const budget = (p.et0_budget_mm as number | null) ?? DEFAULT_ET0_BUDGET
      const minMoisture = (p.min_moisture as number | null) ?? DEFAULT_MIN_MOISTURE
      const lw = lastWatered[pid] ?? null // already DATE() from SQL — plain YYYY-MM-DD
      const lwDate = lw

      const plantWaterings = wateringByPlant.get(pid) ?? []
      const plantMoisture = moistureByPlant.get(pid) ?? []

      // Build daily array: walk weather rows, reset on watering, anchor on moisture readings
      const wateringDates = new Set(plantWaterings.map((w) => w.date))
      const moistureDateMap = new Map<string, number>()
      for (const m of plantMoisture) {
        const date = (m.recorded_at as string).split('T')[0].split(' ')[0]
        moistureDateMap.set(date, m.value)
      }

      let cumulDeficit = 0
      const daily = weatherRows
        .filter((w) => w.date >= windowStart)
        .map((w) => {
          let moistureAnchorVal: number | null = null
          if (wateringDates.has(w.date)) {
            cumulDeficit = 0
          } else if (!isIndoor && moistureDateMap.has(w.date)) {
            const mVal = moistureDateMap.get(w.date)!
            const implied = Math.max(
              0,
              ((MAX_MOISTURE - mVal) / (MAX_MOISTURE - minMoisture)) * budget
            )
            cumulDeficit = implied
            moistureAnchorVal = mVal
          }
          const effRain = w.precip_mm * RAIN_EFFICIENCY
          const netDraw = isIndoor ? 0 : Math.max(0, w.et0_mm - effRain)
          cumulDeficit += netDraw
          return {
            date: w.date,
            et0_mm: w.et0_mm,
            precip_mm: w.precip_mm,
            eff_rain_mm: Math.round(effRain * 10) / 10,
            net_draw_mm: Math.round(netDraw * 10) / 10,
            cumul_deficit_mm: Math.round(cumulDeficit * 10) / 10,
            moisture_anchor: moistureAnchorVal,
            is_forecast: w.is_forecast,
          }
        })

      // Moisture readings with stale flag
      const moistureReadings = plantMoisture.map((m) => ({
        id: m.id,
        value: m.value,
        recorded_at: m.recorded_at,
        stale: lwDate !== null && m.recorded_at <= lw!,
      }))

      // Re-compute needs_water / reason using same logic as /home
      const moistureEntry = latestMoisture[pid] ?? null
      const moisture = moistureEntry?.moisture ?? null
      const moistureAt = moistureEntry?.moisture_at ?? null
      const moistureIsStale = lw !== null && moistureAt !== null && moistureAt <= lw

      let soilDeficit: number | null = null
      let forecastNextDue: string | null = null
      let daysUntilDue: number | null = null
      let needsWater = false
      let reason: string | null = null

      let anchorDate: string | null = null
      let anchorMoisture: number | null = null

      if (!isIndoor && hasWeather && lw !== null) {
        const cd = computeDeficit(weatherRows, lw, moistureEntry, budget, minMoisture, today)
        soilDeficit = cd.soilDeficit
        forecastNextDue = cd.forecastNextDue
        daysUntilDue = cd.daysUntilDue
        anchorDate = cd.anchorDate
        anchorMoisture = cd.anchorMoisture
        if (soilDeficit >= budget) {
          needsWater = true
          reason = 'et0'
        }
      }
      if (moisture !== null && moisture <= minMoisture && !moistureIsStale) {
        needsWater = true
        reason = reason ? 'both' : 'moisture'
      }

      return {
        id: pid,
        label: p.label,
        name: p.name,
        indoor_outdoor: p.indoor_outdoor,
        et0_budget_mm: budget,
        min_moisture: minMoisture,
        last_watered: lwDate,
        soil_deficit_mm: isIndoor
          ? null
          : soilDeficit !== null
            ? Math.round(soilDeficit * 10) / 10
            : null,
        anchor_date: anchorDate,
        anchor_moisture: anchorMoisture,
        needs_water: needsWater,
        reason,
        days_until_due: daysUntilDue,
        forecast_next_due: forecastNextDue,
        latest_moisture: moisture,
        watering_events: plantWaterings,
        moisture_readings: moistureReadings,
        daily,
      }
    })

    return json({
      weather: weatherRows.filter((w) => w.date >= windowStart),
      plants: debugPlants,
    })
  }

  // GET /schedules  POST /schedules
  if (pathname === '/schedules') {
    if (method === 'GET') {
      const includeInactive = url.searchParams.get('include_inactive') === 'true'
      const { results } = await env.DB.prepare(
        includeInactive
          ? 'SELECT * FROM treatment_schedules WHERE user_id = ? ORDER BY active DESC, next_due ASC'
          : 'SELECT * FROM treatment_schedules WHERE user_id = ? AND active = 1 ORDER BY next_due ASC'
      )
        .bind(userId)
        .all()
      const today = new Date().toISOString().split('T')[0]
      const INCOMPATIBLE = new Set(['neem|potassium-bicarb', 'potassium-bicarb|neem'])
      const withMeta = (results as Record<string, unknown>[]).map((s) => {
        const nextDue = s.next_due as string | null
        const overdue = nextDue ? nextDue < today : false
        const diffDays = nextDue
          ? Math.round((new Date(nextDue).getTime() - new Date(today).getTime()) / 86400000)
          : null
        const conflictWith = results
          .filter((other) => {
            if (other.id === s.id) return false
            const pair = `${s.treatment}|${other.treatment}`
            if (!INCOMPATIBLE.has(pair)) return false
            const otherDue = other.next_due as string | null
            if (!nextDue || !otherDue) return false
            return (
              Math.abs(new Date(nextDue).getTime() - new Date(otherDue).getTime()) <= 2 * 86400000
            )
          })
          .map((o) => o.id)
        return { ...s, overdue, days_until_due: diffDays, conflict_with: conflictWith }
      })
      return json(withMeta)
    }
    if (method === 'POST') {
      const body = (await request.json()) as {
        treatment: string
        interval_days: number
        plant_id?: number | null
        start_date?: string
        notes?: string
      }
      if (!body.treatment?.trim() || !body.interval_days)
        return err('treatment and interval_days required')
      const today = new Date().toISOString().split('T')[0]
      const startDate = body.start_date ?? today
      const startMs = new Date(startDate).getTime()
      const nextDue = new Date(startMs + body.interval_days * 86400000).toISOString().split('T')[0]
      const row = await env.DB.prepare(
        `
        INSERT INTO treatment_schedules (user_id, plant_id, treatment, interval_days, next_due, notes)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING *
      `
      )
        .bind(
          userId,
          body.plant_id ?? null,
          body.treatment.trim(),
          body.interval_days,
          nextDue,
          body.notes ?? null
        )
        .first()
      return json(row, 201)
    }
  }

  // POST /schedules/template
  if (pathname === '/schedules/template' && method === 'POST') {
    const body = (await request.json()) as { template: string; plant_id?: number | null }
    if (body.template !== 'neem-bicarb') return err('unknown template')
    const today = new Date().toISOString().split('T')[0]
    const todayMs = new Date(today).getTime()
    const neemDue = new Date(todayMs + 14 * 86400000).toISOString().split('T')[0]
    const bicarbDue = new Date(todayMs + 7 * 86400000).toISOString().split('T')[0]
    const pid = body.plant_id ?? null
    const [neemRow, bicarbRow] = await Promise.all([
      env.DB.prepare(
        `
        INSERT INTO treatment_schedules (user_id, plant_id, treatment, interval_days, last_applied, next_due)
        VALUES (?, ?, 'neem', 14, ?, ?) RETURNING *
      `
      )
        .bind(userId, pid, today, neemDue)
        .first(),
      env.DB.prepare(
        `
        INSERT INTO treatment_schedules (user_id, plant_id, treatment, interval_days, next_due)
        VALUES (?, ?, 'potassium-bicarb', 14, ?) RETURNING *
      `
      )
        .bind(userId, pid, bicarbDue)
        .first(),
    ])
    return json({ neem: neemRow, potassium_bicarb: bicarbRow }, 201)
  }

  // PUT /schedules/:id  DELETE /schedules/:id  POST /schedules/:id/apply
  const scheduleMatch = pathname.match(/^\/schedules\/(\d+)(\/apply)?$/)
  if (scheduleMatch) {
    const sid = Number(scheduleMatch[1])
    const isApply = !!scheduleMatch[2]

    if (isApply && method === 'POST') {
      const force = url.searchParams.get('force') === 'true'
      const today = new Date().toISOString().split('T')[0]
      const sched = (await env.DB.prepare(
        'SELECT * FROM treatment_schedules WHERE id = ? AND user_id = ?'
      )
        .bind(sid, userId)
        .first()) as Record<string, unknown> | null
      if (!sched) return err('Not found', 404)

      // Conflict check (2-day window)
      if (!force) {
        const INCOMPATIBLE: Record<string, string> = {
          neem: 'potassium-bicarb',
          'potassium-bicarb': 'neem',
        }
        const conflictTreatment = INCOMPATIBLE[sched.treatment as string]
        if (conflictTreatment) {
          const conflict = (await env.DB.prepare(
            `
            SELECT id, next_due FROM treatment_schedules
            WHERE user_id = ? AND treatment = ? AND active = 1
          `
          )
            .bind(userId, conflictTreatment)
            .first()) as { id: number; next_due: string } | null
          if (conflict?.next_due) {
            const diffMs = Math.abs(
              new Date(today).getTime() - new Date(conflict.next_due).getTime()
            )
            if (diffMs <= 2 * 86400000) {
              return json(
                {
                  error: 'conflict',
                  warning: `${sched.treatment} and ${conflictTreatment} are within 2 days of each other`,
                  conflict_with: conflict.id,
                },
                409
              )
            }
          }
        }
      }

      const nextDue = new Date(
        new Date(today).getTime() + (sched.interval_days as number) * 86400000
      )
        .toISOString()
        .split('T')[0]
      await env.DB.prepare(
        'UPDATE treatment_schedules SET last_applied = ?, next_due = ? WHERE id = ? AND user_id = ?'
      )
        .bind(today, nextDue, sid, userId)
        .run()
      return json({ ok: true, last_applied: today, next_due: nextDue })
    }

    if (method === 'PUT') {
      const body = (await request.json()) as Record<string, unknown>
      const allowed = ['treatment', 'interval_days', 'active', 'notes', 'next_due']
      const fields = Object.keys(body).filter((k) => allowed.includes(k))
      if (fields.length === 0) return err('No valid fields')
      const set = fields.map((f) => `${f} = ?`).join(', ')
      await env.DB.prepare(`UPDATE treatment_schedules SET ${set} WHERE id = ? AND user_id = ?`)
        .bind(...fields.map((f) => body[f]), sid, userId)
        .run()
      return json({ ok: true })
    }

    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM treatment_schedules WHERE id = ? AND user_id = ?')
        .bind(sid, userId)
        .run()
      return json({ ok: true })
    }
  }

  return err('Not found', 404)
}
