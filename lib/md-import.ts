/**
 * Parser soal kuis dari Markdown (fitur impor).
 *
 * Format yang didukung:
 *
 *   ## Soal 1
 *   Teks pertanyaan bisa beberapa baris.
 *
 *   - [x] Opsi benar
 *   - [ ] Opsi salah 1
 *   - [ ] Opsi salah 2
 *
 *   <!-- waktu: 30 | poin: ganda -->
 *
 * Aturan:
 * - Setiap blok soal dimulai dengan heading `## ` (level 2).
 * - Teks soal = semua baris setelah heading sampai opsi pertama.
 * - Opsi = list item `- [x]` (benar) atau `- [ ]` (salah). Bentuk numbered
 *   `1. [x]` / `1. *` juga didukung.
 * - Opsi `Benar`/`Salah` dengan tepat 2 pilihan → tipe true_false.
 * - Metadata opsional di komentar HTML: `waktu` (detik, dari daftar yang
 *   diizinkan), `poin` (standar|ganda|tanpa|0|1000|2000).
 * - Heading `# ` level 1 diabaikan (biasanya judul dokumen).
 */

import { ALLOWED_TIME_LIMITS_SEC, BASE_POINTS } from "../db/schema/quiz";

export interface ImportedOption {
    text: string;
    isCorrect: boolean;
}

export interface ImportedQuestion {
    text: string;
    type: "multiple_choice" | "true_false";
    timeLimitSec: number;
    basePoints: number;
    options: ImportedOption[];
}

export interface ImportResult {
    questions: ImportedQuestion[];
    errors: string[];
    /** Nomor urut blok yang gagal di-parse (1-based). */
    failedBlocks: number[];
}

const TIME_VALUES = ALLOWED_TIME_LIMITS_SEC as readonly number[];

function normalizePoints(raw: string): number | null {
    const v = raw.trim().toLowerCase();
    if (v === "standar" || v === "standard" || v === "1000") return BASE_POINTS.STANDARD;
    if (v === "ganda" || v === "double" || v === "2000") return BASE_POINTS.DOUBLE;
    if (v === "tanpa" || v === "none" || v === "0") return BASE_POINTS.NONE;
    return null;
}

function normalizeTime(raw: string): number | null {
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isNaN(n)) return null;
    return TIME_VALUES.includes(n) ? n : null;
}

/** Memisahkan teks mentah menjadi blok per soal (berdasarkan `## `). `# ` level-1 diabaikan. */
export function splitBlocks(md: string): string[] {
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
        if (/^##\s+/.test(line)) {
            if (current.some((l) => l.trim())) blocks.push(current.join("\n"));
            current = [line];
        } else if (!/^#\s+/.test(line)) {
            // Baris heading level 1 (# Judul) tidak masuk blok mana pun.
            current.push(line);
        }
    }
    if (current.some((l) => l.trim())) blocks.push(current.join("\n"));
    return blocks;
}

/** Mengekstrak opsi dari baris list. Mendukung `- [x]`, `- [ ]`, `1. [x]`, `- *` (benar), dan `- teks` (salah). */
export function extractOptions(lines: string[]): { options: ImportedOption[]; rest: string[] } {
    const options: ImportedOption[] = [];
    const rest: string[] = [];
    for (const line of lines) {
        // 1) Checkbox: - [x] / - [ ] / 1. [x] / 1. [ ]
        const cb = line.match(/^\s*(?:[-*]|\d+[.)])\s*\[([ xX])\]\s*(.+)$/);
        if (cb) {
            options.push({ text: cb[2].trim(), isCorrect: cb[1] === "x" || cb[1] === "X" });
            continue;
        }
        // 2) Asterisk penanda benar: - * teks
        const star = line.match(/^\s*[-*]\s*\*\s*(.+)$/);
        if (star) {
            options.push({ text: star[1].trim(), isCorrect: true });
            continue;
        }
        // 3) List item tanpa marker = opsi salah: - teks
        const plain = line.match(/^\s*[-*]\s+(.+)$/);
        if (plain) {
            options.push({ text: plain[1].trim(), isCorrect: false });
            continue;
        }
        rest.push(line);
    }
    return { options, rest };
}

/** Mengekstrak metadata `<!-- waktu: X | poin: Y -->`. */
export function extractMeta(block: string): { timeLimitSec: number | null; basePoints: number | null } {
    const m = block.match(/<!--\s*([\s\S]*?)\s*-->/);
    if (!m) return { timeLimitSec: null, basePoints: null };
    let timeLimitSec: number | null = null;
    let basePoints: number | null = null;
    for (const part of m[1].split("|")) {
        const [key, ...val] = part.split(":").map((s) => s.trim());
        if (!key || val.length === 0) continue;
        const value = val.join(":").trim();
        if (/^waktu$/i.test(key)) timeLimitSec = normalizeTime(value);
        if (/^poin$/i.test(key)) basePoints = normalizePoints(value);
    }
    return { timeLimitSec, basePoints };
}

/** Parse satu blok soal. Mengembalikan null + alasan jika tidak valid. */
export function parseBlock(block: string): ImportedQuestion | { error: string } {
    const heading = block.match(/^##\s+(.*)$/m);
    if (!heading) return { error: "Tidak ada heading '## ' untuk soal" };

    // Pisahkan baris opsi dari baris teks.
    const lines = block.split("\n");
    const { options, rest } = extractOptions(lines);
    if (options.length === 0) {
        return { error: "Tidak ada opsi jawaban (gunakan '- [x]' / '- [ ]')" };
    }
    if (options.filter((o) => o.isCorrect).length !== 1) {
        return { error: "Harus tepat satu opsi benar (tandai dengan '- [x]')" };
    }

    // Teks soal = sisa baris (minus heading & metadata), dirapikan.
    const textLines = rest
        .filter((l) => !/^##\s+/.test(l) && !/^\s*<!--/.test(l) && !/^\s*-->\s*$/.test(l))
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    const text = textLines.join(" ");
    if (!text) return { error: "Teks soal kosong" };

    const meta = extractMeta(block);
    const timeLimitSec = meta.timeLimitSec ?? 20;
    const basePoints = meta.basePoints ?? BASE_POINTS.STANDARD;

    // Deteksi true/false: 2 opsi dengan teks Benar/Salah (case-insensitive).
    const isTF =
        options.length === 2 &&
        options.every((o) => /^(benar|salah|true|false|betul|bener)$/i.test(o.text));

    return {
        text,
        type: isTF ? "true_false" : "multiple_choice",
        timeLimitSec,
        basePoints,
        options: options.map((o) => ({
            text: o.text,
            isCorrect: o.isCorrect,
        })),
    };
}

/** Parse seluruh dokumen MD menjadi daftar soal + daftar error. */
export function parseMarkdownQuiz(md: string): ImportResult {
    const blocks = splitBlocks(md);
    const questions: ImportedQuestion[] = [];
    const errors: string[] = [];
    const failedBlocks: number[] = [];

    blocks.forEach((block, i) => {
        const parsed = parseBlock(block);
        if ("error" in parsed) {
            errors.push(`Blok ${i + 1}: ${parsed.error}`);
            failedBlocks.push(i + 1);
        } else {
            questions.push(parsed);
        }
    });

    return { questions, errors, failedBlocks };
}
