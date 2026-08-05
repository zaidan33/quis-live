import { describe, it, expect } from "vitest";
import { assessQuizReadiness } from "./quiz";

describe("assessQuizReadiness (QUIZ-12)", () => {
    it("kuis kosong tidak siap", () => {
        const r = assessQuizReadiness([]);
        expect(r.ready).toBe(false);
        expect(r.issues.some((i) => /minimal/i.test(i))).toBe(true);
    });

    it("satu soal MC valid → siap", () => {
        const r = assessQuizReadiness([
            {
                text: "Berapa 1+1?",
                type: "multiple_choice",
                options: [
                    { text: "2", isCorrect: true },
                    { text: "3", isCorrect: false },
                ],
            },
        ]);
        expect(r.ready).toBe(true);
        expect(r.issues).toEqual([]);
    });

    it("soal tanpa jawaban benar tidak siap", () => {
        const r = assessQuizReadiness([
            {
                text: "A?",
                type: "multiple_choice",
                options: [
                    { text: "a", isCorrect: false },
                    { text: "b", isCorrect: false },
                ],
            },
        ]);
        expect(r.ready).toBe(false);
    });

    it("soal dengan dua jawaban benar tidak siap", () => {
        const r = assessQuizReadiness([
            {
                text: "A?",
                type: "multiple_choice",
                options: [
                    { text: "a", isCorrect: true },
                    { text: "b", isCorrect: true },
                ],
            },
        ]);
        expect(r.ready).toBe(false);
    });

    it("soal tanpa teks tidak siap", () => {
        const r = assessQuizReadiness([
            {
                text: "   ",
                type: "multiple_choice",
                options: [
                    { text: "a", isCorrect: true },
                    { text: "b", isCorrect: false },
                ],
            },
        ]);
        expect(r.ready).toBe(false);
    });

    it("satu opsi tidak siap", () => {
        const r = assessQuizReadiness([
            {
                text: "A?",
                type: "multiple_choice",
                options: [{ text: "a", isCorrect: true }],
            },
        ]);
        expect(r.ready).toBe(false);
    });

    it("benar/salah valid → siap", () => {
        const r = assessQuizReadiness([
            {
                text: "Langit biru.",
                type: "true_false",
                options: [
                    { text: "Benar", isCorrect: true },
                    { text: "Salah", isCorrect: false },
                ],
            },
        ]);
        expect(r.ready).toBe(true);
    });
});
