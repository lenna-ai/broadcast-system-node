# Broadcast System Node

Layanan broadcast WhatsApp HSM (High Structured Message) berbasis Node.js, Express, RabbitMQ, dan PostgreSQL. Sistem ini memproses pengiriman template WhatsApp secara asynchronous melalui queue worker dengan connection pool yang aman untuk production.

## Fitur

- Publish pesan ke antrean RabbitMQ (async broadcast)
- Proses langsung via API (sync listen) untuk testing/debug
- Worker cluster PM2 dengan concurrency terkontrol
- Dead-letter queue untuk pesan gagal
- Scheduler broadcast terjadwal dari database dengan keyset pagination
- Dedicated queue Adira dengan throttle terpisah
- Provider WhatsApp: **1engage** dan **Damcorp**
- Dukungan template carousel WhatsApp
- Health check & monitoring metrics
- Simpan `channel_data` per pesan di `broadcast_messages`

## Arsitektur

```
Scheduler (cron)                    REST API (/broadcast/publish)
    │                                       │
    │ baca broadcast_schedule               │
    │ baca broadcast_recipients             │
    │ (keyset pagination)                   │
    │                                       │
    ├──► broadcast_whatsapp_hsm_queue ◄─────┤
    │                                       │
    └──► broadcast_whatsapp_hsm_adira ◄─────┘
              (khusus Adira)
                    │
    ┌───────────────┴──────────────────┐
    ▼                                  ▼
broadcast_worker               broadcast_adira_worker
(PM2 cluster)                  (PM2 cluster)
    │                                  │
    ├─► BroadcastListener.listen()     ├─► BroadcastListener.listen()
    │       ├─► 1engage / Damcorp API  │
    │       └─► save broadcast_messages│
    │           (incl. channel_data)   │
    │                                  │
    └─► gagal ──────────────────────────┘
            │
            ▼
    broadcast_failed_queue
            │
            ▼
    failed_worker (PM2 cluster)
            │
            └─► BroadcastListener.failed()
                    └─► save broadcast_messages status=failed
```

### Komponen PM2

| App | Script | Mode | Fungsi |
|-----|--------|------|--------|
| `broadcast\|server` | `server.js` | fork | REST API |
| `broadcast\|queue` | `src/workers/broadcast_worker.js` | cluster | Consumer queue umum |
| `broadcast\|queue\|adira` | `src/workers/broadcast_adira_worker.js` | cluster | Consumer queue Adira |
| `broadcast\|failed-queue` | `src/workers/failed_worker.js` | cluster | Consumer pesan gagal |
| `broadcast\|scheduler` | `src/scheduler.js` | fork | Cron jadwal broadcast |
| `broadcast\|monitor` | `src/workers/monitor_worker.js` | fork | Alert crash PM2 |

### RabbitMQ Queues

| Queue | Nama | Keterangan |
|-------|------|------------|
| WhatsApp HSM (umum) | `broadcast_whatsapp_hsm_queue` | Antrean utama |
| WhatsApp HSM Adira | `broadcast_whatsapp_hsm_adira` | Antrean khusus Adira |
| Failed / DLQ | `broadcast_failed_queue` | Pesan gagal (dead-letter) |

Scheduler otomatis merutekan ke queue yang tepat berdasarkan field `client`/`provider` pada data broadcast — jika mengandung `adira`, pesan dikirim ke `broadcast_whatsapp_hsm_adira`.

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
| `DB_POOL_MIN` | `1` | Idle connection per proses (jangan 2+ di shared Postgres) |
| `RABBITMQ_PREFETCH` | `5` | Prefetch consumer queue utama (di-cap ke `DB_POOL_MAX`) |
| `RABBITMQ_FAILED_PREFETCH` | `3` | Prefetch consumer failed queue (di-cap ke `DB_POOL_MAX`) |
| `PM2_QUEUE_INSTANCES` | `2` | Jumlah worker queue umum |
| `PM2_ADIRA_QUEUE_INSTANCES` | `2` | Jumlah worker queue Adira |
| `PM2_FAILED_QUEUE_INSTANCES` | `1` | Jumlah worker failed queue |
| `BROADCAST_THROTTLE_MS` | `50` | Delay antar kirim sukses queue umum (ms) |
| `BROADCAST_ADIRA_THROTTLE_MS` | `50` | Delay antar kirim sukses queue Adira (ms) |
| `BROADCAST_AVG_API_MS` | `200` | Estimasi rata-rata response time API (ms, untuk capacity) |
| `MAX_QUEUE_BATCH_SIZE` | `25` | Maks item per batch pesan queue |
| `SCHEDULER_CRON` | `* * * * *` | Ekspresi cron scheduler |
| `SCHEDULER_CHUNK_SIZE` | `25` | Ukuran chunk publish per iterasi |
| `SCHEDULER_RECIPIENT_PAGE_SIZE` | `1000` | Jumlah penerima per halaman (keyset pagination) |
| `SCHEDULER_PUBLISH_DELAY_MS` | `10` | Delay antar publish batch scheduler (ms) |
| `APP_TIMEZONE` | `Asia/Jakarta` | Timezone scheduler & timestamp |
| `WHATSAPP_CHANNEL_ID` | `4` | ID channel WhatsApp di DB |
| `DB_MAX_CONNECTIONS_BUDGET` | `40` | Batas total koneksi DB yang boleh dipakai |
| `ENABLE_STRESS_ENDPOINT` | `false` | Aktifkan `/monitor/stress-db` |

**Perhitungan koneksi DB:**

```
total ≈ (PM2_QUEUE_INSTANCES + PM2_ADIRA_QUEUE_INSTANCES + PM2_FAILED_QUEUE_INSTANCES + 2) × DB_POOL_MAX
default ≈ (2 + 2 + 1 + 2) × 5 = 35 koneksi
```

Pastikan nilai tidak melebihi `DB_MAX_CONNECTIONS_BUDGET` dan `max_connections` PostgreSQL.

## Menjalankan

### Development

```bash
# API server saja
npm run server

# Worker queue utama
npm run queue

# Worker queue Adira
npm run queue:adira

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
    "params_data": ["Budi"],
    "channel_data": {
      "customer_name": "Budi",
      "contract_number": "050825118438"
    }
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
    "category": "UTILITY"
  },
  "params_data": ["Budi"],
  "channel_data": {
    "customer_name": "Budi"
  }
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

## Scheduler

Scheduler berjalan setiap menit (configurable via `SCHEDULER_CRON`) dan:

1. Membaca `omnichannel.broadcast_schedule` dengan status `pending` dan `schedule_at <= now()` menggunakan `FOR UPDATE SKIP LOCKED` (aman untuk multi-instance)
2. Mengubah status ke `processing` agar tidak diambil instance lain
3. Membaca `omnichannel.broadcast_recipients` per broadcast menggunakan **keyset pagination** (`id > lastId LIMIT pageSize`) — aman untuk jutaan baris
4. Mempublish payload penerima ke queue dalam batch kecil dengan delay `SCHEDULER_PUBLISH_DELAY_MS`
5. Merutekan ke `broadcast_whatsapp_hsm_adira` jika `client`/`provider` mengandung `adira`, selain itu ke `broadcast_whatsapp_hsm_queue`
6. Mengubah status `broadcast_schedule` ke `completed` setelah selesai

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

## Kapasitas & Server Spec

Untuk blast **puluhan ribu pesan**, baca panduan lengkap:

**[docs/SERVER_SPECS.md](docs/SERVER_SPECS.md)**

Ringkasan:
- Blast di-buffer RabbitMQ, worker proses terkontrol (bukan spike langsung ke API/DB)
- Default ~80 msg/detik → 50.000 pesan ≈ 10 menit
- Total koneksi DB default ≈ 35 — jangan melebihi `max_connections` PostgreSQL dan `DB_MAX_CONNECTIONS_BUDGET`

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
├── helpers/              # concurrency, graceful_shutdown, failed_message,
│                         # publish_recipients, capacity, response
├── queue/                # rabbitmq_manager
├── repositories/         # DB access layer (broadcast, external_api, log)
├── services/
│   ├── broadcast_listener.js   # Core: listen() & failed() handler
│   ├── broadcast_manager.js    # Orkestrasi publish & listen via API
│   ├── broadcast_publisher.js  # Publish ke RabbitMQ
│   └── whatsapp/               # Provider: 1engage, damcorp
│       └── utils/              # content, media, phone utilities
├── workers/
│   ├── broadcast_worker.js       # Consumer queue umum
│   ├── broadcast_adira_worker.js # Consumer queue Adira
│   ├── failed_worker.js          # Consumer dead-letter queue
│   └── monitor_worker.js         # PM2 crash alert
└── scheduler.js          # Cron broadcast terjadwal
```

## Troubleshooting

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| `Timeout acquiring a connection` | Pool DB penuh | Turunkan `PM2_*_INSTANCES` atau `DB_POOL_MAX` |
| `got[method] is not a function` | got v15 CJS | Sudah di-handle via `got.default` |
| Meta error `enum quick_reply` | Parameter button salah | Gunakan `type: "payload"` bukan `quick_reply` |
| Worker log merah "failed" di Dokploy | Kata "failed" di log message | Bukan error — cek PM2 status |
| `channel_data` tidak tersimpan | Dikirim sebagai object bukan string | Sudah di-handle via `JSON.stringify` di repository |
| Scheduler skip tick | Cron sebelumnya masih berjalan | Normal — guard `isRunning` mencegah overlap |

## License

ISC
