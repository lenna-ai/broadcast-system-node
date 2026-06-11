# Broadcast System Node

Layanan broadcast WhatsApp HSM (High Structured Message) berbasis Node.js, Express, RabbitMQ, dan PostgreSQL. Sistem ini memproses pengiriman template WhatsApp secara asynchronous melalui queue worker dengan connection pool yang aman untuk production.

## Fitur

- Publish pesan ke antrean RabbitMQ (async broadcast)
- Proses langsung via API (sync listen) untuk testing/debug
- Worker cluster PM2 dengan concurrency terkontrol
- Dead-letter queue untuk pesan gagal
- Scheduler broadcast terjadwal dari database
- Provider WhatsApp: **1engage** dan **Damcorp**
- Dukungan template carousel WhatsApp
- Health check & monitoring metrics

## Arsitektur

```
API / Scheduler
    │
    ▼
RabbitMQ (broadcast_whatsapp_hsm_queue)
    │
    ▼
broadcast_worker (PM2 cluster)
    │
    ├─► BroadcastListener.listen()  [1 DB transaction / pesan]
    │       ├─► 1engage / Damcorp API
    │       └─► save broadcast_messages
    │
    └─► gagal ──► broadcast_failed_queue ──► failed_worker
```

### Komponen PM2

| App | Script | Mode | Fungsi |
|-----|--------|------|--------|
| `broadcast\|server` | `server.js` | fork | REST API |
| `broadcast\|queue` | `src/workers/broadcast_worker.js` | cluster | Consumer utama |
| `broadcast\|failed-queue` | `src/workers/failed_worker.js` | cluster | Consumer pesan gagal |
| `broadcast\|scheduler` | `src/scheduler.js` | fork | Cron jadwal broadcast |
| `broadcast\|monitor` | `src/workers/monitor_worker.js` | fork | Alert crash PM2 |

## Prasyarat

- Node.js 20+
- PostgreSQL
- RabbitMQ (quorum queue supported)
- PM2 (production)

## Instalasi

```bash
git clone <repository-url>
cd broadcast-system-node
npm install
cp .env.example .env
# Edit .env sesuai environment
```

## Environment Variables

Salin dari `.env.example`. Variabel penting:

| Variable | Default | Keterangan |
|----------|---------|------------|
| `PORT` | `3000` | Port REST API |
| `RABBITMQ_URL` | — | Connection string RabbitMQ |
| `DB_HOST` / `DB_*` | — | Kredensial PostgreSQL |
| `DB_POOL_MAX` | `5` | Max koneksi pool per proses PM2 |
| `RABBITMQ_PREFETCH` | `5` | Prefetch consumer (≤ `DB_POOL_MAX`) |
| `PM2_QUEUE_INSTANCES` | `2` | Jumlah worker queue |
| `BROADCAST_THROTTLE_MS` | `50` | Delay antar kirim sukses (ms) |
| `ENABLE_STRESS_ENDPOINT` | `false` | Aktifkan `/monitor/stress-db` |

**Perhitungan koneksi DB:**

```
total ≈ (PM2_QUEUE_INSTANCES + PM2_FAILED_QUEUE_INSTANCES + 2) × DB_POOL_MAX
default ≈ (2 + 1 + 2) × 5 = 25 koneksi
```

## Menjalankan

### Development

```bash
# API server saja
npm run server

# Worker queue
npm run queue

# Worker failed queue
npm run failed-queue

# Semua via PM2
pm2 start ecosystem.config.js --env local
```

### Production

```bash
pm2 start ecosystem.config.js --env production
pm2 save
```

### Docker

```bash
docker build -t broadcast-system-node .
docker run --env-file .env -p 3000:3000 broadcast-system-node
```

Healthcheck: `GET http://localhost:3000/api/health`

## API Endpoints

Base URL: `http://localhost:3000/api`

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/health` | Health check |
| `POST` | `/broadcast/publish` | Publish ke RabbitMQ queue |
| `POST` | `/broadcast/listen` | Proses broadcast langsung (sync) |
| `GET` | `/monitor/metrics` | DB pool & system metrics |
| `GET` | `/monitor/stress-db` | Stress test DB (hanya jika `ENABLE_STRESS_ENDPOINT=true`) |

### POST `/broadcast/publish`

Kirim payload ke antrean RabbitMQ.

**Request:**

```json
{
  "type": "whatsapp",
  "payload": {
    "integration_id": 1,
    "broadcast_id": 100,
    "recipient": "6281234567890",
    "app_id": 1,
    "template": {
      "id": 10,
      "template_name": "hello_world",
      "language": "id"
    },
    "params_data": ["Budi"]
  }
}
```

**Response (200):**

```json
{
  "status": "success",
  "message": "Broadcast whatsapp berhasil dikirim ke antrean"
}
```

### POST `/broadcast/listen`

Proses broadcast langsung tanpa queue (berguna untuk testing).

**Request minimal:**

```json
{
  "integration_id": 1,
  "broadcast_id": 100,
  "recipient": "6281234567890",
  "app_id": 1,
  "sent_by": 1,
  "template": {
    "id": 10,
    "template_name": "hello_world",
    "language": "id",
    "category": "marketing"
  },
  "params_data": ["Budi"]
}
```

**Request carousel:**

```json
{
  "integration_id": 1,
  "broadcast_id": 100,
  "recipient": "6281234567890",
  "app_id": 1,
  "template": {
    "id": 20,
    "type": "carousel",
    "template_name": "carousel_promo",
    "language": "id",
    "category": "marketing",
    "cards": [
      {
        "components": [
          { "type": "HEADER", "mediaUrl": "https://example.com/image-a.jpg" },
          { "type": "BODY", "text": "Product 1" },
          { "type": "BUTTONS", "buttons": [{ "type": "QUICK_REPLY", "text": "Go to page" }] }
        ]
      }
    ]
  },
  "params_data": ["Budi"]
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "The message was successfully processed",
  "data": {
    "to": "6281234567890",
    "msgId": "wamid.xxx",
    "status": "sent",
    "trxId": "6281234567890",
    "timestamp": "2026-06-11 14:00:00"
  },
  "meta": { "timestamp": "2026-06-11T07:00:00.000Z" }
}
```

### GET `/monitor/metrics`

```json
{
  "success": true,
  "data": {
    "database": {
      "used": 1,
      "free": 4,
      "pending_acquires": 0,
      "max": 5
    },
    "system": {
      "cpu_load_1m": 0.5,
      "memory": { "rss": "80 MB", "heapUsed": "30 MB" },
      "uptime": "3600s"
    }
  }
}
```

## RabbitMQ Queues

| Queue | Nama | Keterangan |
|-------|------|------------|
| WhatsApp HSM | `broadcast_whatsapp_hsm_queue` | Antrean utama |
| Failed / DLQ | `broadcast_failed_queue` | Pesan gagal |

## Testing

```bash
npm test
```

## Deployment CI/CD

| Branch | Workflow | Environment |
|--------|----------|-------------|
| `staging` | `deploy-sandbox.yml` | Sandbox |
| `production` | `deploy-production.yml` | Production |

Image Docker di-push ke GitHub Container Registry (`ghcr.io`).

## Postman

Koleksi API tersedia di:

```
docs/postman/broadcast-system-node.postman_collection.json
docs/postman/broadcast-system-node.postman_environment.json
```

**Import ke Postman:**

1. Buka Postman → **Import**
2. Pilih kedua file di folder `docs/postman/`
3. Pilih environment **Broadcast System - Local**
4. Sesuaikan variable `base_url` jika perlu

## Struktur Project

```
src/
├── api/                  # REST controllers & routes
├── config/               # database, rabbitmq, constants, metrics
├── helpers/              # concurrency, graceful_shutdown, response
├── queue/                # rabbitmq_manager
├── repositories/         # DB access layer
├── services/
│   ├── broadcast_listener.js
│   ├── broadcast_manager.js
│   └── whatsapp/         # 1engage, damcorp providers
└── workers/              # PM2 worker scripts
```

## Troubleshooting

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| `Timeout acquiring a connection` | Pool DB penuh | Turunkan `PM2_*_INSTANCES` atau `DB_POOL_MAX` |
| `got[method] is not a function` | got v15 CJS | Sudah di-handle via `got.default` |
| Meta error `enum quick_reply` | Parameter button salah | Gunakan `type: "payload"` bukan `quick_reply` |
| Worker log merah "failed" di Dokploy | Kata "failed" di log message | Bukan error — cek PM2 status |

## License

ISC
