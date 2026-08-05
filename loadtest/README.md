# Load Test — Quis

Skrip ini mensimulasikan banyak peserta concurrent dalam **satu sesi** untuk
mengukur metrik PRD 6.1 (p95 latensi konfirmasi jawaban < 200 ms, p95 selisih
tampil soal antar peserta < 300 ms). Ditulis dalam Node.js + `socket.io-client`
(dependensi yang sudah terpasang) agar handshake JWT + alur jawaban realistis —
alternatif k6/artillery dipersulit oleh protokol socket.io.

## Prasyarat

- App + realtime + postgres berjalan (lokal atau staging).
- Sebagai **host**, buat kuis valid lalu klik **Mulai Live** → catat **PIN** di
  layar lobby. **Jangan klik "Mulai Permainan" dulu.**

## Menjalankan

```bash
APP_URL=https://quis.airlangga.link \
REALTIME_URL=https://quis.airlangga.link \
PIN=123456 \
PLAYER_COUNT=300 \
node loadtest/loadtest.mjs
```

Setelah semua peserta terhubung (skrip memberi tahu), klik **Mulai Permainan**
di sisi host. Skrip menjawab setiap soal secepat mungkin (opsi pertama) dan
mencatat latensi `answer:ack`. Ringkasan p50/p95 dicetak saat game selesai
(atau tekan Ctrl-C).

## Catatan

- Peserta dibuat dengan nama panggilan unik otomatis; bergabung berombak
  (batch 25) agar tidak menabraki rate limit join.
- Untuk pengukuran "selisih tampil soal antar peserta", catat timestamp
  `question:start` per peserta dan hitung rentangnya — dapat ditambahkan ke
  skrip sesuai kebutuhan.
