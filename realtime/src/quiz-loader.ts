import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import {
    gameSession,
    question,
    answerOption,
} from "../../db/schema/quiz";
import type { FullQuestion } from "../../shared/payload";
import type { GameSessionSettings } from "../../shared/types";

export interface LoadedSession {
    settings: GameSessionSettings;
    questions: FullQuestion[];
}

/**
 * Memuat pohon kuis untuk sebuah sesi dari Postgres (otritatif, tidak bisa
 * dimanipulasi host). Dipanggil realtime saat permainan dimulai.
 */
export async function loadSessionQuiz(
    sessionId: string,
): Promise<LoadedSession | null> {
    const session = await db.query.gameSession.findFirst({
        where: eq(gameSession.id, sessionId),
        columns: { quizId: true, settings: true },
    });
    if (!session) return null;

    const rows = await db.query.question.findMany({
        where: eq(question.quizId, session.quizId),
        orderBy: [asc(question.order)],
        with: { options: { orderBy: [asc(answerOption.order)] } },
    });

    return {
        settings: session.settings,
        questions: rows.map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            timeLimitSec: q.timeLimitSec,
            basePoints: q.basePoints,
            type: q.type,
            options: q.options.map((o) => ({
                id: o.id,
                order: o.order,
                text: o.text,
                isCorrect: o.isCorrect,
            })),
        })),
    };
}
