import { describe, it, expect } from "vitest";
import {
    validateNickname,
    nicknameIssueMessage,
    NICKNAME_MIN,
    NICKNAME_MAX,
} from "./nickname";

describe("validateNickname (PLAY-2)", () => {
    it("nama valid → tanpa masalah", () => {
        expect(validateNickname("Andi")).toEqual([]);
        expect(validateNickname("Dewi_99")).toEqual([]);
        expect(validateNickname("Siti Aminah")).toEqual([]);
    });

    it("terlalu pendek", () => {
        expect(validateNickname("A")).toContain("too_short");
    });

    it("terlalu panjang", () => {
        expect(validateNickname("x".repeat(NICKNAME_MAX + 1))).toContain(
            "too_long",
        );
    });

    it("karakter ilegal", () => {
        expect(validateNickname("Hacker<>")).toContain("invalid_chars");
        expect(validateNickname("User@123")).toContain("invalid_chars");
    });

    it("kata terlarang ditolak", () => {
        expect(validateNickname("anjing")).toContain("profanity");
        expect(validateNickname("Kata Fuck")).toContain("profanity");
    });

    it("pesan masalah berbahasa Indonesia", () => {
        const msg = nicknameIssueMessage("too_short");
        expect(msg).toMatch(/minimal/i);
    });

    it("batas tepat diperbolehkan", () => {
        expect(validateNickname("a".repeat(NICKNAME_MIN))).toEqual([]);
        expect(validateNickname("a".repeat(NICKNAME_MAX))).toEqual([]);
    });
});
