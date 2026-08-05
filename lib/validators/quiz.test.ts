import { describe, it, expect } from "vitest";
import { saveQuizSchema } from "./quiz";

const validQuestion = {
    type: "multiple_choice" as const,
    text: "A?",
    timeLimitSec: 20,
    basePoints: 1000,
    options: [
        { order: 0, text: "a", isCorrect: true },
        { order: 1, text: "b", isCorrect: false },
    ],
};

describe("saveQuizSchema (draft lunak)", () => {
    it("menerima draft dengan teks soal & opsi kosong", () => {
        const r = saveQuizSchema.safeParse({
            id: crypto.randomUUID(),
            title: "Kuis",
            questions: [
                {
                    type: "multiple_choice",
                    text: "",
                    timeLimitSec: 20,
                    basePoints: 1000,
                    options: [
                        { order: 0, text: "", isCorrect: false },
                        { order: 1, text: "", isCorrect: false },
                    ],
                },
            ],
        });
        expect(r.success).toBe(true);
    });

    it("menolak judul kosong", () => {
        const r = saveQuizSchema.safeParse({
            id: crypto.randomUUID(),
            title: "   ",
            questions: [validQuestion],
        });
        expect(r.success).toBe(false);
    });

    it("menolak batas waktu di luar daftar", () => {
        const r = saveQuizSchema.safeParse({
            id: crypto.randomUUID(),
            title: "Kuis",
            questions: [{ ...validQuestion, timeLimitSec: 7 }],
        });
        expect(r.success).toBe(false);
    });

    it("menolak bobot poin ilegal", () => {
        const r = saveQuizSchema.safeParse({
            id: crypto.randomUUID(),
            title: "Kuis",
            questions: [{ ...validQuestion, basePoints: 500 }],
        });
        expect(r.success).toBe(false);
    });

    it("menerima bobot 0 / 1000 / 2000", () => {
        for (const bp of [0, 1000, 2000]) {
            const r = saveQuizSchema.safeParse({
                id: crypto.randomUUID(),
                title: "Kuis",
                questions: [{ ...validQuestion, basePoints: bp }],
            });
            expect(r.success).toBe(true);
        }
    });
});
