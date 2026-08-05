# PRD — Platform Live Quiz (Kahoot-like)

**Nama kerja proyek:** Quizzly
**Versi dokumen:** 1.0
**Tanggal:** 5 Agustus 2026
**Status:** Draft untuk implementasi MVP
**Boilerplate:** [`CodeGuide-dev/codeguide-starter-fullstack`](https://github.com/CodeGuide-dev/codeguide-starter-fullstack)

---

## 1. Ringkasan Eksekutif

Quizzly adalah platform kuis interaktif real-time. Seorang **host** membuat kuis, menjalankannya di layar bersama, lalu **peserta** bergabung dari perangkat masing-masing dengan memasukkan PIN — tanpa perlu membuat akun. Soal tampil serentak di semua layar, skor dihitung dari kecepatan dan ketepatan jawaban, dan leaderboard diperbarui setelah setiap soal.

MVP ini fokus pada satu alur yang harus terasa mulus: **buat kuis → host game → peserta join → main → lihat hasil.** Fitur di luar alur itu sengaja ditunda.

### Kenapa dibangun

Kahoot versi gratis membatasi jumlah peserta, mengunci fitur di balik paywall, dan datanya berada di luar kendali institusi. Untuk kampus, sekolah, dan perusahaan yang butuh kontrol data serta jumlah peserta tak dibatasi lisensi, platform yang bisa di-*self-host* punya nilai nyata.

### Prinsip desain

1. **Peserta tidak perlu akun.** Hambatan masuk harus nol — cukup PIN dan nama panggilan.
2. **Server adalah otoritas.** Timer, skor, dan urutan permainan ditentukan server, bukan browser peserta. Ini syarat mutlak agar skor berbasis kecepatan bisa dipercaya.
3. **Gagal dengan anggun.** Koneksi peserta akan putus. Sistem harus memulihkan sesi tanpa kehilangan skor.
4. **Host memegang kendali.** Tidak ada auto-advance yang mengejutkan. Host yang memutuskan kapan lanjut.

---

## 2. Target Pengguna

Platform dirancang generik dan dapat dipakai lintas segmen. Empat persona berikut memakai alur inti yang sama; perbedaannya hanya pada skala dan penekanan.

| Persona | Konteks | Kebutuhan utama | Skala per sesi |
|---|---|---|---|
| **Dosen** | Kuis review di kelas besar, kuliah tatap muka & daring | Peserta banyak, ekspor nilai, hasil per mahasiswa | 100–300 |
| **Guru** | Review materi, ice breaker, formative assessment | UI sederhana, cepat disiapkan, aman untuk anak | 20–40 |
| **Trainer korporat** | Onboarding, refresher kepatuhan, team building | Laporan kehadiran & skor, branding | 15–100 |
| **Host kasual** | Trivia keluarga, acara komunitas, gathering | Setup instan, seru, tanpa ribet | 5–50 |

### Peran dalam sistem

- **Host** — punya akun, membuat kuis, menjalankan game. Butuh autentikasi.
- **Peserta** — anonim, hanya nama panggilan. Tidak butuh akun.
- **Layar bersama (presenter view)** — tampilan soal dan leaderboard di proyektor. Bagian dari sesi host, bukan peran terpisah.

---

## 3. Alur Pengguna Inti

### 3.1 Host membuat kuis

```
Login → Dashboard → "Kuis Baru" → Isi judul & deskripsi
   → Tambah soal (teks, gambar opsional, 2–4 pilihan jawaban,
      tandai jawaban benar, atur batas waktu & bobot poin)
   → Susun ulang urutan soal (drag & drop)
   → Simpan
```

### 3.2 Host menjalankan game

```
Buka kuis → "Mulai Live" → Sistem buat sesi + PIN 6 digit
   → Layar lobby menampilkan PIN besar + daftar peserta yang masuk
   → Host klik "Mulai" ketika peserta sudah cukup
   → Untuk tiap soal:
        countdown 3-2-1 → soal tampil + timer berjalan
        → timer habis / semua sudah jawab → tampil distribusi jawaban
        → host klik "Lanjut" → leaderboard top 5
        → host klik "Soal Berikutnya"
   → Setelah soal terakhir → podium 3 besar → ringkasan hasil
```

### 3.3 Peserta bermain

```
Buka URL → Masukkan PIN → Masukkan nama panggilan
   → Menunggu di lobby ("Kamu sudah masuk, tunggu host mulai")
   → Soal muncul: 4 tombol warna/bentuk, tanpa teks jawaban di HP
     (teks jawaban ada di layar bersama) — atau dengan teks jika
     mode "solo/tanpa layar bersama" aktif
   → Tap jawaban → konfirmasi terkirim
   → Feedback: benar/salah, poin didapat, peringkat sementara
   → Ulangi sampai selesai → tampil peringkat akhir
```

---

## 4. Kebutuhan Fungsional

Prioritas: **P0** = wajib untuk MVP, **P1** = penting tapi bisa menyusul, **P2** = di luar MVP.

### 4.1 Autentikasi & Akun (Host)

| ID | Kebutuhan | Prioritas |
|---|---|---|
| AUTH-1 | Host dapat mendaftar dan login dengan email + password (Better Auth, sudah ada di boilerplate) | P0 |
| AUTH-2 | Sesi host bertahan antar kunjungan | P0 |
| AUTH-3 | Host dapat logout | P0 |
| AUTH-4 | Reset password via email | P1 |
| AUTH-5 | Login dengan Google / OAuth | P1 |
| AUTH-6 | SSO (SAML/OIDC) untuk institusi | P2 |

### 4.2 Manajemen Kuis

| ID | Kebutuhan | Prioritas |
|---|---|---|
| QUIZ-1 | Host dapat membuat kuis dengan judul, deskripsi, dan gambar sampul | P0 |
| QUIZ-2 | Host dapat menambah, mengedit, dan menghapus soal | P0 |
| QUIZ-3 | Tipe soal **pilihan ganda** (2–4 opsi, tepat satu benar) | P0 |
| QUIZ-4 | Tipe soal **benar/salah** | P0 |
| QUIZ-5 | Batas waktu per soal dapat diatur (5, 10, 20, 30, 60, 90, 120 detik) | P0 |
| QUIZ-6 | Bobot poin per soal: standar (1000), ganda (2000), tanpa poin (0) | P0 |
| QUIZ-7 | Host dapat menyusun ulang urutan soal | P0 |
| QUIZ-8 | Host dapat menduplikasi kuis | P0 |
| QUIZ-9 | Host dapat menghapus kuis (soft delete) | P0 |
| QUIZ-10 | Unggah gambar untuk soal | P0 |
| QUIZ-11 | Daftar kuis milik host dengan pencarian | P0 |
| QUIZ-12 | Validasi: kuis tidak bisa dijalankan jika < 1 soal, atau ada soal tanpa jawaban benar | P0 |
| QUIZ-13 | Tipe soal isian singkat (typed answer) | P1 |
| QUIZ-14 | Tipe soal urutan (ordering) dan slider | P2 |
| QUIZ-15 | Kuis publik yang dapat ditemukan & disalin pengguna lain | P2 |
| QUIZ-16 | Impor soal dari spreadsheet / CSV | P1 |
| QUIZ-17 | Generate soal otomatis dengan AI | P2 |

### 4.3 Sesi Permainan (Host)

| ID | Kebutuhan | Prioritas |
|---|---|---|
| GAME-1 | Sistem menghasilkan **PIN 6 digit unik** untuk setiap sesi aktif | P0 |
| GAME-2 | Layar lobby menampilkan PIN, QR code, dan daftar peserta secara real-time | P0 |
| GAME-3 | Host dapat mengeluarkan (kick) peserta dari lobby | P0 |
| GAME-4 | Host memulai game secara manual | P0 |
| GAME-5 | Countdown 3-2-1 sebelum setiap soal | P0 |
| GAME-6 | Timer berjalan di layar bersama dan perangkat peserta, tersinkron dengan server | P0 |
| GAME-7 | Soal otomatis ditutup ketika timer habis **atau** semua peserta sudah menjawab | P0 |
| GAME-8 | Host dapat melewati (skip) soal yang sedang berjalan | P0 |
| GAME-9 | Setelah soal ditutup: tampil distribusi jawaban (berapa orang pilih apa) + jawaban benar | P0 |
| GAME-10 | Leaderboard top 5 setelah setiap soal | P0 |
| GAME-11 | Host mengendalikan perpindahan ke soal berikutnya secara manual | P0 |
| GAME-12 | Host dapat mengakhiri game kapan saja | P0 |
| GAME-13 | Podium 3 besar di akhir game | P0 |
| GAME-14 | PIN kedaluwarsa otomatis setelah game selesai atau tidak aktif 60 menit | P0 |
| GAME-15 | Mode tim (peserta dikelompokkan) | P2 |
| GAME-16 | Mode asinkron / challenge (peserta kerjakan sendiri kapan saja) | P2 |
| GAME-17 | Musik latar dan efek suara | P1 |

### 4.4 Pengalaman Peserta

| ID | Kebutuhan | Prioritas |
|---|---|---|
| PLAY-1 | Peserta bergabung hanya dengan PIN + nama panggilan, tanpa akun | P0 |
| PLAY-2 | Validasi nama panggilan: 2–20 karakter, unik dalam satu sesi, filter kata kasar | P0 |
| PLAY-3 | Peserta menjawab dengan menekan tombol berwarna/berbentuk besar (ramah sentuh) | P0 |
| PLAY-4 | Jawaban terkunci setelah dikirim — tidak bisa diubah | P0 |
| PLAY-5 | Feedback langsung setelah soal ditutup: benar/salah, poin, peringkat | P0 |
| PLAY-6 | **Reconnect otomatis**: peserta yang koneksinya putus kembali ke state game yang benar tanpa kehilangan skor | P0 |
| PLAY-7 | Halaman peserta responsif dan berfungsi di ponsel kelas bawah | P0 |
| PLAY-8 | Peserta melihat ringkasan performa pribadi di akhir game | P0 |
| PLAY-9 | Mode "tanpa layar bersama": teks jawaban ikut tampil di perangkat peserta | P1 |
| PLAY-10 | Peserta dapat memilih avatar | P1 |

### 4.5 Hasil & Laporan

| ID | Kebutuhan | Prioritas |
|---|---|---|
| REPT-1 | Host melihat ringkasan sesi: jumlah peserta, rata-rata skor, akurasi keseluruhan | P0 |
| REPT-2 | Tabel hasil per peserta: skor akhir, peringkat, jumlah benar/salah | P0 |
| REPT-3 | Analisis per soal: persentase benar, distribusi jawaban, rata-rata waktu jawab | P0 |
| REPT-4 | Penanda **soal tersulit** (akurasi terendah) untuk membantu host mengulang materi | P0 |
| REPT-5 | Ekspor hasil ke CSV | P0 |
| REPT-6 | Riwayat semua sesi yang pernah dijalankan host | P0 |
| REPT-7 | Ekspor ke XLSX dengan format nilai siap unggah | P1 |
| REPT-8 | Perbandingan performa antar sesi untuk kuis yang sama | P2 |

---

## 5. Aturan Penilaian (Scoring)

Aturan ini adalah spesifikasi. Implementasi harus persis mengikutinya agar hasil dapat diuji.

### 5.1 Rumus poin

Untuk jawaban **benar**:

```
elapsedMs   = waktu server saat jawaban diterima - waktu server saat soal dimulai
elapsedMs   = clamp(elapsedMs, 0, timeLimitMs)
ratio       = elapsedMs / timeLimitMs                  // 0.0 .. 1.0
points      = round( basePoints * (1 - ratio / 2) )
```

Untuk jawaban **salah** atau **tidak menjawab**: `points = 0`.

### 5.2 Konsekuensi rumus

- Menjawab benar **seketika** → 100% basePoints (1000 poin untuk bobot standar).
- Menjawab benar **tepat saat waktu habis** → 50% basePoints (500 poin).
- Poin turun **linier** terhadap waktu, jadi kecepatan selalu terasa berpengaruh tapi tidak brutal.
- `basePoints` mengikuti bobot soal: standar = 1000, ganda = 2000, tanpa poin = 0.

### 5.3 Bonus beruntun (streak)

Opsional, dapat dinyalakan per sesi. **Default: mati pada MVP.**

```
streakBonus = min(streakCount - 1, 5) * 100     // maksimal +500
```

Streak direset ke 0 saat peserta salah atau tidak menjawab.

### 5.4 Aturan peringkat & tie-break

Urutan penentuan peringkat:
1. Total poin tertinggi
2. Jika sama → jumlah jawaban benar terbanyak
3. Jika sama → total waktu respons kumulatif terkecil
4. Jika masih sama → urutan bergabung ke lobby (yang lebih awal menang)

### 5.5 Integritas timer

- Waktu mulai soal ditentukan **server** (`serverStartAt`), bukan browser.
- Waktu terima jawaban dicatat **server**, bukan dikirim klien.
- Klien melakukan sinkronisasi jam (clock offset handshake) **hanya untuk menampilkan** hitung mundur yang akurat. Nilai dari klien tidak pernah dipakai untuk menghitung skor.
- Jawaban yang tiba setelah `serverStartAt + timeLimitMs + toleransi 500 ms` ditolak dan dihitung sebagai tidak menjawab.

Toleransi 500 ms mengakomodasi latensi jaringan wajar tanpa membuka celah kecurangan yang berarti.

---

## 6. Kebutuhan Non-Fungsional

### 6.1 Performa & skala

| Metrik | Target MVP |
|---|---|
| Peserta bersamaan dalam satu sesi | 300 |
| Sesi aktif bersamaan per instance | 20 |
| Total koneksi socket bersamaan | 2.000 |
| Selisih tampil soal antar peserta (p95) | < 300 ms |
| Latensi konfirmasi jawaban (p95) | < 200 ms |
| Waktu muat halaman join peserta | < 2 detik di 3G |
| Waktu pulih setelah reconnect | < 3 detik |

### 6.2 Keandalan

- Kegagalan koneksi satu peserta **tidak boleh** memengaruhi peserta lain atau host.
- Jika server realtime restart di tengah game, sesi yang sedang berjalan boleh gagal — tetapi **skor yang sudah tercatat harus tetap ada di database**. Data jawaban ditulis ke Postgres segera setelah setiap soal ditutup, bukan hanya di akhir game.
- Host yang koneksinya putus dapat mengambil alih kembali sesi yang sama.

### 6.3 Keamanan

- Peserta anonim tidak boleh bisa mengakses data kuis di luar sesi yang sedang berjalan.
- **Jawaban benar tidak boleh pernah dikirim ke perangkat peserta sebelum soal ditutup.** Ini adalah aturan yang paling mudah dilanggar tanpa sadar dan paling merusak jika bocor.
- Rate limiting pada endpoint join dan submit jawaban.
- PIN harus cukup acak sehingga tidak mudah ditebak secara berurutan; PIN yang sudah selesai tidak boleh langsung didaur ulang.
- Otorisasi: host hanya dapat mengakses kuis dan sesi miliknya sendiri.

### 6.4 Aksesibilitas

- Kontras warna memenuhi WCAG 2.1 AA.
- Tombol jawaban dibedakan **warna dan bentuk sekaligus** (bukan warna saja) agar dapat dipakai peserta buta warna.
- Target sentuh minimal 44×44 px.
- Navigasi keyboard penuh pada antarmuka host.

### 6.5 Privasi

- Nama panggilan peserta bersifat sementara dan tidak terhubung ke identitas apa pun.
- Data sesi dapat dihapus host kapan saja.
- Tidak ada pelacakan pihak ketiga pada halaman peserta.

---

## 7. Di Luar Cakupan MVP

Ditulis eksplisit agar tidak menyelinap masuk saat pengerjaan:

- Mode asinkron / challenge / PR
- Mode tim
- Generate soal dengan AI
- Kuis publik yang dapat dicari & disalin
- Aplikasi mobile native
- Integrasi LMS (Moodle, Google Classroom, Canvas)
- Pembayaran, langganan, dan paket berbayar
- Multi-tenant / organisasi dengan banyak host
- Flashcard, kursus, dan materi belajar mandiri
- Video/audio embed pada soal
- Internasionalisasi penuh (MVP: Bahasa Indonesia + Inggris saja)

---

## 8. Metrik Keberhasilan

### Metrik produk

| Metrik | Target 3 bulan pasca-rilis |
|---|---|
| Host aktif bulanan | 100 |
| Sesi game selesai per bulan | 400 |
| Rata-rata peserta per sesi | ≥ 15 |
| Tingkat penyelesaian sesi (dimulai → selesai) | ≥ 85% |
| Host yang menjalankan sesi kedua dalam 30 hari | ≥ 40% |

### Metrik teknis

| Metrik | Target |
|---|---|
| Uptime layanan realtime | ≥ 99,5% |
| Error rate socket | < 0,5% dari total event |
| Sesi gagal karena masalah teknis | < 2% |
| Peserta yang keluar karena disconnect tak pulih | < 3% |

---

## 9. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Timer tidak adil** — peserta dengan koneksi lambat dirugikan | Tinggi. Merusak kepercayaan pada skor. | Server-authoritative timing + clock offset handshake untuk tampilan. Uji dengan simulasi latensi 50/200/500 ms. |
| **Jawaban benar bocor ke klien** | Kritis. Membatalkan validitas seluruh game. | Payload soal ke peserta tidak pernah memuat `isCorrect`. Tambahkan unit test yang memeriksa bentuk payload. |
| **Server realtime jadi bottleneck** | Tinggi pada sesi besar | Broadcast per-room, bukan per-koneksi. Batasi frekuensi update lobby (debounce). Load test 300 peserta sebelum rilis. |
| **Reconnect gagal, peserta kehilangan skor** | Sedang-tinggi | Token peserta di localStorage + state game dipegang server. Uji skenario: airplane mode 10 detik saat soal berjalan. |
| **PIN bertabrakan** | Rendah tapi memalukan | Unique index pada PIN untuk sesi aktif + retry generate maksimal 10 kali. |
| **Nama panggilan tidak pantas** | Sedang, terutama untuk sekolah | Filter kata terlarang + tombol kick di lobby host. |
| **Scope creep ke fitur AI/async** | Tinggi terhadap jadwal | Bagian 7 dokumen ini bersifat mengikat. Fitur baru masuk backlog, bukan sprint berjalan. |

---

## 10. Asumsi

1. Host memiliki koneksi internet stabil dan layar yang dapat dilihat semua peserta (proyektor/TV) — kecuali saat mode PLAY-9 aktif.
2. Peserta memiliki perangkat dengan browser modern (Chrome/Safari 2 versi terakhir).
3. Deployment awal adalah **self-hosted di VPS dengan Docker Compose**, bukan serverless. Ini konsekuensi langsung dari pilihan Socket.IO self-hosted.
4. Satu instance server realtime cukup untuk beban MVP. Skala horizontal (Redis adapter) disiapkan arsitekturnya tapi tidak diimplementasikan di MVP.

---

## 11. Pertanyaan Terbuka

Perlu diputuskan sebelum atau selama Fase 1:

1. **Penyimpanan gambar** — simpan lokal di volume Docker, atau langsung ke S3/R2? Lokal lebih cepat dimulai, S3 lebih mudah saat scaling.
2. **Batas ukuran kuis** — apakah perlu batas jumlah soal per kuis (misal 100)? Berpengaruh pada memori state game.
3. **Retensi data sesi** — berapa lama hasil sesi disimpan sebelum diarsipkan?
4. **Bahasa default UI** — Indonesia atau Inggris? Berpengaruh pada struktur file i18n sejak awal.

---

*Dokumen ini adalah sumber kebenaran untuk cakupan MVP. Perubahan cakupan harus mengubah dokumen ini lebih dulu.*
