/**
 * Weather integration for plant-care Cloudflare Worker.
 *
 * HOW TO INTEGRATE
 * ────────────────
 * 1. Run the migration:
 *      wrangler d1 execute plant-care-db --file=weather-integration/migration.sql
 *
 * 2. Add the cron trigger to wrangler.toml:
 *      [triggers]
 *      crons = ["0 6 * * *"]   # 6 AM UTC = 2 AM EDT / 1 AM EST
 *
 * 3. In your worker's main fetch/scheduled handler, add:
 *      import { handleWeatherCron, handleWeatherRoutes } from './weather-integration/weather'
 *
 *    In scheduled():
 *      case 'weather': await handleWeatherCron(env); break
 *    Or just:
 *      await handleWeatherCron(env)
 *
 *    In fetch(), before your 404 fallback:
 *      const weatherResponse = await handleWeatherRoutes(request, env)
 *      if (weatherResponse) return weatherResponse
 *
 * 4. Add DB to your Env interface if not already present:
 *      DB: D1Database
 */

// ── Open-Meteo API types ───────────────────────────────────────────────────────

interface OpenMeteoResponse {
  daily: {
    time:                          string[]
    temperature_2m_max:            number[]
    temperature_2m_min:            number[]
    precipitation_sum:             number[]
    relative_humidity_2m_mean:     number[]
    et0_fao_evapotranspiration:    number[]
  }
}

interface Env {
  DB: D1Database
}

// Brooklyn, NY coordinates
const LAT = '40.6782'
const LON = '-73.9442'

// ── Cron handler ──────────────────────────────────────────────────────────────

/**
 * Fetches yesterday's weather actuals from Open-Meteo and stores them in D1.
 * Call this from your Worker's scheduled() handler.
 */
export async function handleWeatherCron(env: Env): Promise<void> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude',  LAT)
  url.searchParams.set('longitude', LON)
  url.searchParams.set('daily', [
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'relative_humidity_2m_mean',
    'et0_fao_evapotranspiration',
  ].join(','))
  url.searchParams.set('timezone',      'America/New_York')
  url.searchParams.set('past_days',     '1')
  url.searchParams.set('forecast_days', '0')

  const res  = await fetch(url.toString())
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)
  const data = await res.json() as OpenMeteoResponse

  const d    = data.daily
  const date = d.time[0]
  const tmax = d.temperature_2m_max[0]
  const tmin = d.temperature_2m_min[0]
  // Growing degree days: base 10 °C (common base for roses/shrubs)
  const gdd  = Math.max(0, (tmax + tmin) / 2 - 10)

  await env.DB.prepare(`
    INSERT OR REPLACE INTO weather_daily
      (date, max_temp_c, min_temp_c, precip_mm, humidity_pct, et0_mm, gdd)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    date,
    tmax,
    tmin,
    d.precipitation_sum[0],
    Math.round(d.relative_humidity_2m_mean[0]),
    d.et0_fao_evapotranspiration[0],
    Math.round(gdd * 10) / 10,
  ).run()
}

// ── REST endpoints ────────────────────────────────────────────────────────────

/**
 * Handles:
 *   GET /weather/daily?limit=30   — most recent N days
 *   GET /weather/latest           — single most-recent row
 *
 * Returns null if the path doesn't match (caller should fall through).
 */
export async function handleWeatherRoutes(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url     = new URL(request.url)
  const cors    = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

  if (url.pathname === '/weather/latest') {
    const row = await env.DB
      .prepare('SELECT * FROM weather_daily ORDER BY date DESC LIMIT 1')
      .first()
    return new Response(JSON.stringify(row ?? null), { headers: cors })
  }

  if (url.pathname === '/weather/daily') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 365)
    const rows  = await env.DB
      .prepare('SELECT * FROM weather_daily ORDER BY date DESC LIMIT ?')
      .bind(limit)
      .all()
    return new Response(JSON.stringify(rows.results), { headers: cors })
  }

  return null
}
