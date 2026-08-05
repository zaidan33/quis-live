"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
    quiz,
    question,
    answerOption,
    BASE_POINTS,
} from "@/db/schema/quiz";
import { requireUser } from "@/lib/session";
import { assessQuizReadiness } from "@/lib/utils/quiz";
import { saveQuizSchema, type SaveQuizInput } from "@/lib/validators/quiz";

/** Bentuk kanonik kuis + soal + opsi yang dikonsumsi klien (editor & laporan). */
export interface QuizOptionTree {
    id: string;
    order: number;
    text: string;
    isCorrect: boolean;
}

export interface QuizQuestionTree {
    id: string;
    order: number;
    type: "multiple_choice" | "true_false";
    text: string;
    imageUrl: string | null;
    timeLimitSec: number;
    basePoints: number;
    options: QuizOptionTree[];
}

export interface QuizTree {
    id: string;
    title: string;
    description: string | null;
    coverImageUrl: string | null;
    updatedAt: Date;
    questions: QuizQuestionTree[];
}

/* ----------------------------------------------------------- reads */
async function loadQuizTree(
    ownerId: string,
    quizId: string,
): Promise<QuizTree | null> {
    const row = await db.query.quiz.findFirst({
        where: and(
            eq(quiz.id, quizId),
            eq(quiz.ownerId, ownerId),
            eq(quiz.isDeleted, false),
        ),
        with: {
            questions: {
                orderBy: [asc(question.order)],
                with: {
                    options: { orderBy: [asc(answerOption.order)] },
                },
            },
        },
    });
    if (!row) return null;
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        coverImageUrl: row.coverImageUrl,
        updatedAt: row.updatedAt,
        questions: row.questions.map((q) => ({
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

export async function getQuizForEditing(
    quizId: string,
): Promise<QuizTree | null> {
    const user = await requireUser();
    return loadQuizTree(user.id, quizId);
}

export interface QuizListItem {
    id: string;
    title: string;
    description: string | null;
    coverImageUrl: string | null;
    updatedAt: Date;
    questionCount: number;
    /** Apakah kuis memenuhi syarat minimal untuk dimulai live (QUIZ-12). */
    ready: boolean;
    /** Alasan belum siap, untuk tooltip/title. */
    readinessIssues: string[];
}

/** Daftar kuis milik host (dashboard), opsional dengan filter pencarian. */
export async function listMyQuizzes(
    search?: string,
): Promise<QuizListItem[]> {
    const user = await requireUser();
    const rows = await db.query.quiz.findMany({
        where: and(eq(quiz.ownerId, user.id), eq(quiz.isDeleted, false)),
        orderBy: [asc(quiz.updatedAt)],
        with: {
            questions: {
                columns: { id: true, text: true, type: true },
                with: { options: { columns: { text: true, isCorrect: true } } },
            },
        },
    });
    const q = search?.trim().toLowerCase();
    const filtered = !q
        ? rows
        : rows.filter(
              (r) =>
                  r.title.toLowerCase().includes(q) ||
                  (r.description ?? "").toLowerCase().includes(q),
          );
    return filtered
        .map((r) => {
            const readiness = assessQuizReadiness(r.questions);
            return {
                id: r.id,
                title: r.title,
                description: r.description,
                coverImageUrl: r.coverImageUrl,
                updatedAt: r.updatedAt,
                questionCount: r.questions.length,
                ready: readiness.ready,
                readinessIssues: readiness.issues,
            };
        })
        .reverse();
}

/* --------------------------------------------------------- create */
/** Membuat kuis baru dengan satu soal awal; mengembalikan id untuk redirect. */
export async function createQuizAction(): Promise<{ id: string }> {
    const user = await requireUser();
    const [created] = await db
        .insert(quiz)
        .values({
            ownerId: user.id,
            title: "Kuis Tanpa Judul",
            description: null,
        })
        .returning({ id: quiz.id });
    const quizId = created!.id;

    const [q] = await db
        .insert(question)
        .values({
            quizId,
            order: 0,
            type: "multiple_choice",
            text: "Soal baru",
            timeLimitSec: 20,
            basePoints: BASE_POINTS.STANDARD,
        })
        .returning({ id: question.id });
    await db.insert(answerOption).values([
        { questionId: q!.id, order: 0, text: "Opsi A", isCorrect: true },
        { questionId: q!.id, order: 1, text: "Opsi B", isCorrect: false },
    ]);

    revalidatePath("/dashboard");
    return { id: quizId };
}

/* ----------------------------------------------------------- save */
type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Menyimpan seluruh pohon kuis (meta + soal + opsi) secara transaksional.
 *
 * - id klien (UUID) dipakai saat insert sehingga id stabil lintas-penyimpanan;
 *   klien tidak perlu memuat ulang pohon setelah simpan.
 * - urutan `order` diperbarui dua fase (basis besar → final) agar tidak
 *   melanggar unique index (quiz_id, order) saat menyusun ulang.
 */
export async function saveQuizAction(input: SaveQuizInput): Promise<SaveResult> {
    const user = await requireUser();
    const parsed = saveQuizSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            error: parsed.error.issues[0]?.message ?? "Input tidak valid",
        };
    }
    const data = parsed.data;

    const owned = await db.query.quiz.findFirst({
        where: and(
            eq(quiz.id, data.id),
            eq(quiz.ownerId, user.id),
            eq(quiz.isDeleted, false),
        ),
        columns: { id: true },
    });
    if (!owned) return { ok: false, error: "Kuis tidak ditemukan" };

    const TEMP_BASE = 1_000_000;
    try {
        await db.transaction(async (tx) => {
            await tx
                .update(quiz)
                .set({
                    title: data.title,
                    description: data.description ?? null,
                    coverImageUrl: data.coverImageUrl ?? null,
                    updatedAt: new Date(),
                })
                .where(eq(quiz.id, data.id));

            const currentQuestions = await tx.query.question.findMany({
                where: eq(question.quizId, data.id),
                columns: { id: true },
                with: { options: { columns: { id: true } } },
            });
            const currentQIds = new Set(currentQuestions.map((q) => q.id));

            // Hapus soal yang tidak ada lagi (cascade menghapus opsinya).
            const removedQ = [...currentQIds].filter(
                (id) => !data.questions.some((q) => q.id === id),
            );
            if (removedQ.length) {
                await tx
                    .delete(question)
                    .where(inArray(question.id, removedQ));
            }

            // Fase A: order sementara (basis besar) + field untuk soal existing.
            for (let i = 0; i < data.questions.length; i++) {
                const q = data.questions[i];
                if (q.id && currentQIds.has(q.id)) {
                    await tx
                        .update(question)
                        .set({
                            order: TEMP_BASE + i,
                            type: q.type,
                            text: q.text,
                            imageUrl: q.imageUrl ?? null,
                            timeLimitSec: q.timeLimitSec,
                            basePoints: q.basePoints,
                        })
                        .where(eq(question.id, q.id));
                }
            }
            // Fase B: order final untuk soal existing.
            for (let i = 0; i < data.questions.length; i++) {
                const q = data.questions[i];
                if (q.id && currentQIds.has(q.id)) {
                    await tx
                        .update(question)
                        .set({ order: i })
                        .where(eq(question.id, q.id));
                }
            }
            // Fase C: insert soal baru (id dari klien).
            for (let i = 0; i < data.questions.length; i++) {
                const q = data.questions[i];
                if (!q.id || !currentQIds.has(q.id)) {
                    await tx.insert(question).values({
                        id: q.id,
                        quizId: data.id,
                        order: i,
                        type: q.type,
                        text: q.text,
                        imageUrl: q.imageUrl ?? null,
                        timeLimitSec: q.timeLimitSec,
                        basePoints: q.basePoints,
                    });
                }
            }

            // Opsi per soal (tidak ada unique constraint pada order → bebas).
            for (const q of data.questions) {
                const curOpts =
                    currentQuestions
                        .find((cq) => cq.id === q.id)
                        ?.options.map((o) => o.id) ?? [];
                const curOptIds = new Set(curOpts);
                const removedOpts = curOpts.filter(
                    (id) => !q.options.some((o) => o.id === id),
                );
                if (removedOpts.length) {
                    await tx
                        .delete(answerOption)
                        .where(inArray(answerOption.id, removedOpts));
                }
                for (let j = 0; j < q.options.length; j++) {
                    const o = q.options[j];
                    if (o.id && curOptIds.has(o.id)) {
                        await tx
                            .update(answerOption)
                            .set({ order: j, text: o.text, isCorrect: o.isCorrect })
                            .where(eq(answerOption.id, o.id));
                    } else {
                        await tx.insert(answerOption).values({
                            id: o.id,
                            questionId: q.id!,
                            order: j,
                            text: o.text,
                            isCorrect: o.isCorrect,
                        });
                    }
                }
            }
        });
    } catch (err) {
        console.error("saveQuizAction error", err);
        return { ok: false, error: "Gagal menyimpan kuis" };
    }

    revalidatePath("/dashboard");
    return { ok: true };
}

/* ------------------------------------------------------- duplicate */
export async function duplicateQuizAction(
    quizId: string,
): Promise<{ id: string } | { error: string }> {
    const user = await requireUser();
    const tree = await loadQuizTree(user.id, quizId);
    if (!tree) return { error: "Kuis tidak ditemukan" };

    const [created] = await db
        .insert(quiz)
        .values({
            ownerId: user.id,
            title: `${tree.title} (Salinan)`,
            description: tree.description,
            coverImageUrl: tree.coverImageUrl,
        })
        .returning({ id: quiz.id });
    const newId = created!.id;

    for (let i = 0; i < tree.questions.length; i++) {
        const q = tree.questions[i];
        const [qRow] = await db
            .insert(question)
            .values({
                quizId: newId,
                order: i,
                type: q.type,
                text: q.text,
                imageUrl: q.imageUrl,
                timeLimitSec: q.timeLimitSec,
                basePoints: q.basePoints,
            })
            .returning({ id: question.id });
        await db.insert(answerOption).values(
            q.options.map((o, j) => ({
                questionId: qRow!.id,
                order: j,
                text: o.text,
                isCorrect: o.isCorrect,
            })),
        );
    }

    revalidatePath("/dashboard");
    return { id: newId };
}

/* --------------------------------------------------------- delete */
/** Soft-delete kuis (QUIZ-9). */
export async function deleteQuizAction(
    quizId: string,
): Promise<{ ok: true } | { error: string }> {
    const user = await requireUser();
    const result = await db
        .update(quiz)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(quiz.id, quizId), eq(quiz.ownerId, user.id)));
    if (result.rowCount === 0) {
        return { error: "Kuis tidak ditemukan" };
    }
    revalidatePath("/dashboard");
    return { ok: true };
}
