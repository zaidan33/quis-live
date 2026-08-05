import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
    gameSession,
    participant,
    question,
    answerOption,
} from "@/db/schema/quiz";

export interface HostSessionView {
    id: string;
    pin: string;
    status: "lobby" | "in_progress" | "finished" | "aborted";
    quizId: string;
    quizTitle: string;
    currentQuestionIndex: number;
}

/** Sesi milik host untuk tampilan presenter (diotorisasi via userId). */
export async function getGameSessionForHost(
    sessionId: string,
    userId: string,
): Promise<HostSessionView | null> {
    const row = await db.query.gameSession.findFirst({
        where: and(
            eq(gameSession.id, sessionId),
            eq(gameSession.hostId, userId),
        ),
        with: { quiz: { columns: { id: true, title: true } } },
    });
    if (!row) return null;
    return {
        id: row.id,
        pin: row.pin,
        status: row.status,
        quizId: row.quizId,
        quizTitle: row.quiz.title,
        currentQuestionIndex: row.currentQuestionIndex,
    };
}

/** Sesi aktif berdasarkan PIN (lobby atau in_progress). */
export async function getActiveSessionByPin(
    pin: string,
): Promise<{
    id: string;
    status: "lobby" | "in_progress";
    quizId: string;
} | null> {
    const row = await db.query.gameSession.findFirst({
        where: and(
            eq(gameSession.pin, pin),
            inArray(gameSession.status, ["lobby", "in_progress"]),
        ),
        columns: { id: true, status: true, quizId: true },
    });
    if (!row) return null;
    return {
        id: row.id,
        status: row.status as "lobby" | "in_progress",
        quizId: row.quizId,
    };
}

/** Peserta berdasarkan id + sesi (untuk validasi reconnect). */
export async function getParticipantInSession(
    sessionId: string,
    participantId: string,
): Promise<{ id: string; nickname: string } | null> {
    const row = await db.query.participant.findFirst({
        where: and(
            eq(participant.id, participantId),
            eq(participant.gameSessionId, sessionId),
        ),
        columns: { id: true, nickname: true },
    });
    return row ?? null;
}

/**
 * Membuat peserta baru. Mengembalikan {error:"nickname_taken"} bila nama
 * sudah dipakai (dijaga juga oleh unique index participant_session_nickname).
 */
export async function createParticipant(
    sessionId: string,
    nickname: string,
): Promise<{ id: string } | { error: "nickname_taken" }> {
    try {
        const [row] = await db
            .insert(participant)
            .values({ gameSessionId: sessionId, nickname })
            .returning({ id: participant.id });
        return { id: row!.id };
    } catch (err) {
        if (isUniqueViolation(err)) return { error: "nickname_taken" };
        throw err;
    }
}

function isUniqueViolation(err: unknown): boolean {
    const e = err as {
        code?: string;
        message?: string;
        cause?: { code?: string; message?: string };
    };
    // drizzle 0.36+ membungkus error DB di `.cause`; cek keduanya.
    const code = e?.code ?? e?.cause?.code;
    const msg = e?.message ?? e?.cause?.message ?? "";
    return code === "23505" || /unique|duplicate/i.test(msg);
}

/**
 * Memuat pohon kuis (soal + opsi) untuk sesi yang sedang berjalan — dipakai
 * realtime/app untuk membentuk payload soal. Hanya bila sesi masih aktif.
 */
export async function getQuizTreeForSession(
    sessionId: string,
): Promise<{
    quizId: string;
    questions: {
        id: string;
        order: number;
        type: "multiple_choice" | "true_false";
        text: string;
        imageUrl: string | null;
        timeLimitSec: number;
        basePoints: number;
        options: {
            id: string;
            order: number;
            text: string;
            isCorrect: boolean;
        }[];
    }[];
} | null> {
    const session = await db.query.gameSession.findFirst({
        where: eq(gameSession.id, sessionId),
        columns: { quizId: true },
    });
    if (!session) return null;
    const rows = await db.query.question.findMany({
        where: eq(question.quizId, session.quizId),
        orderBy: [asc(question.order)],
        with: { options: { orderBy: [asc(answerOption.order)] } },
    });
    return {
        quizId: session.quizId,
        questions: rows.map((q) => ({
            id: q.id,
            order: q.order,
            type: q.type,
            text: q.text,
            imageUrl: q.imageUrl,
            timeLimitSec: q.timeLimitSec,
            basePoints: q.basePoints,
            options: q.options.map((o) => ({
                id: o.id,
                order: o.order,
                text: o.text,
                isCorrect: o.isCorrect,
            })),
        })),
    };
}
