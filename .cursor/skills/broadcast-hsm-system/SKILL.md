---
name: broadcast-hsm-system
description: Work on the broadcast-system-node service (Node.js + Express + RabbitMQ + Knex/Postgres + WhatsApp HSM broadcast). Use when editing workers, queue consumers, DB pool config, broadcast providers (1engage/damcorp), or WhatsApp HSM/carousel template payloads in this repo.
---

# Broadcast HSM System

Node.js service that broadcasts WhatsApp HSM (template) messages at scale via RabbitMQ workers and a Postgres connection pool.

## Architecture

```
API / scheduler (producer)
   └─ publish → RabbitMQ (broadcast_whatsapp_hsm_queue)
        └─ broadcast_worker (PM2 cluster, prefetch=N)
             └─ BroadcastListener.listen()  [1 DB transaction per message]
                  └─ provider service (1engage | damcorp)
                       └─ sendBroadcast() → WhatsApp API
                       └─ saveBroadcastMessage() [same trx]
        on failure → publish to broadcast_failed_queue (per item)
             └─ failed_worker → BroadcastListener.failed()
```

Queues/exchanges are defined in `src/config/constants.js`. Failed queue is the DLX target.

## Conventions (follow these)

- **Module system: CommonJS only** (`require` / `module.exports`). Never introduce `import`/`export` — it previously broke `broadcast_repository.js`.
- **File names: snake_case** (e.g. `broadcast_listener.js`, `one_engage_service.js`). Class names stay PascalCase.
- **No magic values** — channel id/client come from `CONSTANTS.CHANNEL.WHATSAPP` (env override `WHATSAPP_CHANNEL_ID`). Queue names from `CONSTANTS.RABBITMQ.QUEUES`.
- **No narration comments / debug `console.log`** in committed code. Remove temporary `console.log("xxx =>", ...)` before finishing.
- After edits, run `NODE_ENV=test npm test` (Jest). Keep all suites green.

## DB pool + RabbitMQ concurrency

The core rule: **one pooled connection per message, and never exceed the pool.**

- Pool configured in `src/config/database.js` via env: `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_ACQUIRE_TIMEOUT`, `DB_POOL_IDLE_TIMEOUT`. Exposes `poolConfig` and `getPoolStats()`.
- `BroadcastListener.listen()` opens **one** `db.transaction(trx)` and threads `trx` into every query, provider `init(trx)`, `sendHsm(...,trx)`, `saveBroadcastMessage(...,trx)`, `insertApiLog(...,trx)`. Do not open a second transaction/connection inside a message.
- Worker concurrency is capped with `runWithConcurrencyLimit(items, fn, poolConfig.max)` (`src/helpers/concurrency.js`) — never use unbounded `Promise.all` over a batch.
- RabbitMQ prefetch must be `<= DB_POOL_MAX` per process: `RABBITMQ_PREFETCH` (main), `RABBITMQ_FAILED_PREFETCH` (failed).
- Total Postgres connections ≈ `Σ(PM2 instances × DB_POOL_MAX)`. Check against PG `max_connections` when changing `instances` in `ecosystem.config.js`.

Symptom of misconfig: `Knex: Timeout acquiring a connection. The pool is probably full.` → reduce prefetch/concurrency or raise pool/PG limits.

## Queue consumers

`src/queue/rabbitmq_manager.js` — both `consumer` and `failedConsumer` must:
- `channel.prefetch(prefetchCount)`
- wrap the callback in try/catch
- `channel.ack(msg)` on success, `channel.nack(msg, false, false)` on error (dead-letter, no requeue loop)

Payloads are normalized in `src/helpers/failed_message.js` (`normalizeWhatsappQueuePayload`, `normalizeFailedQueuePayload`) because messages can arrive as a single object, a batch array, or DLX-redelivered raw payloads.

## WhatsApp HSM payloads (`src/services/whatsapp/utils/content_utility.js`)

There are **two different JSON shapes** — don't confuse them:

1. **Template definition** (create/register template with Meta): uses `format`, `example`, `buttons` (plural), `text` inline, no `card_index`, no `parameters`. This is what's stored in the DB template / `request.template.cards`.
2. **Send-message payload** (what we POST to broadcast): uses `parameters`, `card_index`, `sub_type`, `index`, media as `{ link }`.

`content_utility.js` converts (1) → (2). Key rules for the send payload:
- header → `{ type: "header", parameters: [{ type: "image"|"video"|"document", [type]: { link } }] }`
- body → `{ type: "body", parameters: [{ type: "text", text }] }`
- button → `{ type: "button", sub_type, index: <number>, parameters: [...] }`
- **quick_reply button param MUST be `{ type: "payload", payload: "..." }`** — never `type: "quick_reply"` or `type: "text"`. Meta rejects it with error #100 `enum` violation.
- Strip the `format` key from card components (Meta error #100 "Unexpected key format").

Providers: `one_engage_service.js` (default `1engage`) and `damcorp_service.js`. Both call `sendBroadcast()` and `saveBroadcastMessage()` from `repositories/broadcast_repository.js`.

## Known gotchas

- **`got` v15 is ESM-only under CJS** — import as `require('got').default || require('got')` and call `got(endpoint, { method: 'POST', ... })`. Top-level `got.post` is undefined (`got[method] is not a function`).
- PM2 log lines containing the word "failed" (e.g. failed-queue startup logs) can show red in Dokploy but are just `console.log` info, not crashes. Verify with PM2 status / consumer count before assuming failure.

## Production checklist

- **DB connections**: `(PM2_QUEUE_INSTANCES + PM2_FAILED_QUEUE_INSTANCES + 2) × DB_POOL_MAX` must stay below Postgres `max_connections`. Default: `(2+1+2) × 5 = 25`.
- **Prefetch**: `RABBITMQ_PREFETCH` and `RABBITMQ_FAILED_PREFETCH` ≤ `DB_POOL_MAX` per process.
- **No metrics HTTP server in workers** — `config/metrics.js` only exports counters; never bind a port from worker imports (was port 3000 conflict).
- **Graceful shutdown**: workers and server register `SIGTERM`/`SIGINT` via `helpers/graceful_shutdown.js` → close RabbitMQ + `db.destroy()`.
- **Security**: `ENABLE_STRESS_ENDPOINT=false` in production (disables `/api/monitor/stress-db`). Health check at `GET /api/health`.
- **Scheduler**: single instance only; overlap guard + `FOR UPDATE SKIP LOCKED` in transaction; `SCHEDULER_CHUNK_SIZE` default 50 (not 100).
- **Docker**: multi-stage build, non-root user, `pm2-runtime --env production`, healthcheck on `/api/health`.

## Deploy

- PM2: `ecosystem.config.js` — instances tunable via `PM2_QUEUE_INSTANCES`, `PM2_FAILED_QUEUE_INSTANCES`. Restart: `pm2 restart ecosystem.config.js --env production`.
- Docker: `Dockerfile` runs `pm2-runtime start ecosystem.config.js --env production`.
- CI: `.github/workflows/deploy-sandbox.yml` on `staging`; `deploy-production.yml` on `production`.

## Key files

| Area | File |
|------|------|
| Queue manager | `src/queue/rabbitmq_manager.js` |
| Workers | `src/workers/broadcast_worker.js`, `src/workers/failed_worker.js` |
| Core logic | `src/services/broadcast_listener.js` |
| Providers | `src/services/whatsapp/one_engage_service.js`, `damcorp_service.js` |
| HSM payload build | `src/services/whatsapp/utils/content_utility.js` |
| DB pool | `src/config/database.js` |
| Concurrency | `src/helpers/concurrency.js` |
| Payload normalize | `src/helpers/failed_message.js` |
| Constants | `src/config/constants.js` |
