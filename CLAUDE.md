# Plant Care System — Claude Instructions

## Cloudflare Workers

Every Cloudflare Worker must have its TypeScript source committed to the repo **before** deploying. The required layout is:

```
cloudflare/<worker-name>/
  src/index.ts      # Worker source
  wrangler.toml     # Bindings (D1, R2, Durable Objects, etc.)
  package.json
  tsconfig.json
```

Never deploy a worker whose source isn't already in the repo.

## Deploy commands

```bash
# REST API (used by PWA)
cd cloudflare/rest-api && npx wrangler deploy

# MCP server (Claude.ai)
cd cloudflare/mcp-server && npx wrangler deploy

# PWA
cd pwa && npm run build && npx wrangler deploy
```

## Database

D1 database: `plant-care` (id: `fcc66b86-ae3d-42c5-be08-8524119197de`)

Run `POST /admin/migrate` after schema changes — it is idempotent and safe to re-run.
