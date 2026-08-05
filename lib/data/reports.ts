import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
    gameSession,
    participant,
    participantAnswer,
    question,
    answerOption,
} from "@/db/schema/quiz";
import {
    accuracyOf,
    avgResponseMs,
    pickHardestQuestion,
} from "@/lib/report-stats";

/**
 * Lapisan data laporan & riwayat sesi (PRD REPT-1..6). Semua kueri
 * diotorisasi via userId host; sesi milik host lain tidak bisa diakses.
 */

export type SessionStatus = "lobby" | "in_progress" | "finished" | "aborted";

export interface SessionListItem {
    id: string;
    pin: string;
    status: SessionStatus;
    quizTitle: string;
    quizId: string;
    participantCount: number;
    startedAt: Date | null;
    endedAt: Date | null;
}

/** Riwayat semua sesi milik host (REPT-6). */
export async function listHostSessions(
    userId: string,
): Promise<SessionListItem[]> {
    const sessions = await db.query.gameSession.findMany({
        where: eq(gameSession.hostId, userId),
        orderBy: [desc(gameSession.createdAt)],
        with: { quiz: { columns: { id: true, title: true } } },
    });
    if (sessions.length === 0) return [];

    const counts = await db
        .select({
            sid: participant.gameSessionId,
            n: count(),
        })
        .from(participant)
        .where(
            inArray(
                participant.gameSessionId,
                sessions.map((s) => s.id),
            ),
        )
        .groupBy(participant.gameSessionId);
    const countMap = new Map(counts.map((c) => [c.sid, Number(c.n)]));

    return sessions.map((s) => ({
        id: s.id,
        pin: s.pin,
        status: s.status,
        quizTitle: s.quiz.title,
        quizId: s.quizId,
        participantCount: countMap.get(s.id) ?? 0,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
    }));
}

/* ------------------------------------------------------- report detail */
export interface ReportParticipant {
    id: string;
    nickname: string;
    finalScore: number;
    finalRank: number | null;
    correctCount: number;
}

export interface ReportQuestionOption {
    id: string;
    order: number;
    text: string;
    isCorrect: boolean;
}

export interface ReportDistributionEntry {
    optionId: string | null;
    order: number | null;
    text: string;
    correct: boolean;
    count: number;
}

export interface ReportQuestionStat {
    id: string;
    order: number;
    text: string;
    type: "multiple_choice" | "true_false";
    basePoints: number;
    timeLimitSec: number;
    options: ReportQuestionOption[];
    /** Jumlah peserta yang hadir saat soal ditutup ( punya baris jawaban). */
    present: number;
    answered: number;
    correct: number;
    /** 0..1 — correct / present. */
    accuracy: number;
    avgResponseMs: number | null;
    distribution: ReportDistributionEntry[];
}

export interface SessionReport {
    sessionId: string;
    pin: string;
    status: SessionStatus;
    quizId: string;
    quizTitle: string;
    startedAt: Date | null;
    endedAt: Date | null;
    participants: ReportParticipant[];
    questions: ReportQuestionStat[];
    hardestQuestionId: string | null;
}

/**
 * Laporan lengkap satu sesi (REPT-1..4). Mengembalikan null bila sesi bukan
 * milik host. Jawaban difilter per-sesi (lewat join ke participant) supaya
 * kuis yang dimainkan beberapa kali tidak saling mencemari statistik.
 */
export async function getSessionReport(
    sessionId: string,
    userId: string,
): Promise<SessionReport | null> {
    const session = await db.query.gameSession.findFirst({
        where: and(eq(gameSession.id, sessionId), eq(gameSession.hostId, userId)),
        with: { quiz: { columns: { title: true } } },
    });
    if (!session) return null;

    const participants = await db.query.participant.findMany({
        where: eq(participant.gameSessionId, sessionId),
        orderBy: [asc(participant.finalRank), asc(participant.nickname)],
    });

    const questions = await db.query.question.findMany({
        where: eq(question.quizId, session.quizId),
        orderBy: [asc(question.order)],
        with: { options: { orderBy: [asc(answerOption.order)] } },
    });

    const qIds = questions.map((q) => q.id);
    type AnswerRow = { pa: typeof participantAnswer.$inferSelect };
    const answerRows: AnswerRow[] = qIds.length
        ? await db
              .select({ pa: participantAnswer })
              .from(participantAnswer)
              .innerJoin(
                  participant,
                  eq(participantAnswer.participantId, participant.id),
              )
              .where(
                  and(
                      eq(participant.gameSessionId, sessionId),
                      inArray(participantAnswer.questionId, qIds),
                  ),
              )
        : [];

    const byQuestion = new Map<string, AnswerRow[]>();
    for (const row of answerRows) {
        const arr = byQuestion.get(row.pa.questionId) ?? [];
        arr.push(row);
        byQuestion.set(row.pa.questionId, arr);
    }

    const questionStats: ReportQuestionStat[] = questions.map((q) => {
        const rows = byQuestion.get(q.id) ?? [];
        const present = rows.length;
        const answered = rows.filter((r) => r.pa.selectedOptionId !== null).length;
        const correct = rows.filter((r) => r.pa.isCorrect).length;
        const accuracy = accuracyOf(correct, present);
        const avgResponse = avgResponseMs(
            rows
                .map((r) => r.pa.responseTimeMs)
                .filter((v): v is number => v !== null),
        );

        const distribution: ReportDistributionEntry[] = q.options.map((o) => ({
            optionId: o.id,
            order: o.order,
            text: o.text,
            correct: o.isCorrect,
            count: rows.filter((r) => r.pa.selectedOptionId === o.id).length,
        }));
        const noAnswer = rows.filter((r) => r.pa.selectedOptionId === null).length;
        if (noAnswer > 0) {
            distribution.push({
                optionId: null,
                order: null,
                text: "Tidak menjawab",
                correct: false,
                count: noAnswer,
            });
        }

        return {
            id: q.id,
            order: q.order,
            text: q.text,
            type: q.type,
            basePoints: q.basePoints,
            timeLimitSec: q.timeLimitSec,
            options: q.options.map((o) => ({
                id: o.id,
                order: o.order,
                text: o.text,
                isCorrect: o.isCorrect,
            })),
            present,
            answered,
            correct,
            accuracy,
            avgResponseMs: avgResponse,
            distribution,
        };
    });

    // Soal tersulit = akurasi terendah di antara soal yang benar-benar dimainkan.
    const hardestQuestionId = pickHardestQuestion(
        questionStats.map((qs) => ({
            id: qs.id,
            present: qs.present,
            accuracy: qs.accuracy,
        })),
    );

    return {
        sessionId: session.id,
        pin: session.pin,
        status: session.status,
        quizId: session.quizId,
        quizTitle: session.quiz.title,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        participants: participants.map((p) => ({
            id: p.id,
            nickname: p.nickname,
            finalScore: p.finalScore,
            finalRank: p.finalRank,
            correctCount: p.correctCount,
        })),
        questions: questionStats,
        hardestQuestionId,
    };
}
