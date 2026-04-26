interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    const url = new URL(request.url)
    const { pathname } = url
    const method = request.method

    // GET /plants
    if (method === 'GET' && pathname === '/plants') {
      const { results } = await env.DB.prepare('SELECT * FROM plants ORDER BY id').all()
      return json(results)
    }

    // GET /plants/:id  PUT /plants/:id
    const plantMatch = pathname.match(/^\/plants\/(\d+)$/)
    if (plantMatch) {
      const id = Number(plantMatch[1])

      if (method === 'GET') {
        const row = await env.DB.prepare('SELECT * FROM plants WHERE id = ?').bind(id).first()
        if (!row) return err('Not found', 404)
        return json(row)
      }

      if (method === 'PUT') {
        const body = await request.json() as Record<string, unknown>
        const fields = Object.keys(body).filter(k => k !== 'id')
        if (fields.length === 0) return err('No fields to update')
        const set = fields.map(f => `${f} = ?`).join(', ')
        const vals = fields.map(f => body[f])
        await env.DB.prepare(`UPDATE plants SET ${set} WHERE id = ?`)
          .bind(...vals, id)
          .run()
        return json({ ok: true })
      }
    }

    // POST /plants/:id/notes — atomic append
    const notesMatch = pathname.match(/^\/plants\/(\d+)\/notes$/)
    if (notesMatch && method === 'POST') {
      const id = Number(notesMatch[1])
      const { note } = await request.json() as { note: string }
      if (!note?.trim()) return err('note is required')
      await env.DB.prepare(`
        UPDATE plants
        SET notes = CASE
          WHEN notes IS NULL OR notes = '' THEN ?
          ELSE notes || char(10) || ?
        END
        WHERE id = ?
      `).bind(note, note, id).run()
      return json({ ok: true })
    }

    // GET /plants/:id/waterings  POST /plants/:id/waterings
    // Table columns: id, plant_id, volume_ml, source, notes, timestamp
    const wateringsMatch = pathname.match(/^\/plants\/(\d+)\/waterings$/)
    if (wateringsMatch) {
      const id = Number(wateringsMatch[1])

      if (method === 'GET') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
        const { results } = await env.DB
          .prepare('SELECT * FROM watering_events WHERE plant_id = ? ORDER BY timestamp DESC LIMIT ?')
          .bind(id, limit)
          .all()
        return json(results)
      }

      if (method === 'POST') {
        const body = await request.json() as { volume_ml?: number | null; notes?: string }
        await env.DB.prepare(`
          INSERT INTO watering_events (plant_id, volume_ml, source, notes)
          VALUES (?, ?, 'manual', ?)
        `).bind(id, body.volume_ml ?? null, body.notes ?? null).run()
        return json({ ok: true }, 201)
      }
    }

    // GET /plants/:id/photos  POST /plants/:id/photos
    // Table columns: id, plant_id, r2_key, filename, content_type, caption, uploaded_at
    const photosMatch = pathname.match(/^\/plants\/(\d+)\/photos$/)
    if (photosMatch) {
      const id = Number(photosMatch[1])

      if (method === 'GET') {
        const { results } = await env.DB
          .prepare('SELECT * FROM plant_photos WHERE plant_id = ? ORDER BY uploaded_at DESC')
          .bind(id)
          .all()
        return json(results)
      }

      if (method === 'POST') {
        const form = await request.formData()
        const file = form.get('file') as File | null
        const caption = (form.get('caption') as string | null) ?? ''

        if (!file) return err('file is required')

        const ext = file.name.split('.').pop() ?? 'jpg'
        const contentType = file.type || 'image/jpeg'
        const r2Key = `plants/${id}/${Date.now()}.${ext}`

        await env.PHOTOS.put(r2Key, await file.arrayBuffer(), {
          httpMetadata: { contentType },
        })

        await env.DB.prepare(`
          INSERT INTO plant_photos (plant_id, r2_key, filename, content_type, caption)
          VALUES (?, ?, ?, ?, ?)
        `).bind(id, r2Key, file.name, contentType, caption).run()

        return json({ ok: true, r2_key: r2Key }, 201)
      }
    }

    // GET /readings  GET /readings/latest
    if (method === 'GET' && pathname === '/readings/latest') {
      const row = await env.DB
        .prepare('SELECT * FROM sensor_readings ORDER BY recorded_at DESC LIMIT 1')
        .first()
      return json(row ?? null)
    }

    if (method === 'GET' && pathname === '/readings') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const { results } = await env.DB
        .prepare('SELECT * FROM sensor_readings ORDER BY recorded_at DESC LIMIT ? OFFSET ?')
        .bind(limit, offset)
        .all()
      return json(results)
    }

    // GET /weather/latest  GET /weather/daily
    if (method === 'GET' && pathname === '/weather/latest') {
      const row = await env.DB
        .prepare('SELECT * FROM weather_daily ORDER BY date DESC LIMIT 1')
        .first()
        .catch(() => null)
      return json(row ?? null)
    }

    if (method === 'GET' && pathname === '/weather/daily') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 365)
      const results = await env.DB
        .prepare('SELECT * FROM weather_daily ORDER BY date DESC LIMIT ?')
        .bind(limit)
        .all()
        .then(r => r.results)
        .catch(() => [])
      return json(results)
    }

    return err('Not found', 404)
  },
}
