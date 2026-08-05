import { describe, it, expect } from "vitest";
import {
    accuracyOf,
    avgResponseMs,
    overallAccuracyPercent,
    pickHardestQuestion,
} from "./report-stats";

describe("accuracyOf (REPT-3)", () => {
    it("benar/hadir", () => {
        expect(accuracyOf(3, 4)).toBe(0.75);
        expect(accuracyOf(0, 5)).toBe(0);
        expect(accuracyOf(5, 5)).toBe(1);
    });
    it("present 0 → 0 (bukan NaN)", () => {
        expect(accuracyOf(0, 0)).toBe(0);
    });
});

describe("avgResponseMs", () => {
    it("rata-rata dibulatkan", () => {
        expect(avgResponseMs([1000, 2000, 3007])).toBe(2002);
    });
    it("kosong → null", () => {
        expect(avgResponseMs([])).toBeNull();
    });
});

describe("overallAccuracyPercent", () => {
    it("total benar / (peserta × soal)", () => {
        // 10 peserta × 5 soal = 50, 25 benar → 50%
        expect(overallAccuracyPercent(25, 10, 5)).toBe(50);
    });
    it("tanpa peserta/soal → 0", () => {
        expect(overallAccuracyPercent(0, 0, 5)).toBe(0);
        expect(overallAccuracyPercent(0, 5, 0)).toBe(0);
    });
});

describe("pickHardestQuestion (REPT-4)", () => {
    const c = (id: string, present: number, acc: number) => ({
        id,
        present,
        accuracy: acc,
    });
    it("memilih akurasi terendah", () => {
        expect(
            pickHardestQuestion([c("a", 10, 0.9), c("b", 10, 0.2), c("d", 10, 0.5)]),
        ).toBe("b");
    });
    it("mengabaikan soal yang tidak dimainkan (present 0)", () => {
        // 'x' present 0 jangan dipilih meski akurasi 0.
        expect(
            pickHardestQuestion([c("x", 0, 0), c("y", 8, 0.4)]),
        ).toBe("y");
    });
    it("null bila tak ada soal yang dimainkan", () => {
        expect(pickHardestQuestion([c("x", 0, 0)])).toBeNull();
        expect(pickHardestQuestion([])).toBeNull();
    });
});
