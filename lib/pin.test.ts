import { describe, it, expect } from "vitest";
import {
    generatePin,
    generateUniquePin,
    PIN_LENGTH,
    MAX_PIN_RETRIES,
} from "./pin";

describe("generatePin", () => {
    it("selalu 6 digit numerik", () => {
        for (let i = 0; i < 200; i++) {
            const pin = generatePin();
            expect(pin).toHaveLength(PIN_LENGTH);
            expect(pin).toMatch(/^\d{6}$/);
        }
    });

    it("distribusi tidak konstan (bukan selalu sama)", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 50; i++) seen.add(generatePin());
        expect(seen.size).toBeGreaterThan(1);
    });
});

describe("generateUniquePin", () => {
    it("mengembalikan PIN yang tidak aktif", async () => {
        const active = new Set(["111111", "222222"]);
        const pin = await generateUniquePin((p) => Promise.resolve(active.has(p)));
        expect(active.has(pin)).toBe(false);
        expect(pin).toMatch(/^\d{6}$/);
    });

    it("melempar setelah MAX_PIN_RETRIES jika semua tabrakan", async () => {
        // semua PIN dianggap aktif → harus melempar
        await expect(
            generateUniquePin(() => Promise.resolve(true)),
        ).rejects.toThrow(RegExp(String(MAX_PIN_RETRIES)));
    });
});
