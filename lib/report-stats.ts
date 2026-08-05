/**
 * Perhitungan statistik laporan — murni, tanpa I/O, mudah diuji (PRD REPT-1..4).
 * Dipakai lib/data/reports.ts setelah data mentah diambil dari Postgres.
 */

/** Akurasi = benar / hadir. Denominator adalah peserta yang hadir saat soal
 * ditutup (punya baris jawaban), bukan seluruh peserta akhir — supaya peserta
 * yang gabung terlambat tidak menurunkan akurasi soal yang tak mereka kerjakan. */
export function accuracyOf(correct: number, present: number): number {
    return present > 0 ? correct / present : 0;
}

/** Rata-rata waktu respons (ms) dari daftar waktu peserta yang menjawab. */
export function avgResponseMs(timesMs: number[]): number | null {
    if (timesMs.length === 0) return null;
    return Math.round(timesMs.reduce((a, b) => a + b, 0) / timesMs.length);
}

/** Akurasi keseluruhan sesi: total benar / (peserta × soal). */
export function overallAccuracyPercent(
    totalCorrect: number,
    participantCount: number,
    totalQuestions: number,
): number {
    if (participantCount === 0 || totalQuestions === 0) return 0;
    return Math.round((totalCorrect / (participantCount * totalQuestions)) * 100);
}

export interface HardestCandidate {
    id: string;
    present: number;
    accuracy: number;
}

/**
 * Memilih soal tersulit = akurasi terendah di antara soal yang benar-benar
 * dimainkan (present > 0). Mengembalikan null bila tak ada soal yang dimainkan.
 */
export function pickHardestQuestion(
    stats: HardestCandidate[],
): string | null {
    let hardest: string | null = null;
    let worst = Infinity;
    for (const s of stats) {
        if (s.present > 0 && s.accuracy < worst) {
            worst = s.accuracy;
            hardest = s.id;
        }
    }
    return hardest;
}
