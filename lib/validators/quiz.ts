import { z } from "zod";
import { ALLOWED_TIME_LIMITS_SEC, BASE_POINTS } from "@/db/schema/quiz";

/**
 * Skema Zod untuk MENYIMPAN draft kuis (autosave). Sengaja lunak: soal/opsi
 * boleh kosong saat sedang disusun. Aturan ketat (jumlah opsi, tepat satu
 * benar, teks wajib) diterapkan terpisah lewat assessQuizReadiness() yang
 * mengatur tombol "Mulai Live" (QUIZ-12).
 */

export const questionTypeSchema = z.enum(["multiple_choice", "true_false"]);

export const basePointsSchema = z.number().refine(
    (n) =>
        n === BASE_POINTS.NONE ||
        n === BASE_POINTS.STANDARD ||
        n === BASE_POINTS.DOUBLE,
    "Bobot poin tidak valid",
);

export const timeLimitSchema = z.number().refine(
    (n) => (ALLOWED_TIME_LIMITS_SEC as readonly number[]).includes(n),
    "Batas waktu tidak valid",
);

export const optionInputSchema = z.object({
    id: z.string().uuid().optional(),
    order: z.number().int().min(0),
    text: z.string().max(200),
    isCorrect: z.boolean(),
});

export const questionInputSchema = z.object({
    id: z.string().uuid().optional(),
    type: questionTypeSchema,
    text: z.string().max(1000),
    imageUrl: z.string().url().nullable().optional(),
    timeLimitSec: timeLimitSchema,
    basePoints: basePointsSchema,
    options: z.array(optionInputSchema),
});

export const saveQuizSchema = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1, "Judul wajib diisi").max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    coverImageUrl: z.string().url().nullable().optional(),
    questions: z.array(questionInputSchema),
});

export type OptionInput = z.infer<typeof optionInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type SaveQuizInput = z.infer<typeof saveQuizSchema>;
