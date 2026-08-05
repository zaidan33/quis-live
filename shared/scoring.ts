/**
 * Modul scoring — fungsi murni, tanpa I/O. Implementasi PERSIS PRD bagian 5.
 * Diimpor oleh layanan realtime (perhitungan otoritatif di server).
 *
 * Rumus poin (PRD 5.1), untuk jawaban benar:
 *   elapsed = clamp(responseTimeMs, 0, timeLimitMs)
 *   ratio   = elapsed / timeLimitMs
 *   points  = round(basePoints * (1 - ratio / 2))
 * Salah / tidak menjawab / basePoints 0 → 0 poin.
 */

export interface CalculatePointsParams {
    isCorrect: boolean;
    /** Waktu respons menurut jam server (ms). */
    responseTimeMs: number;
    timeLimitMs: number;
    basePoints: number;
}

export function calculatePoints(params: CalculatePointsParams): number {
    const { isCorrect, responseTimeMs, timeLimitMs, basePoints } = params;
    if (!isCorrect || basePoints === 0) return 0;

    const elapsed = Math.min(Math.max(responseTimeMs, 0), timeLimitMs);
    const ratio = elapsed / timeLimitMs;
    return Math.round(basePoints * (1 - ratio / 2));
}

/**
 * Bonus beruntun (PRD 5.3). Default mati pada MVP, tetapi rumusnya ada.
 * streakCount = jumlah jawaban benar beruntun saat ini.
 */
export function calculateStreakBonus(streakCount: number): number {
    if (streakCount < 2) return 0;
    return Math.min(streakCount - 1, 5) * 100; // maks +500
}

/** Toleransi latensi jawaban setelah waktu habis (PRD 5.5). */
export const ANSWER_LATENCY_TOLERANCE_MS = 500;

/**
 * Apakah jawaban masih diterima? (PRD 5.5)
 * Ditolak & dihitung tidak menjawab bila now > serverStartAt + timeLimitMs + 500ms.
 */
export function isAnswerOnTime(
    receivedAt: number,
    serverStartAt: number,
    timeLimitMs: number,
): boolean {
    return receivedAt <= serverStartAt + timeLimitMs + ANSWER_LATENCY_TOLERANCE_MS;
}

/* --------------------------------------------------- Peringkat & tie-break */
export interface ParticipantScore {
    participantId: string;
    nickname: string;
    totalPoints: number;
    correctCount: number;
    /** Total waktu respons kumulatif (ms) — peserta lebih cepat menang. */
    totalResponseMs: number;
    /** Urutan bergabung lobby (lebih awal menang saat tie). */
    joinedOrder: number;
}

export interface RankedParticipant extends ParticipantScore {
    rank: number;
}

/**
 * Mengurutkan peserta & menetapkan peringkat dengan tie-break 4 level (PRD 5.4):
 *   1. totalPoints ↓
 *   2. correctCount ↓
 *   3. totalResponseMs ↑
 *   4. joinedOrder ↑
 * Peringkat adalah posisi (1-based); tie hanya bila semua 4 sama (jarang).
 */
export function rankParticipants(
    list: ParticipantScore[],
): RankedParticipant[] {
    const sorted = [...list].sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        if (b.correctCount !== a.correctCount)
            return b.correctCount - a.correctCount;
        if (a.totalResponseMs !== b.totalResponseMs)
            return a.totalResponseMs - b.totalResponseMs;
        return a.joinedOrder - b.joinedOrder;
    });
    return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
}
