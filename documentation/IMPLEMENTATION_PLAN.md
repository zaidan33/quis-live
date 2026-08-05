# Implementation Plan — Quizzly (Live Quiz Platform)

**Pendamping:** `PRD.md`
**Boilerplate:** [`CodeGuide-dev/codeguide-starter-fullstack`](https://github.com/CodeGuide-dev/codeguide-starter-fullstack)
**Target:** MVP core live quiz, real-time via Socket.IO self-hosted
**Estimasi:** 7–8 minggu untuk 1 developer, 4–5 minggu untuk 2 developer

---

## 1. Apa yang Sudah Ada vs Apa yang Harus Dibangun

Boilerplate memberi fondasi yang cukup banyak. Penting untuk tahu persis batasnya agar tidak membangun ulang yang sudah ada.

### Sudah tersedia (jangan dibangun ulang)

| Komponen | Versi/Detail |
|---|---|
| Next.js App Router + Turbopack | 15.5.0, React 19.1.0 |
| TypeScript | 5.x, strict |
| Better Auth (email/password) | 1.3.7, sudah ter-wire ke Drizzle |
| Drizzle ORM + PostgreSQL | drizzle-orm 0.44.5, pg 8.16.3 |
| shadcn/ui (New York) | 40+ komponen di `components/ui/` |
| Tailwind CSS | v4 |
| Dark mode | next-themes |
| Docker Compose (postgres + app) | `docker-compose.yaml` |
| Drizzle Kit scripts | `db:push`, `db:generate`, `db:studio`, `db:reset` |
| Form handling | react-hook-form + zod 4 + @hookform/resolvers |
| Drag & drop | @dnd-kit — **pakai ini untuk reorder soal** |
| Toast | sonner |
| Chart | recharts — **pakai ini untuk distribusi jawaban & laporan** |
| Table | @tanstack/react-table — **pakai ini untuk tabel hasil** |

Perhatikan: `@dnd-kit`, `recharts`, dan `@tanstack/react-table` sudah terpasang. Tiga kebutuhan UI yang biasanya makan waktu sudah tertutup.

### Harus dibangun

| Komponen | Catatan |
|---|---|
| **Server realtime Socket.IO** | Layanan Node terpisah. Ini pekerjaan terbesar. |
| Schema Drizzle untuk domain kuis | 6 tabel baru |
| CRUD kuis & soal | Server Actions + Route Handlers |
| Upload gambar | Belum ada sama sekali di boilerplate |
| Halaman host (dashboard, editor, presenter) | — |
| Halaman peserta (join, play) | — |
| Engine game & scoring | Di server realtime |
| Laporan & ekspor CSV | — |

---

## 2. Keputusan Arsitektur

### 2.1 Kenapa layanan realtime terpisah

Next.js App Router tidak menyediakan tempat yang wajar untuk koneksi WebSocket persisten. Route Handler bersifat request-response dan bisa dimatikan kapan saja oleh runtime. Ada dua alternatif dan satu pilihan:

| Opsi | Kelebihan | Kekurangan | Putusan |
|---|---|---|---|
| Custom server (`server.ts` membungkus Next) | Satu proses, satu deploy | Kehilangan Turbopack di dev, tidak bisa Vercel, app dan socket saling menjatuhkan saat restart | ❌ |
| Layanan Socket.IO terpisah dalam repo yang sama | Scale independen, restart app tidak memutus game, batas tanggung jawab jelas | Dua proses, perlu share types | ✅ **Dipilih** |
| Managed (Pusher/Ably) | Paling cepat | Biaya per koneksi, kontrol timer lebih terbatas | ❌ (sudah dieliminasi) |

### 2.2 Bentuk repo

Struktur repo tetap seperti boilerplate, ditambah dua folder di root:

```
quizzly/
├── app/                        # Next.js (dari boilerplate)
│   ├── (auth)/                 # login, register
│   ├── (host)/                 # butuh auth
│   │   ├── dashboard/
│   │   ├── quiz/[id]/edit/
│   │   ├── host/[sessionId]/   # presenter view
│   │   └── reports/[sessionId]/
│   ├── (play)/                 # publik, tanpa auth
│   │   ├── join/
│   │   └── play/[pin]/
│   └── api/
│       ├── auth/[...all]/      # better-auth (sudah ada)
│       ├── game/token/         # terbitkan JWT untuk socket
│       └── upload/
├── components/
│   ├── ui/                     # shadcn (dari boilerplate)
│   ├── quiz/                   # editor soal, kartu kuis
│   ├── game/                   # tombol jawaban, timer, leaderboard
│   └── report/
├── db/
│   ├── index.ts                # (dari boilerplate)
│   └── schema/
│       ├── auth.ts             # (dari boilerplate)
│       └── quiz.ts             # BARU
├── lib/
│   ├── auth.ts                 # (dari boilerplate)
│   ├── scoring.ts              # BARU — rumus poin, murni & teruji
│   ├── pin.ts                  # BARU — generate & validasi PIN
│   └── validators/             # BARU — skema zod
├── shared/                     # BARU — dipakai app DAN realtime
│   ├── events.ts               # nama & tipe event socket
│   └── types.ts                # tipe domain game
├── realtime/                   # BARU — layanan Socket.IO
│   ├── src/
│   │   ├── index.ts            # bootstrap server
│   │   ├── game-manager.ts     # registry semua game aktif
│   │   ├── game-room.ts        # state machine satu game
│   │   ├── handlers/
│   │   │   ├── host.ts
│   │   │   └── player.ts
│   │   ├── persistence.ts      # tulis hasil ke Postgres
│   │   └── auth.ts             # verifikasi JWT
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── documentation/
│   ├── PRD.md
│   └── IMPLEMENTATION_PLAN.md
└── docker-compose.yaml         # tambah service `realtime`
```

Folder `shared/` diakses kedua sisi lewat path alias TypeScript. Ini mencegah masalah klasik: nama event yang berubah di satu sisi dan diam-diam rusak di sisi lain.

### 2.3 Di mana state game hidup

**State otoritatif ada di memori server realtime**, bukan di database.

Alasannya: satu soal dengan 300 peserta menghasilkan 300 tulisan dalam 20 detik. Menjadikan Postgres sebagai jalur kritis akan membuat game tersendat.

Database ditulis pada checkpoint saja:

| Kejadian | Yang ditulis |
|---|---|
| Sesi dibuat | Baris `game_session` (status `lobby`) |
| Peserta bergabung | Baris `participant` |
| **Soal ditutup** | Batch insert semua `participant_answer` untuk soal itu |
| Game selesai | Update `game_session` (status, endedAt) + skor & peringkat akhir peserta |

Konsekuensi yang harus diterima secara sadar: jika server realtime mati di tengah soal, jawaban untuk soal yang sedang berjalan itu hilang. Soal-soal sebelumnya aman. Ini trade-off yang wajar untuk MVP dan sudah dinyatakan di PRD bagian 6.2.

### 2.4 Autentikasi socket

Peserta anonim tidak punya sesi Better Auth, jadi socket tidak bisa mengandalkan cookie sesi.

```
Host:
  1. Sudah login (cookie Better Auth)
  2. POST /api/game/token  →  server verifikasi sesi, terbitkan JWT
     payload: { role: "host", sessionId, userId }, TTL 4 jam
  3. Socket connect dengan auth: { token }

Peserta:
  1. POST /api/game/token dengan { pin, nickname }
     → server cek PIN valid & sesi masih di lobby, cek nickname unik
     → terbitkan JWT payload: { role: "player", sessionId, participantId }
     → participantId juga disimpan di localStorage untuk reconnect
  2. Socket connect dengan auth: { token }
```

JWT ditandatangani dengan `GAME_TOKEN_SECRET` yang dibagi antara Next.js dan layanan realtime.

---

## 3. Skema Database

Tambahkan file `db/schema/quiz.ts`. Tabel auth yang sudah ada tidak disentuh.

```ts
import {
  pgTable, uuid, text, integer, boolean, timestamp,
  jsonb, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const questionTypeEnum = pgEnum("question_type", [
  "multiple_choice",
  "true_false",
]);

export const gameStatusEnum = pgEnum("game_status", [
  "lobby",
  "in_progress",
  "finished",
  "aborted",
]);

/* ---------------------------------------------------------- quiz */
export const quiz = pgTable(
  "quiz",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("quiz_owner_idx").on(t.ownerId)],
);

/* ------------------------------------------------------ question */
export const question = pgTable(
  "question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id").notNull().references(() => quiz.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    type: questionTypeEnum("type").notNull().default("multiple_choice"),
    text: text("text").notNull(),
    imageUrl: text("image_url"),
    timeLimitSec: integer("time_limit_sec").notNull().default(20),
    basePoints: integer("base_points").notNull().default(1000), // 0 | 1000 | 2000
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("question_quiz_order_idx").on(t.quizId, t.order)],
);

/* -------------------------------------------------- answerOption */
export const answerOption = pgTable(
  "answer_option",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id").notNull().references(() => question.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),        // 0..3 → warna/bentuk tombol
    text: text("text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (t) => [index("option_question_idx").on(t.questionId)],
);

/* --------------------------------------------------- gameSession */
export const gameSession = pgTable(
  "game_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id").notNull().references(() => quiz.id, { onDelete: "restrict" }),
    hostId: text("host_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    pin: text("pin").notNull(),
    status: gameStatusEnum("status").notNull().default("lobby"),
    currentQuestionIndex: integer("current_question_index").notNull().default(-1),
    settings: jsonb("settings").$type<{
      streakBonus: boolean;
      showAnswersOnPlayerDevice: boolean;
      randomizeQuestions: boolean;
    }>().notNull().default({
      streakBonus: false,
      showAnswersOnPlayerDevice: false,
      randomizeQuestions: false,
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
  },
  (t) => [
    // PIN hanya wajib unik untuk sesi yang belum selesai.
    // Dibuat sebagai partial unique index lewat SQL manual di migrasi.
    index("session_pin_idx").on(t.pin),
    index("session_host_idx").on(t.hostId),
  ],
);

/* -------------------------------------------------- participant */
export const participant = pgTable(
  "participant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameSessionId: uuid("game_session_id").notNull().references(() => gameSession.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    finalScore: integer("final_score").notNull().default(0),
    finalRank: integer("final_rank"),
    correctCount: integer("correct_count").notNull().default(0),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    leftAt: timestamp("left_at"),
  },
  (t) => [uniqueIndex("participant_session_nickname_idx").on(t.gameSessionId, t.nickname)],
);

/* -------------------------------------------- participantAnswer */
export const participantAnswer = pgTable(
  "participant_answer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    participantId: uuid("participant_id").notNull().references(() => participant.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => question.id, { onDelete: "cascade" }),
    selectedOptionId: uuid("selected_option_id").references(() => answerOption.id, { onDelete: "set null" }),
    isCorrect: boolean("is_correct").notNull(),
    responseTimeMs: integer("response_time_ms"),   // null = tidak menjawab
    pointsAwarded: integer("points_awarded").notNull().default(0),
    answeredAt: timestamp("answered_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("answer_participant_question_idx").on(t.participantId, t.questionId),
    index("answer_question_idx").on(t.questionId),
  ],
);
```

### Migrasi manual yang perlu ditambahkan

Drizzle belum mendukung partial unique index secara deklaratif. Setelah `npm run db:generate`, tambahkan ke file migrasi:

```sql
CREATE UNIQUE INDEX session_active_pin_unique
  ON game_session (pin)
  WHERE status IN ('lobby', 'in_progress');
```

Ini yang menjamin PIN unik di antara sesi aktif, tapi tetap membolehkan PIN lama dipakai ulang setelah game selesai.

---

## 4. Kontrak Event Socket

Letakkan di `shared/events.ts`. Ini kontrak mengikat antara app dan layanan realtime.

### 4.1 Host → Server

| Event | Payload | Efek |
|---|---|---|
| `host:join_session` | `{}` (sessionId dari JWT) | Host masuk room, terima state penuh |
| `host:start_game` | `{}` | Lobby → soal pertama |
| `host:next_question` | `{}` | Lanjut ke soal berikutnya |
| `host:skip_question` | `{}` | Tutup soal berjalan lebih awal |
| `host:show_leaderboard` | `{}` | Pindah dari hasil soal ke leaderboard |
| `host:kick_participant` | `{ participantId }` | Keluarkan peserta |
| `host:end_game` | `{}` | Akhiri game, hitung peringkat final |

### 4.2 Peserta → Server

| Event | Payload | Efek |
|---|---|---|
| `player:join` | `{}` (participantId dari JWT) | Masuk room, terima state saat ini |
| `player:answer` | `{ questionId, optionId }` | Catat jawaban; server yang menentukan waktu |
| `time:sync` | `{ clientSentAt }` | Handshake offset jam |

### 4.3 Server → Klien

| Event | Payload | Penerima |
|---|---|---|
| `game:state` | State penuh sesuai peran (lihat 4.4) | Pengirim saja |
| `lobby:update` | `{ participants: [{id, nickname}], count }` | Room (debounce 300 ms) |
| `question:start` | `{ index, total, question, serverStartAt, timeLimitMs }` | Room |
| `question:end` | `{ correctOptionId, distribution, yourResult? }` | Room + per-peserta |
| `answer:ack` | `{ received: true }` | Peserta pengirim saja |
| `leaderboard:update` | `{ top: [...], yourRank? }` | Room + per-peserta |
| `game:over` | `{ podium, yourSummary? }` | Room + per-peserta |
| `game:error` | `{ code, message }` | Target |
| `time:sync_ack` | `{ clientSentAt, serverTime }` | Pengirim saja |

### 4.4 Aturan payload yang tidak boleh dilanggar

Payload `question:start` **berbeda** untuk host dan peserta:

```ts
// Ke HOST (presenter view) — boleh tahu jawaban benar
type HostQuestionPayload = {
  index: number; total: number;
  question: {
    id: string; text: string; imageUrl: string | null;
    options: { id: string; order: number; text: string; isCorrect: boolean }[];
  };
  serverStartAt: number; timeLimitMs: number;
};

// Ke PESERTA — TIDAK ADA isCorrect, TIDAK ADA teks jika mode layar bersama
type PlayerQuestionPayload = {
  index: number; total: number;
  question: {
    id: string;
    text?: string;                                  // hanya jika showAnswersOnPlayerDevice
    options: { id: string; order: number; text?: string }[];
  };
  serverStartAt: number; timeLimitMs: number;
};
```

Buat fungsi `toPlayerPayload(question)` sebagai satu-satunya jalan membentuk payload peserta, dan tulis unit test yang gagal jika `isCorrect` muncul di hasilnya. Kebocoran jawaban benar adalah bug paling merusak di aplikasi jenis ini dan paling mudah masuk tanpa disadari saat refactor.

### 4.5 State machine game

```
        host:start_game
LOBBY ────────────────► QUESTION_ACTIVE
                             │
             timer habis ATAU semua menjawab ATAU host:skip_question
                             ▼
                      QUESTION_ENDED
                             │ host:show_leaderboard
                             ▼
                       LEADERBOARD
                       │           │
        host:next_question         soal habis / host:end_game
                       │           │
                       ▼           ▼
              QUESTION_ACTIVE   FINISHED
```

Setiap transisi divalidasi. Event yang datang di state yang salah dibalas `game:error`, bukan diabaikan diam-diam — diam membuat debugging jauh lebih sulit.

---

## 5. Modul Scoring (`lib/scoring.ts`)

Fungsi murni, tanpa I/O, mudah diuji. Diimpor oleh layanan realtime.

```ts
export function calculatePoints(params: {
  isCorrect: boolean;
  responseTimeMs: number;
  timeLimitMs: number;
  basePoints: number;
}): number {
  const { isCorrect, responseTimeMs, timeLimitMs, basePoints } = params;
  if (!isCorrect || basePoints === 0) return 0;

  const elapsed = Math.min(Math.max(responseTimeMs, 0), timeLimitMs);
  const ratio = elapsed / timeLimitMs;
  return Math.round(basePoints * (1 - ratio / 2));
}

export function calculateStreakBonus(streakCount: number): number {
  if (streakCount < 2) return 0;
  return Math.min(streakCount - 1, 5) * 100;
}

export function rankParticipants(list: ParticipantScore[]): RankedParticipant[] {
  // urutan: poin ↓, benar ↓, totalResponseMs ↑, joinedAt ↑
}
```

### Test wajib untuk modul ini

| Kasus | Ekspektasi |
|---|---|
| Benar, 0 ms, base 1000 | 1000 |
| Benar, waktu penuh, base 1000 | 500 |
| Benar, setengah waktu, base 1000 | 750 |
| Salah, kapan pun | 0 |
| basePoints 0 | 0 |
| responseTime > timeLimit | diperlakukan sebagai timeLimit (500) |
| responseTime negatif | diperlakukan sebagai 0 (1000) |
| Benar, base 2000, setengah waktu | 1500 |

---

## 6. Rencana per Fase

Setiap fase menghasilkan sesuatu yang bisa dijalankan dan diuji. Jangan mulai fase berikutnya sebelum kriteria selesai terpenuhi.

---

### Fase 0 — Fondasi (± 4 hari)

**Tujuan:** repo siap, database punya bentuk, dua proses bisa saling bicara.

Pekerjaan:
1. Clone boilerplate, `npm install`, `npm run db:up`, pastikan login/register bawaan jalan.
2. Tulis `db/schema/quiz.ts` sesuai bagian 3.
3. `npm run db:generate`, tambahkan partial unique index secara manual, `npm run db:push`.
4. Buat folder `shared/` berisi `events.ts` dan `types.ts` (baru berupa kerangka).
5. Tambahkan path alias di `tsconfig.json`: `"@shared/*": ["./shared/*"]`.
6. Scaffold `realtime/` — Node + TypeScript + `socket.io`, endpoint health check, koneksi Drizzle sendiri ke Postgres yang sama.
7. Tambahkan service `realtime` ke `docker-compose.yaml` (port 4000).
8. Pasang Vitest di kedua sisi.

**Selesai jika:** `npm run dev` menjalankan Next di :3000, `npm run realtime:dev` menjalankan socket server di :4000, `curl localhost:4000/health` merespons, `npm run db:studio` menampilkan 6 tabel baru.

---

### Fase 1 — Manajemen Kuis (± 8 hari)

**Tujuan:** host bisa membuat kuis lengkap. Belum ada real-time sama sekali.

Pekerjaan:
1. Layout `(host)` dengan proteksi auth — redirect ke login jika tidak ada sesi.
2. Halaman dashboard: daftar kuis, pencarian, tombol buat baru. Pakai `@tanstack/react-table`.
3. Server Actions untuk CRUD kuis (`lib/actions/quiz.ts`), validasi zod.
4. Editor kuis (`app/(host)/quiz/[id]/edit/page.tsx`):
   - Panel kiri: daftar soal, reorder pakai `@dnd-kit`
   - Panel kanan: form soal — teks, gambar, tipe, batas waktu, bobot poin, 2–4 opsi jawaban dengan penanda benar
   - Autosave dengan debounce, indikator status simpan
5. Upload gambar: Route Handler `POST /api/upload`, validasi tipe & ukuran (maks 5 MB), simpan ke volume Docker `public/uploads` untuk MVP.
6. Duplikat kuis, soft-delete kuis.
7. Validasi kesiapan kuis: minimal 1 soal, setiap soal punya ≥ 2 opsi dan tepat 1 jawaban benar. Tombol "Mulai Live" nonaktif jika belum valid, dengan penjelasan apa yang kurang.

**Selesai jika:** host bisa membuat kuis 10 soal campuran pilihan ganda dan benar/salah, menyusun ulang urutannya, refresh halaman, dan semua data utuh.

---

### Fase 2 — Layanan Realtime & Lobby (± 8 hari)

**Tujuan:** peserta bisa bergabung ke sesi dan terlihat di layar host, real-time.

Pekerjaan:
1. `lib/pin.ts` — generate PIN 6 digit acak kriptografis, cek tabrakan terhadap sesi aktif, retry maksimal 10 kali.
2. Route Handler `POST /api/game/token` untuk host dan peserta (lihat 2.4). Rate limit pada jalur peserta.
3. `realtime/src/game-manager.ts` — `Map<sessionId, GameRoom>`, pembuatan & pembersihan room.
4. `realtime/src/game-room.ts` — kelas state machine; untuk fase ini cukup state `LOBBY`.
5. Middleware autentikasi socket: verifikasi JWT, tempelkan `role`, `sessionId`, `participantId` ke socket.
6. Handler host: `host:join_session`. Handler peserta: `player:join`.
7. `lobby:update` dengan debounce 300 ms — penting agar 300 peserta yang masuk bersamaan tidak membanjiri layar host dengan 300 render.
8. Halaman join peserta (`app/(play)/join/page.tsx`): input PIN → input nama panggilan → lobby menunggu. Filter kata terlarang pada nama panggilan.
9. Presenter view lobby (`app/(host)/host/[sessionId]/page.tsx`): PIN besar, QR code, grid nama peserta, hitungan, tombol kick, tombol mulai.
10. Handshake `time:sync`: klien kirim 5 sampel, ambil median offset, simpan di store klien.

**Selesai jika:** dari dua perangkat berbeda, dua peserta bisa join dengan PIN dan namanya muncul di layar host dalam < 1 detik. Nama duplikat ditolak. Kick berfungsi.

---

### Fase 3 — Loop Permainan & Skor (± 10 hari)

**Tujuan:** game bisa dimainkan dari awal sampai akhir. Ini inti produk.

Pekerjaan:
1. `lib/scoring.ts` beserta seluruh test di bagian 5. **Tulis test lebih dulu.**
2. Lengkapi state machine `GameRoom`: semua transisi di bagian 4.5, dengan validasi.
3. Timer sisi server: `setTimeout` per soal, disimpan agar bisa dibatalkan saat semua peserta sudah menjawab atau host skip.
4. `toPlayerPayload()` + test anti-kebocoran `isCorrect`.
5. Handler `player:answer`:
   - tolak jika bukan state `QUESTION_ACTIVE`
   - tolak jika peserta sudah menjawab soal ini
   - tolak jika `now > serverStartAt + timeLimitMs + 500`
   - hitung `responseTimeMs` dari jam server
   - simpan ke state room, balas `answer:ack`
6. Penutupan soal: hitung distribusi jawaban, kirim `question:end` ke room, kirim hasil personal ke tiap peserta, **batch insert `participant_answer` ke Postgres**.
7. `leaderboard:update` — top 5 ke layar bersama, peringkat pribadi ke tiap peserta.
8. UI presenter: countdown 3-2-1, soal + timer bar, distribusi jawaban (recharts bar chart), leaderboard, podium.
9. UI peserta: 4 tombol warna+bentuk (segitiga/wajik/lingkaran/kotak), state terkunci setelah menjawab, layar feedback benar/salah + poin + peringkat.
10. Alur akhir game: hitung peringkat final dengan tie-break, persist, kirim `game:over`.
11. **Reconnect**: `participantId` di localStorage; saat socket tersambung ulang, server kirim `game:state` sesuai state saat ini sehingga peserta langsung berada di layar yang benar dengan skor utuh.

**Selesai jika:** satu game 10 soal dengan 5 peserta di 5 perangkat selesai tanpa error, skor sesuai perhitungan manual, dan peserta yang mengaktifkan mode pesawat selama 10 detik di tengah soal kembali dengan skor tidak berubah.

---

### Fase 4 — Hasil & Laporan (± 5 hari)

Pekerjaan:
1. Halaman riwayat sesi di dashboard host.
2. Halaman laporan `app/(host)/reports/[sessionId]/page.tsx`:
   - Kartu ringkasan: jumlah peserta, rata-rata skor, akurasi keseluruhan, durasi
   - Tabel peserta (@tanstack/react-table): peringkat, nama, skor, benar/salah
   - Analisis per soal: akurasi, distribusi, rata-rata waktu jawab
   - Sorotan **soal tersulit**
3. Ekspor CSV via Route Handler `GET /api/reports/[sessionId]/export`.
4. Hapus sesi beserta datanya.

**Selesai jika:** setelah menjalankan game, host bisa membuka laporan, angkanya cocok dengan yang tampil saat game, dan CSV terunduh dengan benar.

---

### Fase 5 — Pengerasan & Rilis (± 7 hari)

Pekerjaan:
1. **Load test** dengan skrip artillery/k6: 300 socket peserta pada satu sesi. Ukur p95 selisih tampil soal dan latensi ack. Target ada di PRD 6.1.
2. Uji latensi buatan: 50 ms, 200 ms, 500 ms — pastikan tampilan timer tetap masuk akal dan skor tetap adil.
3. Rate limiting: join dan submit jawaban.
4. Penanganan error di seluruh UI — tidak boleh ada layar putih. Setiap `game:error` punya tampilan yang jelas.
5. Kedaluwarsa sesi: cron yang menutup sesi tidak aktif > 60 menit.
6. Audit aksesibilitas: kontras, target sentuh, navigasi keyboard host.
7. Uji lintas peramban: Chrome/Safari desktop & mobile, Firefox.
8. Dockerfile produksi untuk layanan realtime, `docker-compose.prod.yaml` dengan Nginx sebagai reverse proxy (WebSocket upgrade + terminasi SSL).
9. Health check dan logging terstruktur di kedua layanan.
10. Dokumentasi deployment.

**Selesai jika:** load test 300 peserta lolos target, dan stack lengkap berjalan di VPS staging dengan HTTPS.

---

## 7. Cara Menjalankan Ini dengan Claude Code

Boilerplate ini sudah membawa `CLAUDE.md` dengan alur `task-manager`. Anda bisa memakainya atau menggantinya. Yang penting: **jangan minta Claude Code membangun seluruh aplikasi dalam satu prompt.** Kerjakan per fase, verifikasi, lalu lanjut.

### Persiapan

Salin `PRD.md` dan `IMPLEMENTATION_PLAN.md` ke `documentation/`. Keduanya menjadi konteks yang bisa dirujuk di setiap prompt.

### Contoh prompt per fase

**Fase 0**
```
Baca documentation/PRD.md dan documentation/IMPLEMENTATION_PLAN.md.

Kerjakan Fase 0 saja:
1. Buat db/schema/quiz.ts persis seperti bagian 3 rencana implementasi
2. Ekspor semua tabel baru dari db/schema/index.ts
3. Buat folder shared/ dengan events.ts dan types.ts sesuai bagian 4
4. Tambahkan path alias @shared/* di tsconfig.json
5. Scaffold realtime/ (Node + TS + socket.io + health check di :4000)
6. Tambahkan service realtime ke docker-compose.yaml
7. Pasang Vitest di app dan realtime

Jangan buat halaman UI apa pun. Berhenti setelah 7 langkah ini
dan laporkan apa yang perlu saya jalankan untuk memverifikasi.
```

**Fase 3 (bagian paling kritis — pecah lagi)**
```
Baca documentation/IMPLEMENTATION_PLAN.md bagian 5 dan 6 Fase 3.

Kerjakan HANYA langkah 1 dan 4 Fase 3:
1. Implementasikan lib/scoring.ts sesuai spesifikasi bagian 5
2. Tulis test Vitest untuk SEMUA 8 kasus di tabel test bagian 5
3. Implementasikan toPlayerPayload() di shared/
4. Tulis test yang GAGAL jika field isCorrect muncul di payload peserta

Test ditulis lebih dulu, baru implementasi. Jalankan test dan
tunjukkan hasilnya sebelum melanjutkan.
```

### Aturan yang layak ditambahkan ke `CLAUDE.md` proyek

```markdown
## Aturan Proyek Quizzly

- Cakupan MVP terkunci di documentation/PRD.md bagian 7. Jangan
  implementasikan apa pun yang ada di daftar "Di Luar Cakupan".
- Nama event socket HANYA didefinisikan di shared/events.ts.
  Jangan pernah menulis string event secara literal.
- Payload ke peserta tidak boleh memuat isCorrect. Selalu lewat
  toPlayerPayload().
- Perhitungan waktu untuk skor selalu memakai jam server. Timestamp
  dari klien hanya untuk tampilan hitung mundur.
- Pakai komponen yang sudah ada di components/ui/ sebelum menambah
  dependensi baru. Cek package.json dulu — @dnd-kit, recharts, dan
  @tanstack/react-table sudah terpasang.
- Perubahan schema selalu lewat db:generate, bukan edit manual file
  migrasi yang sudah ada.
```

---

## 8. Dependensi Tambahan

Yang perlu dipasang di **app** (`package.json` root):

```bash
npm install socket.io-client jose qrcode.react
npm install -D vitest @vitejs/plugin-react @testing-library/react
```

Yang perlu dipasang di **realtime** (`realtime/package.json`):

```bash
npm install socket.io drizzle-orm pg jose dotenv
npm install -D typescript tsx @types/node @types/pg vitest
```

Catatan: `jose` dipakai untuk JWT karena berjalan baik di Edge maupun Node runtime. `zod` sudah ada di boilerplate — pakai untuk validasi payload socket juga, bukan hanya form.

### Variabel lingkungan tambahan

```env
# Sudah ada dari boilerplate
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000

# Baru
GAME_TOKEN_SECRET=minimal-32-karakter-acak
REALTIME_PORT=4000
NEXT_PUBLIC_REALTIME_URL=http://localhost:4000
UPLOAD_DIR=./public/uploads
MAX_UPLOAD_MB=5
```

---

## 9. Strategi Pengujian

| Lapisan | Alat | Cakupan |
|---|---|---|
| Unit | Vitest | `lib/scoring.ts` (wajib 100%), `lib/pin.ts`, `toPlayerPayload()`, validator zod |
| Integrasi socket | Vitest + socket.io-client | Transisi state machine, penolakan event di state salah, alur reconnect |
| Komponen | Testing Library | Tombol jawaban (state terkunci), timer, form editor soal |
| E2E | Playwright | Satu alur penuh: buat kuis → host → 2 peserta join → main 3 soal → laporan |
| Beban | k6 atau artillery | 300 peserta satu sesi, ukur p95 |
| Manual | — | Multi-perangkat nyata, uji airplane mode, uji proyektor |

Tiga hal yang paling sering gagal di aplikasi seperti ini dan wajib punya test otomatis:

1. Kebocoran `isCorrect` ke peserta
2. Perhitungan poin di kondisi tepi (0 ms, waktu habis, di luar batas)
3. Pemulihan state setelah reconnect di tengah soal

---

## 10. Deployment

MVP menargetkan VPS dengan Docker Compose. Serverless bukan pilihan karena Socket.IO butuh proses persisten.

```
                    Internet
                       │
                  ┌────▼────┐
                  │  Nginx  │  SSL, WebSocket upgrade
                  └──┬───┬──┘
             /       │   │      /socket.io
        ┌───────────▼┐ ┌▼──────────────┐
        │  Next.js   │ │  Realtime     │
        │  :3000     │ │  :4000        │
        └─────┬──────┘ └───────┬───────┘
              └────────┬───────┘
                  ┌────▼─────┐
                  │ Postgres │
                  └──────────┘
```

Konfigurasi Nginx yang perlu diperhatikan — tanpa ini WebSocket akan gagal upgrade:

```nginx
location /socket.io/ {
    proxy_pass http://realtime:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}
```

Spesifikasi server minimum untuk beban MVP: 2 vCPU, 4 GB RAM, 40 GB SSD.

### Catatan untuk skala berikutnya

Jika perlu lebih dari satu instance realtime, tambahkan `@socket.io/redis-adapter` dan Redis, lalu pastikan load balancer memakai sticky session. Arsitektur saat ini sudah mengakomodasi ini tanpa perubahan besar — state room dipegang per-instance dan sudah dipisahkan bersih dari lapisan transport. Jangan kerjakan ini sebelum dibutuhkan.

---

## 11. Ringkasan Timeline

| Fase | Isi | Durasi | Kumulatif |
|---|---|---|---|
| 0 | Fondasi & schema | 4 hari | 4 hari |
| 1 | Manajemen kuis | 8 hari | 12 hari |
| 2 | Realtime & lobby | 8 hari | 20 hari |
| 3 | Loop permainan & skor | 10 hari | 30 hari |
| 4 | Hasil & laporan | 5 hari | 35 hari |
| 5 | Pengerasan & rilis | 7 hari | 42 hari |

**± 42 hari kerja ≈ 8 minggu** untuk satu developer. Dengan dua developer yang membagi kerja (satu di realtime, satu di UI mulai Fase 2), realistis di **5 minggu**.

Fase 3 adalah yang paling berisiko molor. Jika jadwal tertekan, kompromi yang paling aman adalah memangkas Fase 4 menjadi tabel hasil sederhana + CSV, bukan memangkas pengujian di Fase 3.
