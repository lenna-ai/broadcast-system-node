# Server Specification — Broadcast HSM System

Dokumen ini menjelaskan kebutuhan resource server untuk menangani blast WhatsApp HSM skala **puluhan ribu pesan** tanpa membuat server down.

## Prinsip arsitektur anti-down

Sistem dirancang **async-first**:

1. Producer/scheduler **hanya enqueue** ke RabbitMQ (tidak kirim API langsung massal)
2. Worker memproses dengan **concurrency terbatas** (= `DB_POOL_MAX`)
3. RabbitMQ **buffer** beban saat spike (50k pesan tidak langsung hit API/DB sekaligus)
4. Pesan gagal masuk **DLQ** (`broadcast_failed_queue`), bukan retry loop

```
Blast 50.000 pesan
    → RabbitMQ queue (buffer)
    → Worker 2–4 proses × concurrency 5
    → ~10–20 msg/detik (tergantung throttle + latency API)
    → Selesai ± 40–80 menit (controlled, server tetap stabil)
```

---

## Formula perhitungan

### Koneksi PostgreSQL

```
total_db_connections = (PM2_QUEUE + PM2_ADIRA + PM2_FAILED + 2) × DB_POOL_MAX
```

| Komponen | Default instances |
|----------|-------------------|
| `broadcast\|queue` | `PM2_QUEUE_INSTANCES` (2) |
| `broadcast\|queue\|adira` | `PM2_ADIRA_QUEUE_INSTANCES` (2) |
| `broadcast\|failed-queue` | `PM2_FAILED_QUEUE_INSTANCES` (1) |
| `broadcast\|server` + `broadcast\|scheduler` | 2 (fixed) |

**Default:** `(2 + 2 + 1 + 2) × 5 = 35 koneksi`

Pastikan: `total_db_connections + koneksi Laravel/app lain < PostgreSQL max_connections × 0.8`

### Throughput (estimasi)

```
msg/detik ≈ (PM2_QUEUE + PM2_ADIRA) × DB_POOL_MAX × 1000 / (BROADCAST_THROTTLE_MS + BROADCAST_AVG_API_MS)
```

**Contoh default:** `(2 + 2) × 5 × 1000 / (50 + 200) = 80 msg/detik`

| Volume | Estimasi waktu (80 msg/s) |
|--------|---------------------------|
| 10.000 | ~2 menit |
| 50.000 | ~10 menit |
| 100.000 | ~21 menit |

> Throughput riil tergantung limit API WhatsApp provider (1engage/Damcorp). Throttle ada agar tidak kena rate limit.

---

## Rekomendasi spek server

### Tier A — 10.000 pesan / blast

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| **App server** (Node + PM2) | 2 vCPU, 2 GB RAM | 4 vCPU, 4 GB RAM |
| **PostgreSQL** | 2 vCPU, 4 GB RAM, 50 conn | 4 vCPU, 8 GB RAM, 100 conn |
| **RabbitMQ** | 1 vCPU, 2 GB RAM | 2 vCPU, 4 GB RAM |
| **Disk** | 20 GB SSD | 40 GB SSD |

**Env production:**

```env
PM2_QUEUE_INSTANCES=2
PM2_ADIRA_QUEUE_INSTANCES=2
PM2_FAILED_QUEUE_INSTANCES=1
DB_POOL_MAX=5
RABBITMQ_PREFETCH=5
SCHEDULER_CHUNK_SIZE=25
MAX_QUEUE_BATCH_SIZE=25
SCHEDULER_RECIPIENT_PAGE_SIZE=1000
SCHEDULER_PUBLISH_DELAY_MS=10
BROADCAST_THROTTLE_MS=50
BROADCAST_ADIRA_THROTTLE_MS=50
DB_MAX_CONNECTIONS_BUDGET=80
```

---

### Tier B — 50.000 pesan / blast

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| **App server** | 4 vCPU, 4 GB RAM | 8 vCPU, 8 GB RAM |
| **PostgreSQL** | 4 vCPU, 8 GB RAM, 100 conn | 8 vCPU, 16 GB RAM, 200 conn |
| **RabbitMQ** | 2 vCPU, 4 GB RAM | 4 vCPU, 8 GB RAM |
| **Disk** | 40 GB SSD | 80 GB SSD |

**Env production:**

```env
PM2_QUEUE_INSTANCES=3
PM2_ADIRA_QUEUE_INSTANCES=3
PM2_FAILED_QUEUE_INSTANCES=2
DB_POOL_MAX=5
RABBITMQ_PREFETCH=5
SCHEDULER_CHUNK_SIZE=20
MAX_QUEUE_BATCH_SIZE=20
SCHEDULER_RECIPIENT_PAGE_SIZE=500
SCHEDULER_PUBLISH_DELAY_MS=15
BROADCAST_THROTTLE_MS=80
BROADCAST_ADIRA_THROTTLE_MS=80
DB_MAX_CONNECTIONS_BUDGET=120
```

Total DB: `(3+3+2+2) × 5 = 50 koneksi`

---

### Tier C — 100.000+ pesan / blast

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| **App server** | 8 vCPU, 8 GB RAM | 16 vCPU, 16 GB RAM |
| **PostgreSQL** | 8 vCPU, 16 GB RAM, 200 conn | Dedicated PG, 32 GB RAM |
| **RabbitMQ** | 4 vCPU, 8 GB RAM | Dedicated RabbitMQ cluster |
| **Disk** | 80 GB SSD | 160 GB NVMe |

**Env production:**

```env
PM2_QUEUE_INSTANCES=4
PM2_ADIRA_QUEUE_INSTANCES=4
PM2_FAILED_QUEUE_INSTANCES=2
DB_POOL_MAX=5
RABBITMQ_PREFETCH=5
SCHEDULER_CHUNK_SIZE=15
MAX_QUEUE_BATCH_SIZE=15
SCHEDULER_RECIPIENT_PAGE_SIZE=500
SCHEDULER_PUBLISH_DELAY_MS=20
BROADCAST_THROTTLE_MS=100
BROADCAST_ADIRA_THROTTLE_MS=100
DB_MAX_CONNECTIONS_BUDGET=150
```

Total DB: `(4+4+2+2) × 5 = 60 koneksi`

Pertimbangkan **split server**: Node workers terpisah dari PostgreSQL dan RabbitMQ.

---

## PostgreSQL tuning (production)

```sql
-- Cek koneksi aktif
SELECT count(*) FROM pg_stat_activity;

-- Rekomendasi minimum untuk blast besar
ALTER SYSTEM SET max_connections = '200';
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET idle_in_transaction_session_timeout = '60000';
ALTER SYSTEM SET statement_timeout = '120000';
```

Sesuaikan `shared_buffers` ~25% RAM PostgreSQL.

---

## RabbitMQ tuning

- Queue type: **quorum** (sudah dikonfigurasi di `rabbitmq.js`)
- Pastikan disk free > 2 GB (persistent messages)
- Monitor queue depth via RabbitMQ Management UI
- Alarm jika `broadcast_whatsapp_hsm_queue` > 100.000 ready messages

**Memory watermark:** set `vm_memory_high_watermark.relative = 0.6` agar RabbitMQ tidak OOM.

---

## Proteksi built-in di codebase

| Fitur | File | Fungsi |
|-------|------|--------|
| Concurrency limit | `helpers/concurrency.js` | Max parallel = pool size |
| Batch size cap | `MAX_QUEUE_BATCH_SIZE` | Cegah 1 message RabbitMQ terlalu besar |
| Scheduler pagination | `helpers/publish_recipients.js` | DB read 1000 row/page, tidak load 50k sekaligus |
| Publish throttle | `SCHEDULER_PUBLISH_DELAY_MS` | Tidak flood RabbitMQ saat enqueue |
| Publish backpressure | `rabbitmq_manager.js` | Wait `drain` jika buffer penuh |
| Capacity warnings | `helpers/capacity.js` | Log warning saat startup jika config berbahaya |
| Graceful shutdown | `helpers/graceful_shutdown.js` | Deploy tanpa connection leak |
| Separate Adira queue | `broadcast_adira_worker.js` | Blast Adira tidak block queue utama |

---

## Monitoring checklist saat blast

- [ ] `GET /api/monitor/metrics` — `database.pending_acquires` harus ≈ 0
- [ ] `database.used` ≤ `database.max` per proses
- [ ] RabbitMQ queue depth naik stabil (turun setelah blast selesai)
- [ ] CPU app server < 80%
- [ ] Memory PM2 worker < `max_memory_restart` (1G)
- [ ] PostgreSQL active connections < 80% max_connections
- [ ] Tidak ada error `Timeout acquiring a connection` di log

---

## Yang TIDAK boleh dilakukan saat blast besar

1. **Jangan** naikkan `DB_POOL_MAX` tanpa naikkan `max_connections` PostgreSQL
2. **Jangan** set `RABBITMQ_PREFETCH` > `DB_POOL_MAX`
3. **Jangan** set `SCHEDULER_CHUNK_SIZE` > 100 (memory spike di worker)
4. **Jangan** matikan `BROADCAST_THROTTLE_MS` (0) tanpa konfirmasi limit API provider
5. **Jangan** jalankan `stress-db` endpoint di production
6. **Jangan** scale PM2 instances tanpa hitung ulang total DB connections

---

## Capacity report saat startup

Setiap worker log line seperti:

```
[capacity:queue-worker] processes={"queue":2,"adira":2,"failed":1,"fixed":2} db_connections≈35 throughput≈80 msg/s
```

Jika ada warning `WARN:` — sesuaikan env sebelum blast production.

---

## Referensi env variables

Lihat `.env.example` untuk daftar lengkap. Variabel kunci untuk high volume:

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `PM2_QUEUE_INSTANCES` | 2 | Worker queue utama |
| `PM2_ADIRA_QUEUE_INSTANCES` | 2 | Worker queue Adira |
| `DB_POOL_MAX` | 5 | Max koneksi DB per proses |
| `RABBITMQ_PREFETCH` | 5 | Pesan unacked per worker |
| `MAX_QUEUE_BATCH_SIZE` | 25 | Max item per RabbitMQ message |
| `SCHEDULER_RECIPIENT_PAGE_SIZE` | 1000 | Pagination DB saat enqueue |
| `SCHEDULER_PUBLISH_DELAY_MS` | 10 | Delay antar publish ke RabbitMQ |
| `BROADCAST_THROTTLE_MS` | 50 | Delay antar kirim sukses |
| `DB_MAX_CONNECTIONS_BUDGET` | 80 | Budget total koneksi (warning threshold) |
