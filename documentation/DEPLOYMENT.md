# Deployment — Quis (Produksi)

Target: **VPS dengan Docker Compose** (PRD asumsi 3; Socket.IO butuh proses
persisten, jadi serverless bukan pilihan). Hermes bertanggung jawab deploy ke
`quis.airlangga.link`; dokumen ini menggambarkan stack dan langkah-langkahnya.

## Arsitektur

```
                 Internet
                    │
               ┌────▼────┐
               │  Nginx  │  :80 → :443, terminasi SSL, WebSocket upgrade
               └──┬───┬──┘
          /        │   │      /socket.io/
   ┌──────────▼┐  ┌─▼─────────────┐
   │ Next.js   │  │  Realtime     │
   │ app:3000  │  │  Socket.IO    │
   └─────┬─────┘  └──────┬────────┘
         └────────┬──────┘
            ┌─────▼─────┐
            │ Postgres  │
            └───────────┘
```

- **Nginx** (`nginx/quis.conf`): satu origin publik. Rute `/` → `app:3000`,
  `/socket.io/` → `realtime:4000` **dengan upgrade WebSocket** dan
  `proxy_read_timeout 86400s` (tanpa ini, koneksi socket.io putus saat game).
- **App** (Next.js standalone) & **Realtime** (Socket.IO, state otoritatif di
  memori) hanya `expose` di jaringan internal — tidak diterbitkan langsung.
- **Postgres** persist di volume `postgres_data`.

## Prasyarat server

- VPS minimum 2 vCPU / 4 GB RAM / 40 GB SSD (PRD bagian 10).
- Docker Engine + Docker Compose v2.
- Domain mengarah (A record) ke IP VPS.
- Port 80 & 443 terbuka.

## 1. Variabel lingkungan

```bash
cp .env.prod.example .env.prod
# Isi PUBLIC_URL, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, GAME_TOKEN_SECRET.
```

`BETTER_AUTH_SECRET` dan `GAME_TOKEN_SECRET` masing-masing minimal 32 karakter:
```bash
openssl rand -base64 32
```

`PUBLIC_URL` = origin publik (mis. `https://quis.airlangga.link`). Karena
socket.io diproxy lewat `/socket.io` di origin yang sama, klien memakai
`NEXT_PUBLIC_REALTIME_URL = PUBLIC_URL` (di-inline ke bundle saat build).

## 2. Sertifikat SSL

Letakkan sertifikat di `./nginx/certs/`:
```
nginx/certs/fullchain.pem
nginx/certs/privkey.pem
```

Cara termudah dengan **Certbot standalone** (hentikan nginx dulu karena butuh
:80/:443) atau mode webroot. Contoh:

```bash
certbot certonly --standalone -d quis.airlangga.link
cp /etc/letsencrypt/live/quis.airlangga.link/fullchain.pem nginx/certs/
cp /etc/letsencrypt/live/quis.airlangga.link/privkey.pem  nginx/certs/
```

Atur perpanjangan otomatis (certbot renew + reload nginx).

## 3. Build & jalankan

```bash
docker compose -f docker-compose.prod.yaml --env-file .env.prod up -d --build
```

## 4. Migrasi database

Jalankan sekali setelah container pertama kali naik (membuat 6 tabel + partial
unique index PIN):

```bash
docker compose -f docker-compose.prod.yaml exec app sh -lc "npm run db:migrate"
# atau, tanpa migrasi yang di-track: npm run db:push
```

## 5. Health check & log

- Realtime: `GET https://quis.airlangga.link/socket.io/...` terproxy;
  secara internal `GET realtime:4000/health` → `{ ok, service, rooms }`.
  Container realtime punya `HEALTHCHECK` bawaan.
- Log terstruktur JSON baris-tunggal ke stdout/stderr (lihat
  `realtime/src/logger.ts`), level via `LOG_LEVEL`:
  ```bash
  docker compose -f docker-compose.prod.yaml logs -f realtime app
  ```
- Status container:
  ```bash
  docker compose -f docker-compose.prod.yaml ps
  ```

## 6. Pembaruan

```bash
git pull
docker compose -f docker-compose.prod.yaml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yaml exec app sh -lc "npm run db:migrate"
```

Rollback: `git checkout <tag-lama>` lalu `up -d --build`. Data Postgres tetap
(volume `postgres_data`).

## 7. Load test (sebelum rilis)

Uji 300 peserta dalam satu sesi mengikuti `loadtest/README.md`. Target PRD 6.1:
p95 latensi ack < 200 ms, p95 selisih tampil soal < 300 ms. Skrip pakai
`socket.io-client`; alternatif k6/artillery tersedia namun protokol socket.io
lebih mudah ditangani langsung di Node.

## Catatan skala

Satu instance realtime cukup untuk beban MVP (PRD asumsi 4). Untuk >1 instance,
tambahkan `@socket.io/redis-adapter` + Redis + sticky session di load balancer —
arsitektur saat ini sudah mengakomodasi (state room per-instance, terpisah dari
transport). Jangan dikerjakan sebelum dibutuhkan.
