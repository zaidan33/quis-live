/**
 * Pemetaan tombol jawaban ke warna + bentuk (PRD 6.4 aksesibilitas: jawaban
 * dibedakan OLEH WARNA DAN BENTUK sekaligus, bukan warna saja — agar dapat
 * dipakai peserta buta warna). Konvensi Kahoot-like:
 *   order 0 → merah / segitiga
 *   order 1 → biru  / wajik
 *   order 2 → kuning/ lingkaran
 *   order 3 → hijau / kotak
 *
 * Warna dipakai sebagai hex eksplisit (bukan token tema) supaya identik di
 * mode terang/gelap — sengaja, agar identitas bentuk tetap kuat di proyektor.
 */

export type ShapeName = "segitiga" | "wajik" | "lingkaran" | "kotak";

export interface AnswerShape {
    order: number;
    name: ShapeName;
    label: string;
    /** Warna latar tombol / bar (hex). */
    fill: string;
    /** Warna yang sedikit lebih gelap untuk aksen (hover/border). */
    fillStrong: string;
}

export const ANSWER_SHAPES: Record<number, AnswerShape> = {
    0: { order: 0, name: "segitiga", label: "Segitiga", fill: "#e21b3c", fillStrong: "#b8142f" },
    1: { order: 1, name: "wajik", label: "Wajik", fill: "#1368ce", fillStrong: "#0e4f9e" },
    2: { order: 2, name: "lingkaran", label: "Lingkaran", fill: "#d89e00", fillStrong: "#a87a00" },
    3: { order: 3, name: "kotak", label: "Kotak", fill: "#26890c", fillStrong: "#1c6608" },
};

export function shapeOf(order: number): AnswerShape {
    return ANSWER_SHAPES[order] ?? ANSWER_SHAPES[0];
}
