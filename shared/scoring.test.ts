import { describe, it, expect } from "vitest";
import {
    calculatePoints,
    calculateStreakBonus,
    isAnswerOnTime,
    rankParticipants,
    type ParticipantScore,
} from "./scoring";

describe("calculatePoints — 8 kasus PRD 5.1/5.2", () => {
    // 1. Benar, 0 ms, base 1000 → 1000
    it("benar seketika (0 ms) → 1000", () => {
        expect(
            calculatePoints({
                isCorrect: true,
                responseTimeMs: 0,
                timeLimitMs: 20000,
                basePoints: 1000,
            }),
        ).toBe(1000);
    });

    // 2. Benar, waktu penuh, base 1000 → 500
    it("benar tepat waktu habis → 500", () => {
        expect(
            calculatePoints({
                isCorrect: true,
                responseTimeMs: 20000,
                timeLimitMs: 20000,
                basePoints: 1000,
            }),
        ).toBe(500);
    });

    // 3. Benar, setengah waktu, base 1000 → 750
    it("benar setengah waktu → 750", () => {
        expect(
            calculatePoints({
                isCorrect: true,
                responseTimeMs: 10000,
                timeLimitMs: 20000,
                basePoints: 1000,
            }),
        ).toBe(750);
    });

    // 4. Salah, kapan pun → 0
    it("salah → 0", () => {
        expect(
            calculatePoints({
                isCorrect: false,
                responseTimeMs: 5000,
                timeLimitMs: 20000,
                basePoints: 1000,
            }),
        ).toBe(0);
    });

    // 5. basePoints 0 → 0
    it("basePoints 0 (tanpa poin) → 0 walau benar", () => {
        expect(
            calculatePoints({
                isCorrect: true,
                responseTimeMs: 0,
                timeLimitMs: 20000,
                basePoints: 0,
            }),
        ).toBe(0);
    });

    // 6. responseTime > timeLimit → diperlakukan sebagai timeLimit (500)
    it("responseTime melampaui timeLimit → diklem ke timeLimit (500)", () => {
        expect(
            calculatePoints({
                isCorrect: true,
                responseTimeMs: 99999,
                timeLimitMs: 20000,
                basePoints: 1000,
            }),
        ).toBe(500);
    });

    // 7. responseTime negatif → diperlakukan sebagai 0 (1000)
    it("responseTime negatif → diklem ke 0 (1000)", () => {
        expect(
            calculatePoints({
                isCorrect: true,
                responseTimeMs: -300,
                timeLimitMs: 20000,
                basePoints: 1000,
            }),
        ).toBe(1000);
    });

    // 8. Benar, base 2000, setengah waktu → 1500
    it("benar base 2000 setengah waktu → 1500", () => {
        expect(
            calculatePoints({
                isCorrect: true,
                responseTimeMs: 10000,
                timeLimitMs: 20000,
                basePoints: 2000,
            }),
        ).toBe(1500);
    });
});

describe("calculateStreakBonus (PRD 5.3)", () => {
    it("streak < 2 → 0", () => {
        expect(calculateStreakBonus(0)).toBe(0);
        expect(calculateStreakBonus(1)).toBe(0);
    });
    it("streak 2 → 100, streak 6 → 500 (maks)", () => {
        expect(calculateStreakBonus(2)).toBe(100);
        expect(calculateStreakBonus(6)).toBe(500);
        expect(calculateStreakBonus(99)).toBe(500);
    });
});

describe("isAnswerOnTime (PRD 5.5)", () => {
    const start = 1_000_000;
    const limit = 20000;
    it("tepat waktu diterima", () => {
        expect(isAnswerOnTime(start + 5000, start, limit)).toBe(true);
    });
    it("dalam toleransi 500ms diterima", () => {
        expect(isAnswerOnTime(start + limit + 400, start, limit)).toBe(true);
    });
    it("lebih dari toleransi ditolak", () => {
        expect(isAnswerOnTime(start + limit + 501, start, limit)).toBe(false);
    });
});

describe("rankParticipants — tie-break 4 level (PRD 5.4)", () => {
    const base = (o: Partial<ParticipantScore>): ParticipantScore => ({
        participantId: o.participantId ?? "p",
        nickname: o.nickname ?? "n",
        totalPoints: o.totalPoints ?? 0,
        correctCount: o.correctCount ?? 0,
        totalResponseMs: o.totalResponseMs ?? 0,
        joinedOrder: o.joinedOrder ?? 0,
    });

    it("urut poin ↓", () => {
        const r = rankParticipants([
            base({ participantId: "a", totalPoints: 500 }),
            base({ participantId: "b", totalPoints: 1000 }),
        ]);
        expect(r[0].participantId).toBe("b");
        expect(r.map((x) => x.rank)).toEqual([1, 2]);
    });

    it("poin sama → benar ↓", () => {
        const r = rankParticipants([
            base({ participantId: "a", totalPoints: 1000, correctCount: 3 }),
            base({ participantId: "b", totalPoints: 1000, correctCount: 5 }),
        ]);
        expect(r[0].participantId).toBe("b");
    });

    it("poin & benar sama → totalResponseMs ↑", () => {
        const r = rankParticipants([
            base({
                participantId: "a",
                totalPoints: 1000,
                correctCount: 5,
                totalResponseMs: 9000,
            }),
            base({
                participantId: "b",
                totalPoints: 1000,
                correctCount: 5,
                totalResponseMs: 4000,
            }),
        ]);
        expect(r[0].participantId).toBe("b");
    });

    it("semua sama → joinedOrder ↑ (lebih awal menang)", () => {
        const r = rankParticipants([
            base({
                participantId: "a",
                totalPoints: 1000,
                correctCount: 5,
                totalResponseMs: 4000,
                joinedOrder: 5,
            }),
            base({
                participantId: "b",
                totalPoints: 1000,
                correctCount: 5,
                totalResponseMs: 4000,
                joinedOrder: 2,
            }),
        ]);
        expect(r[0].participantId).toBe("b");
    });
});
