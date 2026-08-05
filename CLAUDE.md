# Project: Quis (Quizzly) — Live Quiz Platform

Baca `.claude-instruction.md` untuk instruksi implementasi lengkap.
Dokumen sumber: `documentation/PRD.md` (cakupan MVP) dan `documentation/IMPLEMENTATION_PLAN.md` (rencana teknis).

## Aturan Inti

1. Kerjakan fase berurutan (0→5), jangan loncat. Laporkan setiap fase selesai.
2. UI Bahasa Indonesia, brand "Quis".
3. Socket events hanya dari `shared/events.ts`.
4. Payload peserta TIDAK boleh memuat `isCorrect` — selalu lewat `toPlayerPayload()`.
5. Waktu skor = jam server, bukan klien.
6. Scoring PERSIS PRD bagian 5 (clamp, toleransi 500ms, tie-break 4 level).
7. Test dulu (scoring 8 kasus, anti-kebocoran isCorrect), baru implementasi.
8. State game di memori realtime; batch insert jawaban saat soal ditutup.
9. Jangan implementasikan fitur di luar PRD bagian 7 (Di Luar Cakupan MVP).
10. Jangan deploy; Hermes yang deploy ke quis.airlangga.link.

## Verifikasi

- Setiap fase: `npm run build` lolos + test Vitest hijau.
- Commit per fase ke main setelah semua selesai.
