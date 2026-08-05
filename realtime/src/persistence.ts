import { eq } from "drizzle-orm";
import { db } from "./db";
import {
    gameSession,
    participant,
    participantAnswer,
} from "../../db/schema/quiz";
import { logger } from "./logger";

/**
 * Penulisan hasil ke Postgres — HANYA pada checkpoint (PRD 6.2, plan 2.3):
 * mulai/selesai sesi, batch insert jawaban saat soal ditutup, finalize peserta.
 * Bukan per jawaban.
 */

export async function markSessionStarted(sessionId: string): Promise<void> {
    await db
        .update(gameSession)
        .set({ status: "in_progress", startedAt: new Date() })
        .where(eq(gameSession.id, sessionId));
}

export async function markSessionFinished(
    sessionId: string,
    currentQuestionIndex: number,
): Promise<void> {
    await db
        .update(gameSession)
        .set({
            status: "finished",
            endedAt: new Date(),
            currentQuestionIndex,
        })
        .where(eq(gameSession.id, sessionId));
}

export interface AnswerRow {
    participantId: string;
    questionId: string;
    selectedOptionId: string | null;
    isCorrect: boolean;
    responseTimeMs: number | null;
    pointsAwarded: number;
}

/** Batch insert semua jawaban untuk satu soal saat soal ditutup. */
export async function batchInsertAnswers(rows: AnswerRow[]): Promise<void> {
    if (!rows.length) return;
    try {
        await db.insert(participantAnswer).values(rows);
    } catch (err) {
        // Abaikan konflik (mis. reconnect menutup ulang) — idempotensi aman.
        logger.warn("batchInsertAnswers error (diabaikan)", {
            error: (err as Error).message,
        });
    }
}

export interface ParticipantFinal {
    participantId: string;
    finalScore: number;
    correctCount: number;
    finalRank: number;
}

export async function finalizeParticipants(
    sessionId: string,
    ranked: ParticipantFinal[],
): Promise<void> {
    for (const r of ranked) {
        await db
            .update(participant)
            .set({
                finalScore: r.finalScore,
                correctCount: r.correctCount,
                finalRank: r.finalRank,
            })
            .where(eq(participant.id, r.participantId));
    }
    logger.info("peserta difinalisasi", {
        sessionId,
        count: ranked.length,
    });
}
