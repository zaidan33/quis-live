import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Bentuk soal minimal untuk penilaian kesiapan kuis (QUIZ-12). */
export interface ReadinessQuestion {
    text: string;
    type: "multiple_choice" | "true_false";
    options: { text: string; isCorrect: boolean }[];
}

export interface QuizReadiness {
    ready: boolean;
    /** Daftar masalah berbahasa Indonesia untuk ditampilkan ke host. */
    issues: string[];
}

/**
 * Menilai apakah sebuah kuis siap dijalankan (PRD QUIZ-12):
 * - minimal 1 soal,
 * - setiap soal punya teks,
 * - setiap soal punya 2–4 opsi (2 untuk benar/salah) dan tepat satu benar,
 * - setiap opsi punya teks.
 */
export function assessQuizReadiness(
    questions: ReadinessQuestion[],
): QuizReadiness {
    const issues: string[] = [];

    if (questions.length === 0) {
        issues.push("Minimal harus ada 1 soal.");
    }

    questions.forEach((q, i) => {
        const label = `Soal ${i + 1}`;
        const minOptions = 2;
        const maxOptions = q.type === "true_false" ? 2 : 4;

        if (!q.text.trim()) {
            issues.push(`${label}: teks soal masih kosong.`);
        }
        if (q.options.length < minOptions) {
            issues.push(`${label}: minimal 2 opsi jawaban.`);
        }
        if (q.options.length > maxOptions) {
            issues.push(`${label}: maksimal ${maxOptions} opsi jawaban.`);
        }
        if (q.options.some((o) => !o.text.trim())) {
            issues.push(`${label}: ada opsi dengan teks kosong.`);
        }
        const correct = q.options.filter((o) => o.isCorrect).length;
        if (correct !== 1) {
            issues.push(
                `${label}: harus ada tepat satu jawaban benar (saat ini ${correct}).`,
            );
        }
    });

    return { ready: issues.length === 0, issues };
}
