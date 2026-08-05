import { describe, it, expect } from "vitest";
import { toHostPayload, toPlayerPayload, type FullQuestion } from "./payload";
import type { GameSessionSettings } from "./types";

const question: FullQuestion = {
    id: "q1",
    text: "Ibukota Indonesia?",
    imageUrl: null,
    timeLimitSec: 20,
    basePoints: 1000,
    type: "multiple_choice",
    options: [
        { id: "o0", order: 0, text: "Jakarta", isCorrect: true },
        { id: "o1", order: 1, text: "Bandung", isCorrect: false },
        { id: "o2", order: 2, text: "Surabaya", isCorrect: false },
        { id: "o3", order: 3, text: "Medan", isCorrect: false },
    ],
};

const settings: GameSessionSettings = {
    streakBonus: false,
    showAnswersOnPlayerDevice: false,
    randomizeQuestions: false,
};

/** Mengumpulkan SEMUA kunci (rekursif) dari sebuah objek. */
function deepKeys(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) {
        value.forEach((v) => deepKeys(v, out));
    } else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out.push(k);
            deepKeys(v, out);
        }
    }
    return out;
}

describe("toPlayerPayload — anti-kebocoran isCorrect", () => {
    it("TIDAK memuat kunci isCorrect di mana pun", () => {
        const payload = toPlayerPayload(question, 0, 5, 1_000_000, settings);
        const keys = deepKeys(payload);
        expect(keys).not.toContain("isCorrect");
        // juga pastikan saat diserialisasi
        expect(JSON.stringify(payload)).not.toContain("isCorrect");
    });

    it("mode layar bersama: sembunyikan teks soal & opsi", () => {
        const payload = toPlayerPayload(question, 0, 5, 1_000_000, settings);
        expect(payload.question.text).toBeUndefined();
        expect(payload.question.options[0].text).toBeUndefined();
        // id & order tetap ada (untuk tombol & jawaban)
        expect(payload.question.options[0].id).toBe("o0");
        expect(payload.question.options[0].order).toBe(0);
    });

    it("mode tanpa layar bersama: sertakan teks soal & opsi", () => {
        const payload = toPlayerPayload(question, 0, 5, 1_000_000, {
            ...settings,
            showAnswersOnPlayerDevice: true,
        });
        expect(payload.question.text).toBe("Ibukota Indonesia?");
        expect(payload.question.options[0].text).toBe("Jakarta");
        // tetap tanpa isCorrect
        expect(JSON.stringify(payload)).not.toContain("isCorrect");
    });

    it("tidak bocor walau semua opsi benar di sumber", () => {
        const allCorrect: FullQuestion = {
            ...question,
            options: question.options.map((o) => ({ ...o, isCorrect: true })),
        };
        const payload = toPlayerPayload(allCorrect, 0, 5, 1_000_000, settings);
        expect(JSON.stringify(payload)).not.toContain("isCorrect");
    });
});

describe("toHostPayload — host boleh tahu jawaban", () => {
    it("memuat isCorrect untuk presenter", () => {
        const payload = toHostPayload(question, 0, 5, 1_000_000);
        expect(payload.question.options[0].isCorrect).toBe(true);
        expect(payload.question.options[1].isCorrect).toBe(false);
        expect(payload.timeLimitMs).toBe(20000);
    });
});
