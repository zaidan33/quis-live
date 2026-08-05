/**
 * Validasi nama panggilan peserta (PRD PLAY-2): 2–20 karakter, hanya huruf/
 * angka/spasi/titik/garis bawah, unik per sesi (dijamin DB), dan bebas kata
 * terlarang. Daftar kata kasar minimal — host tetap punya tombol kick.
 */
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

// Daftar terlarut singkat (normalisasi lowercase, tanpa spasi). Tidak lengkap —
// kombinasikan dengan kick manual host untuk MVP.
const BANNED_WORDS = [
    "anjing",
    "bangsat",
    "kontol",
    "memek",
    "ngentot",
    "babi",
    "goblok",
    "goblog",
    "bego",
    "idiot",
    "stupid",
    "asshole",
    "bitch",
    "fuck",
    "shit",
    "dick",
    "pussy",
    "ass",
];

const NORMALIZE_RE = /[\s_.-]+/g;

function normalize(s: string): string {
    return s.toLowerCase().replace(NORMALIZE_RE, "");
}

export type NicknameIssue =
    | "too_short"
    | "too_long"
    | "invalid_chars"
    | "profanity";

/** Memeriksa nama panggilan; mengembalikan daftar masalah (kosong = valid). */
export function validateNickname(raw: string): NicknameIssue[] {
    const issues: NicknameIssue[] = [];
    const name = raw.trim();
    if (name.length < NICKNAME_MIN) issues.push("too_short");
    if (name.length > NICKNAME_MAX) issues.push("too_long");
    if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) issues.push("invalid_chars");
    const norm = normalize(name);
    if (BANNED_WORDS.some((w) => norm.includes(normalize(w)))) {
        issues.push("profanity");
    }
    return issues;
}

/** Pesan berbahasa Indonesia untuk masalah nama panggilan. */
export function nicknameIssueMessage(issue: NicknameIssue): string {
    switch (issue) {
        case "too_short":
            return `Nama panggilan minimal ${NICKNAME_MIN} karakter.`;
        case "too_long":
            return `Nama panggilan maksimal ${NICKNAME_MAX} karakter.`;
        case "invalid_chars":
            return "Nama hanya boleh berisi huruf, angka, spasi, titik, garis bawah, dan strip.";
        case "profanity":
            return "Nama panggilan berisi kata yang tidak diizinkan.";
    }
}
