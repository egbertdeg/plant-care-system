import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  MCP_OBJECT: DurableObjectNamespace
}

async function ensureTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS plants (
      id INTEGER PRIMARY KEY, name TEXT, species TEXT, location TEXT,
      indoor_outdoor TEXT DEFAULT 'indoor', size_cm REAL, pot_size_l REAL,
      soil_sensor INTEGER, target_volume_ml REAL, target_interval_days INTEGER,
      notes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS watering_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER NOT NULL, device_id TEXT,
      volume_ml REAL, duration_s INTEGER, avg_volume_ml REAL, source TEXT DEFAULT 'manual',
      notes TEXT, timestamp TEXT DEFAULT (datetime('now')), FOREIGN KEY (plant_id) REFERENCES plants(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sensor_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, light REAL, par REAL,
      temp REAL, humidity REAL, soil1 INTEGER, soil2 INTEGER, soil3 INTEGER,
      timestamp TEXT DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS plant_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER NOT NULL, r2_key TEXT NOT NULL,
      filename TEXT, content_type TEXT, caption TEXT,
      uploaded_at TEXT DEFAULT (datetime('now')), tier TEXT DEFAULT 'round'
    )`),
  ])
}

export class PlantCareMCP extends McpAgent<Env> {
  server = new McpServer({ name: 'Plant Care', version: '1.0.0' })

  async init() {
    const env = this.env
    await ensureTables(env.DB)

    this.server.registerTool(
      'list_plants',
      {
        description: 'List all plants with summary info including watering status',
        inputSchema: {},
      },
      async () => {
        const plants = await env.DB.prepare(`
          SELECT p.*,
            (SELECT MAX(timestamp) FROM watering_events WHERE plant_id = p.id) as last_watered
          FROM plants p ORDER BY p.id
        `).all()
        if (!plants.results.length) {
          return { content: [{ type: 'text' as const, text: 'No plants yet. Use create_plant to add one.' }] }
        }
        const lines = plants.results.map((p: Record<string, unknown>) => {
          const name = (p.name as string) || `Plant #${p.id}`
          const parts = [name]
          if (p.species) parts.push(`(${p.species})`)
          if (p.location) parts.push(`@ ${p.location}`)
          if (p.indoor_outdoor) parts.push(`[${p.indoor_outdoor}]`)
          if (p.last_watered) {
            const days = Math.floor((Date.now() - new Date((p.last_watered as string) + 'Z').getTime()) / 86400000)
            parts.push(`— watered ${days}d ago`)
            if (p.target_interval_days && days > (p.target_interval_days as number)) parts.push('⚠️ OVERDUE')
          }
          return `${p.id}. ${parts.join(' ')}`
        })
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
      }
    )

    this.server.registerTool(
      'get_plant',
      {
        description: 'Get full details for a plant including notes and recent waterings',
        inputSchema: { plant_id: z.number().int().describe('Plant ID') },
      },
      async ({ plant_id }) => {
        const plant = await env.DB.prepare('SELECT * FROM plants WHERE id = ?').bind(plant_id).first() as Record<string, unknown> | null
        if (!plant) return { content: [{ type: 'text' as const, text: `Plant ${plant_id} not found.` }] }
        const waterings = await env.DB.prepare('SELECT * FROM watering_events WHERE plant_id = ? ORDER BY timestamp DESC LIMIT 10').bind(plant_id).all()
        const photos = await env.DB.prepare('SELECT id, filename, caption, uploaded_at FROM plant_photos WHERE plant_id = ? ORDER BY uploaded_at DESC').bind(plant_id).all()
        const sections: string[] = []
        sections.push(`# ${(plant.name as string) || `Plant #${plant.id}`}`)
        if (plant.species) sections.push(`**Species:** ${plant.species}`)
        if (plant.location) sections.push(`**Location:** ${plant.location}`)
        if (plant.indoor_outdoor) sections.push(`**Type:** ${plant.indoor_outdoor}`)
        if (plant.size_cm) sections.push(`**Size:** ${plant.size_cm} cm`)
        if (plant.pot_size_l) sections.push(`**Pot:** ${plant.pot_size_l} L`)
        if (plant.target_volume_ml) sections.push(`**Target water:** ${plant.target_volume_ml} ml`)
        if (plant.target_interval_days) sections.push(`**Water every:** ${plant.target_interval_days} days`)
        if (plant.notes) sections.push(`\n**Notes:**\n${plant.notes}`)
        if (waterings.results.length) {
          sections.push('\n**Recent waterings:**')
          waterings.results.forEach((w: Record<string, unknown>) => {
            const parts = [`- ${w.timestamp}`]
            if (w.volume_ml) parts.push(`${w.volume_ml}ml`)
            if (w.notes) parts.push(`— ${w.notes}`)
            sections.push(parts.join(' '))
          })
        }
        if (photos.results.length) {
          sections.push(`\n**Photos:** ${photos.results.length} photo(s)`)
          photos.results.forEach((ph: Record<string, unknown>) => {
            const parts = [`- #${ph.id}`]
            if (ph.caption) parts.push(ph.caption as string)
            parts.push(`(${ph.uploaded_at})`)
            sections.push(parts.join(' '))
          })
        }
        return { content: [{ type: 'text' as const, text: sections.join('\n') }] }
      }
    )

    this.server.registerTool(
      'create_plant',
      {
        description: 'Create a new plant or update an existing one. All fields except plant_id are optional.',
        inputSchema: {
          plant_id: z.number().int().describe('Plant ID (pick any number)'),
          name: z.string().optional().describe('Plant name'),
          species: z.string().optional().describe('Species'),
          location: z.string().optional().describe('Where the plant is'),
          indoor_outdoor: z.enum(['indoor', 'outdoor']).optional(),
          size_cm: z.number().optional().describe('Plant height in cm'),
          pot_size_l: z.number().optional().describe('Pot volume in liters'),
          soil_sensor: z.number().int().optional().describe('Soil sensor channel (1-3)'),
          target_volume_ml: z.number().optional().describe('Target watering volume in ml'),
          target_interval_days: z.number().int().optional().describe('Days between waterings'),
          notes: z.string().optional().describe('Free-text notes'),
        },
      },
      async (input) => {
        const existing = await env.DB.prepare('SELECT id FROM plants WHERE id = ?').bind(input.plant_id).first()
        if (existing) {
          const updates: string[] = []
          const values: unknown[] = []
          const fields = ['name', 'species', 'location', 'indoor_outdoor', 'size_cm', 'pot_size_l', 'soil_sensor', 'target_volume_ml', 'target_interval_days', 'notes']
          for (const f of fields) {
            if ((input as Record<string, unknown>)[f] !== undefined) {
              updates.push(`${f} = ?`)
              values.push((input as Record<string, unknown>)[f])
            }
          }
          if (updates.length) {
            updates.push("updated_at = datetime('now')")
            values.push(input.plant_id)
            await env.DB.prepare(`UPDATE plants SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
          }
          return { content: [{ type: 'text' as const, text: `Updated plant ${input.plant_id}.` }] }
        } else {
          await env.DB.prepare(`
            INSERT INTO plants (id, name, species, location, indoor_outdoor, size_cm, pot_size_l, soil_sensor, target_volume_ml, target_interval_days, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(input.plant_id, input.name ?? null, input.species ?? null, input.location ?? null,
            input.indoor_outdoor ?? 'indoor', input.size_cm ?? null, input.pot_size_l ?? null,
            input.soil_sensor ?? null, input.target_volume_ml ?? null, input.target_interval_days ?? null, input.notes ?? null).run()
          return { content: [{ type: 'text' as const, text: `Created plant ${input.plant_id}${input.name ? ` (${input.name})` : ''}.` }] }
        }
      }
    )

    this.server.registerTool(
      'delete_plant',
      {
        description: 'Delete a plant and all its waterings and photos',
        inputSchema: { plant_id: z.number().int().describe('Plant ID to delete') },
      },
      async ({ plant_id }) => {
        const photos = await env.DB.prepare('SELECT r2_key FROM plant_photos WHERE plant_id = ?').bind(plant_id).all()
        for (const ph of photos.results as Record<string, unknown>[]) await env.PHOTOS.delete(ph.r2_key as string)
        await env.DB.batch([
          env.DB.prepare('DELETE FROM plant_photos WHERE plant_id = ?').bind(plant_id),
          env.DB.prepare('DELETE FROM watering_events WHERE plant_id = ?').bind(plant_id),
          env.DB.prepare('DELETE FROM plants WHERE id = ?').bind(plant_id),
        ])
        return { content: [{ type: 'text' as const, text: `Deleted plant ${plant_id} and all associated data.` }] }
      }
    )

    this.server.registerTool(
      'log_watering',
      {
        description: 'Log a watering event for a plant',
        inputSchema: {
          plant_id: z.number().int().describe('Plant ID'),
          volume_ml: z.number().optional().describe('Water volume in ml'),
          notes: z.string().optional().describe("Optional notes (e.g. 'with fertilizer')"),
        },
      },
      async ({ plant_id, volume_ml, notes }) => {
        const plant = await env.DB.prepare('SELECT id, name FROM plants WHERE id = ?').bind(plant_id).first() as Record<string, unknown> | null
        if (!plant) return { content: [{ type: 'text' as const, text: `Plant ${plant_id} not found.` }] }
        await env.DB.prepare("INSERT INTO watering_events (plant_id, volume_ml, source, notes) VALUES (?, ?, 'manual', ?)").bind(plant_id, volume_ml ?? null, notes ?? null).run()
        const name = (plant.name as string) || `Plant #${plant_id}`
        return { content: [{ type: 'text' as const, text: volume_ml ? `Logged ${volume_ml}ml watering for ${name}.` : `Logged watering for ${name}.` }] }
      }
    )

    this.server.registerTool(
      'get_watering_history',
      {
        description: 'View watering history for a plant',
        inputSchema: {
          plant_id: z.number().int().describe('Plant ID'),
          limit: z.number().int().optional().describe('Number of events to show (default 20)'),
        },
      },
      async ({ plant_id, limit }) => {
        const rows = await env.DB.prepare('SELECT * FROM watering_events WHERE plant_id = ? ORDER BY timestamp DESC LIMIT ?').bind(plant_id, limit ?? 20).all()
        if (!rows.results.length) return { content: [{ type: 'text' as const, text: `No watering history for plant ${plant_id}.` }] }
        const lines = (rows.results as Record<string, unknown>[]).map(w => {
          const parts = [`${w.timestamp}`]
          if (w.volume_ml) parts.push(`${w.volume_ml}ml`)
          if (w.notes) parts.push(`— ${w.notes}`)
          return `- ${parts.join(' ')}`
        })
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
      }
    )

    this.server.registerTool(
      'add_note',
      {
        description: "Append a note to a plant's notes field (with timestamp)",
        inputSchema: {
          plant_id: z.number().int().describe('Plant ID'),
          note: z.string().describe('Note to add'),
        },
      },
      async ({ plant_id, note }) => {
        const plant = await env.DB.prepare('SELECT id, name, notes FROM plants WHERE id = ?').bind(plant_id).first() as Record<string, unknown> | null
        if (!plant) return { content: [{ type: 'text' as const, text: `Plant ${plant_id} not found.` }] }
        const date = new Date().toISOString().slice(0, 10)
        const entry = `[${date}] ${note}`
        const newNotes = plant.notes ? `${plant.notes}\n${entry}` : entry
        await env.DB.prepare("UPDATE plants SET notes = ?, updated_at = datetime('now') WHERE id = ?").bind(newNotes, plant_id).run()
        return { content: [{ type: 'text' as const, text: `Added note to ${(plant.name as string) || `Plant #${plant_id}`}.` }] }
      }
    )

    this.server.registerTool(
      'upload_photo',
      {
        description: 'Upload a photo for a plant. Provide the image as a base64-encoded string.',
        inputSchema: {
          plant_id: z.number().int().describe('Plant ID'),
          base64_data: z.string().describe('Base64-encoded image data'),
          filename: z.string().optional().describe('Original filename'),
          caption: z.string().optional().describe('Photo caption'),
          content_type: z.string().optional().describe('MIME type (default image/jpeg)'),
        },
      },
      async ({ plant_id, base64_data, filename, caption, content_type }) => {
        const plant = await env.DB.prepare('SELECT id FROM plants WHERE id = ?').bind(plant_id).first()
        if (!plant) return { content: [{ type: 'text' as const, text: `Plant ${plant_id} not found.` }] }
        const mime = content_type || 'image/jpeg'
        const ext = mime.split('/')[1] || 'jpg'
        const r2Key = `plants/${plant_id}/${Date.now()}.${ext}`
        const bytes = Uint8Array.from(atob(base64_data), c => c.charCodeAt(0))
        await env.PHOTOS.put(r2Key, bytes, { httpMetadata: { contentType: mime } })
        await env.DB.prepare('INSERT INTO plant_photos (plant_id, r2_key, filename, content_type, caption) VALUES (?, ?, ?, ?, ?)').bind(plant_id, r2Key, filename ?? null, mime, caption ?? null).run()
        return { content: [{ type: 'text' as const, text: `Photo uploaded for plant ${plant_id}.${caption ? ` Caption: ${caption}` : ''}` }] }
      }
    )

    this.server.registerTool(
      'list_photos',
      {
        description: 'List all photos for a plant',
        inputSchema: { plant_id: z.number().int().describe('Plant ID') },
      },
      async ({ plant_id }) => {
        const photos = await env.DB.prepare('SELECT id, filename, caption, uploaded_at FROM plant_photos WHERE plant_id = ? ORDER BY uploaded_at DESC').bind(plant_id).all()
        if (!photos.results.length) return { content: [{ type: 'text' as const, text: `No photos for plant ${plant_id}.` }] }
        const lines = (photos.results as Record<string, unknown>[]).map(ph => {
          const parts = [`#${ph.id}`]
          if (ph.caption) parts.push(ph.caption as string)
          if (ph.filename) parts.push(`(${ph.filename})`)
          parts.push(`— ${ph.uploaded_at}`)
          return `- ${parts.join(' ')}`
        })
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
      }
    )

    this.server.registerTool(
      'delete_photo',
      {
        description: 'Delete a photo by its ID',
        inputSchema: { photo_id: z.number().int().describe('Photo ID') },
      },
      async ({ photo_id }) => {
        const photo = await env.DB.prepare('SELECT r2_key FROM plant_photos WHERE id = ?').bind(photo_id).first() as Record<string, unknown> | null
        if (!photo) return { content: [{ type: 'text' as const, text: `Photo ${photo_id} not found.` }] }
        await env.PHOTOS.delete(photo.r2_key as string)
        await env.DB.prepare('DELETE FROM plant_photos WHERE id = ?').bind(photo_id).run()
        return { content: [{ type: 'text' as const, text: `Deleted photo ${photo_id}.` }] }
      }
    )

    this.server.registerTool(
      'get_sensor_readings',
      {
        description: 'Get recent sensor readings (temperature, humidity, light, soil moisture)',
        inputSchema: {
          limit: z.number().int().optional().describe('Number of readings (default 10)'),
          device_id: z.string().optional().describe('Filter by device ID'),
        },
      },
      async ({ limit, device_id }) => {
        let query = 'SELECT * FROM sensor_readings'
        const params: unknown[] = []
        if (device_id) { query += ' WHERE device_id = ?'; params.push(device_id) }
        query += ' ORDER BY timestamp DESC LIMIT ?'
        params.push(limit ?? 10)
        const rows = await env.DB.prepare(query).bind(...params).all()
        if (!rows.results.length) return { content: [{ type: 'text' as const, text: 'No sensor readings found.' }] }
        const lines = (rows.results as Record<string, unknown>[]).map(r =>
          `- ${r.timestamp} | ${r.temp}°C ${r.humidity}% RH | ${r.light} lux | soil: ${r.soil1}/${r.soil2}/${r.soil3}`
        )
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
      }
    )

    this.server.registerTool(
      'search_plants',
      {
        description: 'Search plants by name, species, location, or notes content',
        inputSchema: { query: z.string().describe('Search term') },
      },
      async ({ query }) => {
        const q = `%${query}%`
        const results = await env.DB.prepare(`
          SELECT id, name, species, location FROM plants
          WHERE name LIKE ? OR species LIKE ? OR location LIKE ? OR notes LIKE ?
          ORDER BY id
        `).bind(q, q, q, q).all()
        if (!results.results.length) return { content: [{ type: 'text' as const, text: `No plants matching "${query}".` }] }
        const lines = (results.results as Record<string, unknown>[]).map(p =>
          `${p.id}. ${(p.name as string) || `Plant #${p.id}`}${p.species ? ` (${p.species})` : ''}${p.location ? ` @ ${p.location}` : ''}`
        )
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
      }
    )

    this.server.registerTool(
      'get_photo',
      {
        description: 'Fetch a photo by ID. Returns the image inline so Claude can view it, plus caption and date. Use after list_photos to get the photo_id.',
        inputSchema: { photo_id: z.number().int().describe('Photo ID from list_photos') },
      },
      async ({ photo_id }) => {
        const photo = await env.DB.prepare('SELECT * FROM plant_photos WHERE id = ?').bind(photo_id).first() as Record<string, unknown> | null
        if (!photo) return { content: [{ type: 'text' as const, text: `Photo ${photo_id} not found.` }] }

        const obj = await env.PHOTOS.get(photo.r2_key as string)
        if (!obj) return { content: [{ type: 'text' as const, text: 'Photo data not found in storage.' }] }

        const bytes = new Uint8Array(await obj.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
        }
        const base64 = btoa(binary)
        const mimeType = (photo.content_type as string) || 'image/jpeg'

        return {
          content: [
            { type: 'image' as const, data: base64, mimeType },
            { type: 'text' as const, text: `Photo #${photo.id} for plant ${photo.plant_id}${photo.caption ? ` — ${photo.caption}` : ''}${photo.uploaded_at ? ` (${photo.uploaded_at})` : ''}` },
          ],
        }
      }
    )
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
      return PlantCareMCP.serve('/mcp').fetch(request, env, ctx)
    }
    if (url.pathname === '/') {
      return new Response('Plant Care MCP Server is running. Connect via /mcp', {
        headers: { 'content-type': 'text/plain' },
      })
    }
    return new Response('Not found', { status: 404 })
  },
}
