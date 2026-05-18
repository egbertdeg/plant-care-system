import { useState, useEffect, Component, type ReactNode } from 'react'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message + '\n' + e.stack }
  }
  render() {
    if (this.state.error)
      return (
        <pre
          style={{
            color: 'var(--red)',
            background: 'var(--surface)',
            padding: 20,
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {this.state.error}
        </pre>
      )
    return this.props.children
  }
}
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────────

interface WeatherRow {
  date: string
  et0_mm: number
  precip_mm: number
  is_forecast: number
}

interface WateringEvent {
  date: string
  volume_ml: number | null
}

interface MoistureReading {
  id: number
  value: number
  recorded_at: string
  stale: boolean
}

interface DailyRow {
  date: string
  et0_mm: number
  precip_mm: number
  eff_rain_mm: number
  net_draw_mm: number
  cumul_deficit_mm: number
  moisture_anchor: number | null
  is_forecast: number
}

interface DebugPlant {
  id: number
  label: string | null
  name: string
  indoor_outdoor: string
  et0_budget_mm: number
  min_moisture: number
  last_watered: string | null
  soil_deficit_mm: number | null
  anchor_date: string | null
  anchor_moisture: number | null
  needs_water: boolean
  reason: string | null
  days_until_due: number | null
  forecast_next_due: string | null
  latest_moisture: number | null
  watering_events: WateringEvent[]
  moisture_readings: MoistureReading[]
  daily: DailyRow[]
}

interface DebugData {
  weather: WeatherRow[]
  plants: DebugPlant[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—'
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateShort(s: string) {
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
}

function statusColor(p: DebugPlant): string {
  if (p.needs_water) return 'var(--red)'
  if (p.days_until_due !== null && p.days_until_due <= 2) return 'var(--orange)'
  return 'transparent'
}

function statusText(p: DebugPlant): string {
  if (p.needs_water) return p.reason ?? 'yes'
  if (p.days_until_due !== null && p.days_until_due <= 2) return `${p.days_until_due}d`
  return '—'
}

function pct(deficit: number | null, budget: number): string {
  if (deficit === null) return '—'
  return `${Math.round((deficit / budget) * 100)}%`
}

function moistureAge(p: DebugPlant): string {
  const r = p.moisture_readings
    .filter((m) => !m.stale)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
  if (!r) return '—'
  const ms = Date.now() - new Date(r.recorded_at).getTime()
  const days = Math.round(ms / 86400000)
  return days === 0 ? 'today' : `${days}d ago`
}

// ── Weather Strip ──────────────────────────────────────────────────────────────

function WeatherStrip({ rows }: { rows: WeatherRow[] }) {
  const chartData = rows.map((w) => ({
    date: w.date,
    label: fmtDateShort(w.date),
    et0: w.et0_mm ?? 0,
    effRain: (w.precip_mm ?? 0) * 0.4,
    netDraw: (w.et0_mm ?? 0) - (w.precip_mm ?? 0) * 0.4,
    forecast: w.is_forecast === 1,
  }))

  const todayLabel = fmtDateShort(new Date().toISOString().split('T')[0])
  const todayInData = chartData.some((d) => d.label === todayLabel)

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-dim)',
          marginBottom: 10,
        }}
      >
        Weather — last 30 days + forecast
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
            interval={Math.floor(chartData.length / 8)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
            tickFormatter={(v) => `${v} mm`}
            width={56}
            label={{
              value: 'mm / day',
              angle: -90,
              position: 'insideLeft',
              offset: 14,
              style: { fontSize: 10, fill: 'var(--text-dim)' },
            }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--text-dim)' }}
            formatter={(value) => [`${Number(value).toFixed(1)} mm`]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: 'var(--text-dim)', paddingTop: 6 }}
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                et0: 'ET0 (evapotranspiration)',
                effRain: 'Effective rain (×0.4)',
                netDraw: 'Net draw (ET0 − rain)',
              }
              return labels[value] ?? value
            }}
          />
          <ReferenceLine y={0} stroke="var(--text-dim)" strokeWidth={1} />
          {todayInData && (
            <ReferenceLine
              x={todayLabel}
              stroke="var(--green)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: 'today',
                position: 'top',
                fill: 'var(--green)',
                fontSize: 10,
              }}
            />
          )}
          <Bar dataKey="et0" name="et0" fill="rgba(66,165,245,0.6)" stackId="a" />
          <Bar dataKey="effRain" name="effRain" fill="rgba(76,175,80,0.7)" stackId="b" />
          <Line
            dataKey="netDraw"
            name="netDraw"
            type="monotone"
            stroke="var(--red)"
            dot={false}
            strokeWidth={1.5}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Plant Status Table ─────────────────────────────────────────────────────────

function PlantTable({
  plants,
  selectedId,
  onSelect,
}: {
  plants: DebugPlant[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-dim)',
          padding: '12px 14px 8px',
        }}
      >
        Plant Status — click row for detail chart
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                'Plant',
                'Last watered',
                'Deficit',
                'Budget',
                '%',
                'Moisture',
                'Age',
                'Status',
                'Forecast due',
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '6px 10px',
                    textAlign: 'left',
                    color: 'var(--text-dim)',
                    fontWeight: 600,
                    fontSize: 11,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plants.map((p) => {
              const color = statusColor(p)
              const isSelected = p.id === selectedId
              return (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: isSelected
                      ? 'var(--green-dim)'
                      : color !== 'transparent'
                        ? `${color}18`
                        : undefined,
                  }}
                >
                  <td style={{ padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {isSelected && <span style={{ color: 'var(--green)', marginRight: 4 }}>▶</span>}
                    {p.label ?? `P${p.id}`}{' '}
                    <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>{p.name}</span>
                  </td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    {fmtDate(p.last_watered)}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {p.soil_deficit_mm !== null ? `${p.soil_deficit_mm.toFixed(1)}mm` : '—'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {p.indoor_outdoor === 'indoor' ? 'indoor' : `${p.et0_budget_mm}mm`}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      fontWeight: 700,
                      color: p.needs_water ? 'var(--red)' : undefined,
                    }}
                  >
                    {p.indoor_outdoor === 'indoor' ? '—' : pct(p.soil_deficit_mm, p.et0_budget_mm)}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{p.latest_moisture ?? '—'}</td>
                  <td
                    style={{ padding: '8px 10px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}
                  >
                    {moistureAge(p)}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      fontWeight: 700,
                      color: color !== 'transparent' ? color : 'var(--green)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {statusText(p)}
                  </td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    {fmtDate(p.forecast_next_due)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Per-Plant Detail Chart ─────────────────────────────────────────────────────

function PlantDetailChart({ plant }: { plant: DebugPlant }) {
  // Build chart data merging daily rows with moisture readings and watering events
  const wateringDates = new Set(plant.watering_events.map((w) => w.date))
  const todayLabel = fmtDateShort(new Date().toISOString().split('T')[0])

  const chartData = plant.daily.map((d) => {
    const moistureOnDay = plant.moisture_readings.find((m) => m.recorded_at.startsWith(d.date))
    return {
      date: d.date,
      label: fmtDateShort(d.date),
      netDraw: d.net_draw_mm ?? 0,
      cumulDeficit: d.cumul_deficit_mm ?? 0,
      moisture: moistureOnDay && !moistureOnDay.stale ? moistureOnDay.value : undefined,
      moistureStale: moistureOnDay?.stale ? moistureOnDay.value : undefined,
      watered: wateringDates.has(d.date) ? plant.et0_budget_mm : undefined,
      forecast: d.is_forecast === 1,
    }
  })

  const wateringRefDates = plant.watering_events
    .map((w) => w.date)
    .filter((d) => plant.daily.some((row) => row.date === d))

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          {plant.label} {plant.name}
        </span>
        <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-dim)' }}>
          Budget {plant.et0_budget_mm}mm · min moisture {plant.min_moisture} · last watered{' '}
          {fmtDate(plant.last_watered)}
          {plant.anchor_date && plant.anchor_moisture !== null && (
            <span style={{ color: 'var(--blue)', marginLeft: 6 }}>
              · recalibrated {fmtDate(plant.anchor_date)} (moisture={plant.anchor_moisture})
            </span>
          )}
        </span>
      </div>

      {/* Chart key */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: 11, color: 'var(--text-dim)', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 3, height: 14, background: 'var(--green)', borderRadius: 1 }} />
          Watered
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 14, height: 8, background: 'rgba(255,152,0,0.5)', borderRadius: 2 }} />
          Soil dryness
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 14, height: 8, background: 'rgba(244,67,54,0.35)', borderRadius: 2 }} />
          Daily water loss
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />
          Moisture reading
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--text-dimmer)', opacity: 0.6 }} />
          Old reading (ignored)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 48, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
            interval={Math.floor(chartData.length / 8)}
          />
          <YAxis
            yAxisId="deficit"
            domain={[0, Math.ceil(plant.et0_budget_mm * 1.3)]}
            tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
            unit="mm"
            width={40}
          />
          <YAxis
            yAxisId="moisture"
            orientation="right"
            domain={[0, 10]}
            tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
            width={36}
            label={{
              value: 'moisture',
              angle: 90,
              position: 'insideRight',
              offset: 12,
              style: { fontSize: 10, fill: 'var(--text-dim)' },
            }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--text-dim)' }}
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                netDraw: 'Daily water loss',
                cumulDeficit: 'Soil dryness',
                moisture: 'Moisture reading',
                moistureStale: 'Old reading (ignored)',
              }
              return [`${Number(value).toFixed(1)}`, labels[name as string] ?? name]
            }}
          />
          <ReferenceLine
            yAxisId="deficit"
            y={plant.et0_budget_mm}
            stroke="var(--red)"
            strokeDasharray="4 3"
            label={{ value: `water now (${plant.et0_budget_mm}mm)`, position: 'right', fontSize: 10, fill: 'var(--red)' }}
          />
          {wateringRefDates.map((d) => (
            <ReferenceLine
              key={d}
              yAxisId="deficit"
              x={fmtDateShort(d)}
              stroke="var(--green)"
              strokeWidth={2}
            />
          ))}
          {chartData.some((d) => d.label === todayLabel) && (
            <ReferenceLine
              yAxisId="deficit"
              x={todayLabel}
              stroke="var(--green)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: 'today', position: 'top', fill: 'var(--green)', fontSize: 10 }}
            />
          )}
          <Bar yAxisId="deficit" dataKey="netDraw" name="netDraw" fill="rgba(244,67,54,0.35)" />
          <Area
            yAxisId="deficit"
            dataKey="cumulDeficit"
            name="cumulDeficit"
            type="monotone"
            stroke="var(--orange)"
            fill="rgba(255,152,0,0.15)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="moisture"
            dataKey="moisture"
            name="moisture"
            type="linear"
            stroke="var(--blue)"
            strokeWidth={0}
            dot={{ r: 4, fill: 'var(--blue)', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'var(--blue)' }}
            connectNulls={false}
          />
          <Line
            yAxisId="moisture"
            dataKey="moistureStale"
            name="moistureStale"
            type="linear"
            stroke="var(--text-dim)"
            strokeWidth={0}
            dot={{ r: 4, fill: 'var(--text-dim)', strokeWidth: 0, opacity: 0.5 }}
            activeDot={{ r: 5, fill: 'var(--text-dim)' }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Raw data table */}
      <div style={{ marginTop: 14, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                'Date',
                'ET0',
                'Precip',
                'Eff. rain',
                'Net draw',
                'Cumul. deficit',
                'Moisture',
                'Event',
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '5px 8px',
                    textAlign: 'left',
                    color: 'var(--text-dim)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...plant.daily].reverse().map((d) => {
              const waterEvent = plant.watering_events.find((w) => w.date === d.date)
              const mReading = plant.moisture_readings
                .filter((m) => m.recorded_at.startsWith(d.date))
                .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
              const isForecast = d.is_forecast === 1
              return (
                <tr
                  key={d.date}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    opacity: isForecast ? 0.7 : 1,
                    fontStyle: isForecast ? 'italic' : undefined,
                  }}
                >
                  <td
                    style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: 'var(--text-dim)' }}
                  >
                    {fmtDate(d.date)}
                    {isForecast ? ' ▸' : ''}
                  </td>
                  <td style={{ padding: '5px 8px' }}>{(d.et0_mm ?? 0).toFixed(1)}</td>
                  <td style={{ padding: '5px 8px' }}>{(d.precip_mm ?? 0).toFixed(1)}</td>
                  <td style={{ padding: '5px 8px' }}>{(d.eff_rain_mm ?? 0).toFixed(1)}</td>
                  <td
                    style={{
                      padding: '5px 8px',
                      color: (d.net_draw_mm ?? 0) > 0 ? 'var(--red)' : 'var(--text-dim)',
                    }}
                  >
                    {(d.net_draw_mm ?? 0).toFixed(1)}
                  </td>
                  <td
                    style={{
                      padding: '5px 8px',
                      fontWeight:
                        (d.cumul_deficit_mm ?? 0) >= (plant.et0_budget_mm ?? 25) ? 700 : undefined,
                      color:
                        (d.cumul_deficit_mm ?? 0) >= (plant.et0_budget_mm ?? 25)
                          ? 'var(--red)'
                          : undefined,
                    }}
                  >
                    {(d.cumul_deficit_mm ?? 0).toFixed(1)}
                  </td>
                  <td
                    style={{
                      padding: '5px 8px',
                      color: mReading?.stale ? 'var(--text-dimmer)' : undefined,
                    }}
                  >
                    {mReading ? `${mReading.value}${mReading.stale ? ' (stale)' : ''}` : '—'}
                  </td>
                  <td style={{ padding: '5px 8px', color: 'var(--green)' }}>
                    {waterEvent ? `💧 ${waterEvent.volume_ml != null ? `${waterEvent.volume_ml}ml` : 'soaked'}` : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DebugDashboard() {
  const [data, setData] = useState<DebugData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/debug/watering', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<DebugData>
      })
      .then((d) => {
        setData(d)
        if (d.plants.length > 0) setSelectedId(d.plants[0].id)
      })
      .catch((e) => setErrorMsg(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const selectedPlant = data?.plants.find((p) => p.id === selectedId) ?? null

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: '16px 20px 40px',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 14,
        }}
      >
        <a
          href="/"
          style={{ color: 'var(--green)', textDecoration: 'none', fontWeight: 600, fontSize: 15 }}
        >
          ← Home
        </a>
        <h1 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Watering Debug</h1>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {data ? `${data.plants.length} plants · ${data.weather.length} weather days` : ''}
        </span>
      </div>

      {loading && (
        <div style={{ color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>Loading…</div>
      )}
      {errorMsg && (
        <div
          style={{
            background: 'var(--red-dim)',
            border: '1px solid var(--red)',
            borderRadius: 8,
            padding: '12px 14px',
            color: 'var(--red)',
            marginBottom: 16,
          }}
        >
          {errorMsg}
        </div>
      )}

      {data && (
        <ErrorBoundary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <WeatherStrip rows={data.weather} />
            <PlantTable plants={data.plants} selectedId={selectedId} onSelect={setSelectedId} />
            {selectedPlant && <PlantDetailChart plant={selectedPlant} />}
          </div>
        </ErrorBoundary>
      )}
    </div>
  )
}
