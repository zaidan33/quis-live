/**
 * Pembentuk payload soal. toPlayerPayload() adalah SATU-SATUNYA jalan membentuk
 * payload soal peserta dan TIDAK boleh memuat `isCorrect` (PRD 6.3, plan 4.4).
 * Kebocoran jawaban benar ke perangkat peserta adalah bug paling merusak.
 */
import type {
    GameSessionSettings,
    HostQuestionPayload,
    PlayerQuestionPayload,
    QuestionType,
} from "./types";

export interface FullQuestionOption {
    id: string;
    order: number;
    text: string;
    isCorrect: boolean;
}

export interface FullQuestion {
    id: string;
    text: string;
    imageUrl: string | null;
    timeLimitSec: number;
    basePoints: number;
    type: QuestionType;
    options: FullQuestionOption[];
}

/** Payload soal ke HOST (presenter) — boleh tahu jawaban benar. */
export function toHostPayload(
    q: FullQuestion,
    index: number,
    total: number,
    serverStartAt: number,
): HostQuestionPayload {
    return {
        index,
        total,
        serverStartAt,
        timeLimitMs: q.timeLimitSec * 1000,
        question: {
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            options: q.options.map((o) => ({
                id: o.id,
                order: o.order,
                text: o.text,
                isCorrect: o.isCorrect,
            })),
        },
    };
}

/**
 * Payload soal ke PESERTA. TIDAK ada isCorrect. Teks soal & opsi hanya disertakan
 * bila showAnswersOnPlayerDevice (mode tanpa layar bersama). `order` & `id` opsi
 * selalu dikirim (untuk pemetaan warna/bentuk tombol + pengiriman jawaban).
 */
export function toPlayerPayload(
    q: FullQuestion,
    index: number,
    total: number,
    serverStartAt: number,
    settings: GameSessionSettings,
): PlayerQuestionPayload {
    const showText = settings.showAnswersOnPlayerDevice;
    return {
        index,
        total,
        serverStartAt,
        timeLimitMs: q.timeLimitSec * 1000,
        question: {
            id: q.id,
            text: showText ? q.text : undefined,
            imageUrl: showText ? q.imageUrl : undefined,
            options: q.options.map((o) => ({
                id: o.id,
                order: o.order,
                text: showText ? o.text : undefined,
            })),
        },
    };
}
