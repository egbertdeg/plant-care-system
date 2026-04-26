const BASE = 'https://plant-care-api.egbert-degroot.workers.dev'

async function post(category, body) {
  const res  = await fetch(`${BASE}/garden/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, body }),
  })
  const json = await res.json()
  const preview = body.slice(0, 70).replace(/\n/g, ' ')
  console.log(`${json.ok ? '✓' : '✗'} [${category}] ${preview}…`)
  if (!json.ok) console.error('  ERROR:', json)
}

// ── Garden setup & context ────────────────────────────────────────────────
await post('General', `[2026-04-26] General: Garden setup. Brooklyn, NY (USDA Zone 7b). All roses grown in containers/pots — gray cylindrical, white round, dark bowl-shaped — at front entrance. All known purchases from Jackson & Perkins. February 2025: first year plants were brought indoors under grow lights to start the season early, then moved back outside. IoT watering can in development for indoor plants only.`)

// ── Winter 2025–2026 learnings ────────────────────────────────────────────
await post('Climate', `[2026-04-26] Climate: NYC 2025–2026 winter was the coldest in 11 years — 4.3°F below normal at Central Park, sustained deep freeze through January and February. Container roses are far more vulnerable than in-ground: the entire root ball can freeze solid with no insulating earth. Effective container hardiness zone is 1–2 zones colder than in-ground Zone 7b rating.`)

await post('Observation', `[2026-04-26] Observation: Key winter survival pattern. Plants rated Zone 5 struggled or died. Plants with Canadian-bred / Zone 3–4 genetics sailed through untouched. Established plants (3+ seasons) survived far better than first-year plants. Every shrub survived; floribundas are more temperamental. Two identical plants from the same order (O4 and O10, both Mardi Gras) had completely different outcomes — pot position, drainage, and microclimate matter enormously.`)

await post('Observation', `[2026-04-26] Observation: Container rose hardiness rules. (1) Zone rating does not equal container hardiness — containers run 1–2 zones colder than in-ground. (2) Canadian-bred genetics are the real answer — Morden series and Knock Out genetics survived; every Zone 5 floribunda struggled. (3) Established roots are the best protection. (4) Catalogue heights assume in-ground — subtract 20–40% for containers. (5) Pot size and drainage matter as much as the plant.`)

// ── Winter protection plan ────────────────────────────────────────────────
await post('Technique', `[2026-04-26] Technique: Winter protection plan for container roses in NYC. Move all pots against south-facing wall before first hard freeze. Wrap pots in burlap or bubble wrap for insulation. Water well before a freeze event — moist soil holds heat better than dry. Larger pots survive better (more thermal mass). Consider keeping Canadian-bred/Zone 3–4 plants outdoors and bringing only more vulnerable floribundas inside. The indoor grow-light experiment (February 2025) worked well — worth repeating.`)

// ── Replacement research ──────────────────────────────────────────────────
await post('General', `[2026-04-26] General: O2 replacement candidates. Key insight: every failed/struggling plant (O2, O4 stressed, O5 sparse, O9 stressed) was Zone 5 rated. Survivors were Zone 3–4 or Canadian-bred. Zone 5 replacements repeat the same mistake if cold hardiness is the priority. Top picks: (1) Campfire — Canadian Artist Series, Zone 5 but same breeding as Morden Blush, multicolor red/yellow→pink→cream, ~18–24 in container. (2) AC Navy Lady — Zone 3, new 2026 J&P Cold Hardy Collection, nearly black buds → deep velvety red, compact. If yellow is important: Sunsprite from Heirloom Roses — gold standard yellow floribunda, 50 years proven, best disease resistance of any yellow.`)

// ── O6 variety investigation ──────────────────────────────────────────────
await post('Observation', `[2026-04-26] Observation: O6 variety still unknown. Original plant, predates all J&P orders, supplier unknown. White to pale yellow, open single/semi-double blooms, prominent yellow stamens, 1.5–2 inch blooms, strong fragrance, repeat blooming all season. Canary Bird ruled out (once bloomer only). Best guesses: Yellow Knock Out (likely Lowe's/Home Depot purchase) or Rosa Golden Wings. Confirm this season: if blooms 1.5–2 inches with yellow stamens and repeats all summer → Yellow Knock Out. If 3–4 inch single blooms with amber stamens → Golden Wings. Owner's favourite plant — documented bumblebees visiting blooms.`)

// ── Spring 2026 action list ───────────────────────────────────────────────
await post('General', `[2026-04-26] General: Spring 2026 action list for all plants. Clear dead leaf debris from all pots (harbours fungal spores). Apply slow-release rose fertiliser now. Liquid feed every 2 weeks through the season. O2: remove and replace. O4: cut dead canes to live wood, feed. O5: feed, be patient. O6: cut dead upper canes only, leave basal growth alone, feed. O9: scratch test all canes, cut to live wood, feed, monitor. O10: feed now, begin preventive black spot spray. O7: prune dead tips, clear leaf debris, feed. O8: investigate pot drainage, monitor during dry spells. O3: prune dead twiggy growth, clear debris.`)

console.log('\nDone.')
