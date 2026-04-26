interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  ANTHROPIC_API_KEY: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

    // GET /plants/:id/care  POST /plants/:id/care
    const careMatch = pathname.match(/^\/plants\/(\d+)\/care$/)
    if (careMatch) {
      const id = Number(careMatch[1])

      if (method === 'GET') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
        const { results } = await env.DB
          .prepare('SELECT * FROM care_events WHERE plant_id = ? ORDER BY recorded_at DESC LIMIT ?')
          .bind(id, limit).all()
        return json(results)
      }

      if (method === 'POST') {
        const body = await request.json() as {
          watered: boolean
          volume_ml?: number | null
          fertilizer?: 'liquid' | 'rose-tone' | null
          pruned?: boolean
          notes?: string | null
        }

        await env.DB.prepare(`
          INSERT INTO care_events (plant_id, watered, volume_ml, fertilizer, pruned, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          body.watered ? 1 : 0,
          body.watered ? (body.volume_ml ?? null) : null,
          body.fertilizer ?? null,
          body.pruned ? 1 : 0,
          body.notes?.trim() || null,
        ).run()

        // Auto-append a dated note to plants.notes
        const today = new Date().toISOString().split('T')[0]
        const parts: string[] = []
        if (body.watered && body.volume_ml) parts.push(`${body.volume_ml}ml water`)
        else if (!body.watered) parts.push('no water')
        if (body.fertilizer === 'liquid')     parts.push('liquid feed')
        if (body.fertilizer === 'rose-tone')  parts.push('Rose-Tone')
        if (body.pruned)                       parts.push('pruned')
        if (body.notes?.trim())               parts.push(body.notes.trim())

        let category = 'General'
        if (body.watered)                                               category = 'Watering'
        else if (body.fertilizer && !body.pruned)                       category = 'Feeding'
        else if (!body.fertilizer && body.pruned)                       category = 'Pruning'

        const note = `[${today}] ${category}: ${parts.join(', ')}.`
        await env.DB.prepare(`
          UPDATE plants SET notes = CASE
            WHEN notes IS NULL OR notes = '' THEN ?
            ELSE notes || char(10) || ?
          END WHERE id = ?
        `).bind(note, note, id).run()

        return json({ ok: true }, 201)
      }
    }

    // GET /plants/:id/photos  POST /plants/:id/photos
    // Table columns: id, plant_id, r2_key, filename, content_type, caption, uploaded_at
    const photosMatch = pathname.match(/^\/plants\/(\d+)\/photos$/)
    if (photosMatch) {
      const id = Number(photosMatch[1])

      if (method === 'GET') {
        const tierFilter = url.searchParams.get('tier')
        const { results } = tierFilter
          ? await env.DB
              .prepare('SELECT * FROM plant_photos WHERE plant_id = ? AND tier = ? ORDER BY uploaded_at DESC')
              .bind(id, tierFilter)
              .all()
          : await env.DB
              .prepare('SELECT * FROM plant_photos WHERE plant_id = ? ORDER BY uploaded_at DESC')
              .bind(id)
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
        const r2Key = tier === 'hero'
          ? `plants/${id}/hero.${ext}`
          : `plants/${id}/${Date.now()}.${ext}`

        // Hero: replace existing hero in R2 + DB before inserting new one
        if (tier === 'hero') {
          const existing = await env.DB
            .prepare('SELECT r2_key FROM plant_photos WHERE plant_id = ? AND tier = ?')
            .bind(id, 'hero')
            .first()
          if (existing) {
            await env.PHOTOS.delete(existing.r2_key as string)
            await env.DB.prepare('DELETE FROM plant_photos WHERE plant_id = ? AND tier = ?')
              .bind(id, 'hero').run()
          }
        }

        await env.PHOTOS.put(r2Key, await file.arrayBuffer(), {
          httpMetadata: { contentType },
        })

        await env.DB.prepare(`
          INSERT INTO plant_photos (plant_id, r2_key, filename, content_type, caption, tier, uploaded_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        `).bind(id, r2Key, file.name, contentType, caption, tier, uploadedAt).run()

        return json({ ok: true, r2_key: r2Key }, 201)
      }
    }

    // DELETE /plants/:id/photos/:photoId
    const photoDeleteMatch = pathname.match(/^\/plants\/(\d+)\/photos\/(\d+)$/)
    if (photoDeleteMatch && method === 'DELETE') {
      const photoId = Number(photoDeleteMatch[2])
      await env.DB.prepare('DELETE FROM plant_photos WHERE id = ?').bind(photoId).run()
      return json({ ok: true })
    }

    // GET /plants/needs-water — plant_ids with moisture ≤ 4 in past 24h and no watering since
    if (method === 'GET' && pathname === '/plants/needs-water') {
      const { results } = await env.DB.prepare(`
        SELECT DISTINCT mr.plant_id
        FROM manual_readings mr
        WHERE mr.type = 'moisture'
          AND mr.value <= 4
          AND mr.recorded_at >= datetime('now', '-24 hours')
          AND NOT EXISTS (
            SELECT 1 FROM care_events ce
            WHERE ce.plant_id = mr.plant_id
              AND ce.watered = 1
              AND ce.recorded_at > mr.recorded_at
          )
      `).all()
      return json(results.map((r: Record<string, unknown>) => r.plant_id))
    }

    // GET /plants/:id/readings  POST /plants/:id/readings
    const readingsMatch = pathname.match(/^\/plants\/(\d+)\/readings$/)
    if (readingsMatch) {
      const id = Number(readingsMatch[1])

      if (method === 'GET') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
        const { results } = await env.DB
          .prepare('SELECT * FROM manual_readings WHERE plant_id = ? ORDER BY recorded_at DESC LIMIT ?')
          .bind(id, limit)
          .all()
        return json(results)
      }

      if (method === 'POST') {
        const body = await request.json() as { type: string; value: number; unit?: string; recorded_at?: string }
        if (!body.type || body.value === undefined) return err('type and value are required')
        await env.DB.prepare(`
          INSERT INTO manual_readings (plant_id, type, value, unit, recorded_at)
          VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
        `).bind(id, body.type, body.value, body.unit ?? '', body.recorded_at ?? null).run()
        return json({ ok: true }, 201)
      }
    }

    // GET /garden/notes  POST /garden/notes
    if (pathname === '/garden/notes') {
      if (method === 'GET') {
        const limit    = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
        const category = url.searchParams.get('category')
        const { results } = category
          ? await env.DB
              .prepare('SELECT * FROM garden_notes WHERE category = ? ORDER BY recorded_at DESC LIMIT ?')
              .bind(category, limit).all()
          : await env.DB
              .prepare('SELECT * FROM garden_notes ORDER BY recorded_at DESC LIMIT ?')
              .bind(limit).all()
        return json(results)
      }
      if (method === 'POST') {
        const { category, body } = await request.json() as { category: string; body: string }
        if (!category?.trim() || !body?.trim()) return err('category and body are required')
        await env.DB.prepare('INSERT INTO garden_notes (category, body) VALUES (?, ?)')
          .bind(category.trim(), body.trim()).run()
        return json({ ok: true }, 201)
      }
    }

    // POST /admin/migrate — idempotent, creates/alters tables if missing
    if (method === 'POST' && pathname === '/admin/migrate') {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS manual_readings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plant_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          value REAL NOT NULL,
          unit TEXT NOT NULL DEFAULT '',
          recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (plant_id) REFERENCES plants(id)
        )
      `).run()
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS garden_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL DEFAULT 'General',
          body TEXT NOT NULL,
          recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `).run()
      await env.DB.prepare(`
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
      `).run()
      // Add tier column to plant_photos — ignore error if already exists
      try {
        await env.DB.prepare(
          `ALTER TABLE plant_photos ADD COLUMN tier TEXT NOT NULL DEFAULT 'round'`
        ).run()
      } catch { /* column already exists */ }
      return json({ ok: true, message: 'migration complete' })
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

    // POST /plants/:id/chat — one chat turn, returns { reply: string }
    const chatMatch = pathname.match(/^\/plants\/(\d+)\/chat$/)
    if (chatMatch && method === 'POST') {
      const id = Number(chatMatch[1])
      const { messages } = await request.json() as { messages: ChatMessage[] }
      if (!Array.isArray(messages)) return err('messages array required')

      const plant = await env.DB.prepare('SELECT * FROM plants WHERE id = ?').bind(id).first() as Record<string, unknown> | null
      if (!plant) return err('Plant not found', 404)

      const { results: readings } = await env.DB
        .prepare("SELECT type, value, unit, recorded_at FROM manual_readings WHERE plant_id = ? ORDER BY recorded_at DESC LIMIT 6")
        .bind(id).all() as { results: Record<string, unknown>[] }

      const { results: gardenNotes } = await env.DB
        .prepare('SELECT category, body FROM garden_notes ORDER BY recorded_at DESC LIMIT 10')
        .all() as { results: Record<string, unknown>[] }

      const moistureReadings = readings.filter(r => r.type === 'moisture').slice(0, 3)
      const phReadings      = readings.filter(r => r.type === 'ph').slice(0, 3)

      const notesSnippet = typeof plant.notes === 'string' && plant.notes.trim()
        ? plant.notes.trim().split('\n').slice(-5).join('\n')
        : 'No notes yet.'

      const readingLines = [
        ...moistureReadings.map(r => `Moisture ${r.value} (${r.recorded_at})`),
        ...phReadings.map(r => `pH ${r.value} (${r.recorded_at})`),
      ].join('\n') || 'No recent sensor readings.'

      const gardenContext = gardenNotes.length > 0
        ? gardenNotes.map(n => `[${n.category}]\n${n.body}`).join('\n\n---\n\n')
        : 'No garden-wide notes yet.'

      const systemPrompt = `You are a knowledgeable plant care assistant for Egbert's NYC front-entrance container garden — 10 outdoor roses and shrubs growing in containers.

Your role in this chat:
- Talk about this specific plant: its health, appearance, care needs, and any problems
- Draw on your rose and shrub knowledge to diagnose issues and suggest actions
- Ask good follow-up questions to understand what the gardener is seeing (e.g. "Which leaves — new growth or old?", "Does the soil feel dry an inch down?")
- Keep replies short and practical — this is a mobile app used outdoors with dirty hands
- When the gardener asks about a procedure (e.g. taking a pH reading), refer to the garden-wide knowledge below

About notes: this entire conversation is automatically saved as a plant note when the gardener taps "Finish". You do not need to say you can't update records — the note is created from this chat. Feel free to say things like "I'll note that" or "worth tracking". Just focus on being helpful.

Plant: ${plant.name} (${plant.label ?? `ID ${id}`})

Recent care notes:
${notesSnippet}

Recent sensor readings:
${readingLines}

Garden-wide knowledge:
${gardenContext}`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: systemPrompt,
          messages,
        }),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText)
        return err(`Claude API error: ${text}`, 502)
      }

      const data = await response.json() as { content: { type: string; text: string }[] }
      const reply = data.content.find(c => c.type === 'text')?.text ?? ''
      return json({ reply })
    }

    // POST /plants/:id/chat/summarize — summarize conversation → save note → return { note }
    const summarizeMatch = pathname.match(/^\/plants\/(\d+)\/chat\/summarize$/)
    if (summarizeMatch && method === 'POST') {
      const id = Number(summarizeMatch[1])
      const { messages } = await request.json() as { messages: ChatMessage[] }
      if (!Array.isArray(messages) || messages.length === 0) return err('messages array required')

      const plant = await env.DB.prepare('SELECT name, label FROM plants WHERE id = ?').bind(id).first() as Record<string, unknown> | null
      if (!plant) return err('Plant not found', 404)

      const today = new Date().toISOString().split('T')[0]
      const summarizePrompt = `You are summarizing a plant care conversation into structured notes.

Plant: ${plant.name} (${plant.label ?? `ID ${id}`})
Today: ${today}

Conversation:
${messages.map(m => `${m.role === 'user' ? 'Gardener' : 'Assistant'}: ${m.content}`).join('\n')}

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

      const data = await response.json() as { content: { type: string; text: string }[] }
      const raw  = (data.content.find(c => c.type === 'text')?.text ?? '').trim()
                    .replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()

      let plantNote  = ''
      let gardenNote: { category: string; body: string } | null = null

      try {
        const parsed = JSON.parse(raw)
        plantNote  = (parsed.plant_note ?? '').trim()
        gardenNote = parsed.garden_note ?? null
      } catch {
        plantNote = raw  // fallback: treat whole response as plant note
      }

      if (plantNote) {
        await env.DB.prepare(`
          UPDATE plants
          SET notes = CASE
            WHEN notes IS NULL OR notes = '' THEN ?
            ELSE notes || char(10) || ?
          END
          WHERE id = ?
        `).bind(plantNote, plantNote, id).run()
      }

      if (gardenNote?.body?.trim()) {
        await env.DB.prepare('INSERT INTO garden_notes (category, body) VALUES (?, ?)')
          .bind(gardenNote.category ?? 'General', gardenNote.body.trim()).run()
      }

      return json({ plant_note: plantNote, garden_note: gardenNote ?? undefined })
    }

    return err('Not found', 404)
  },
}
