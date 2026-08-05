import { describe, it, expect } from "vitest";
import {
    parseMarkdownQuiz,
    splitBlocks,
    parseBlock,
    extractOptions,
} from "./md-import";
import { BASE_POINTS } from "../db/schema/quiz";

describe("md-import", () => {
    describe("splitBlocks", () => {
        it("memisahkan per heading ##", () => {
            const md = `# Judul\n\n## Soal 1\nA?\n\n## Soal 2\nB?`;
            expect(splitBlocks(md)).toHaveLength(2);
        });
    });

    describe("extractOptions", () => {
        it("checkbox - [x] dan - [ ]", () => {
            const { options } = extractOptions(["- [x] Benar", "- [ ] Salah"]);
            expect(options).toEqual([
                { text: "Benar", isCorrect: true },
                { text: "Salah", isCorrect: false },
            ]);
        });
        it("numbered 1. [x] dan 2. [ ]", () => {
            const { options } = extractOptions(["1. [x] A", "2. [ ] B"]);
            expect(options).toHaveLength(2);
            expect(options[0].isCorrect).toBe(true);
        });
        it("asterisk * sebagai penanda benar", () => {
            const { options } = extractOptions(["- * Opsi benar", "- Opsi salah"]);
            expect(options).toEqual([
                { text: "Opsi benar", isCorrect: true },
                { text: "Opsi salah", isCorrect: false },
            ]);
        });
    });

    describe("parseBlock", () => {
        it("soal pilihan ganda sederhana", () => {
            const q = parseBlock(
                `## Soal 1\nBerapa hasil 2+2?\n\n- [x] 4\n- [ ] 3\n- [ ] 5`,
            );
            expect("error" in q).toBe(false);
            if ("error" in q) return;
            expect(q.text).toBe("Berapa hasil 2+2?");
            expect(q.type).toBe("multiple_choice");
            expect(q.timeLimitSec).toBe(20);
            expect(q.basePoints).toBe(BASE_POINTS.STANDARD);
            expect(q.options).toHaveLength(3);
            expect(q.options[0]).toEqual({ text: "4", isCorrect: true });
        });

        it("deteksi true_false dari opsi Benar/Salah", () => {
            const q = parseBlock(
                `## Soal 2\nBumi itu bulat?\n\n- [x] Benar\n- [ ] Salah`,
            );
            expect("error" in q).toBe(false);
            if ("error" in q) return;
            expect(q.type).toBe("true_false");
        });

        it("metadata waktu & poin", () => {
            const q = parseBlock(
                `## Soal 3\nPertanyaan?\n\n- [x] A\n- [ ] B\n\n<!-- waktu: 30 | poin: ganda -->`,
            );
            expect("error" in q).toBe(false);
            if ("error" in q) return;
            expect(q.timeLimitSec).toBe(30);
            expect(q.basePoints).toBe(BASE_POINTS.DOUBLE);
        });

        it("teks soal multi-baris digabung", () => {
            const q = parseBlock(
                `## Soal 4\nKalimat pertama\nkalimat kedua lanjutan.\n\n- [x] A\n- [ ] B`,
            );
            expect("error" in q).toBe(false);
            if ("error" in q) return;
            expect(q.text).toBe("Kalimat pertama kalimat kedua lanjutan.");
        });

        it("tidak valid: tanpa opsi", () => {
            const r = parseBlock(`## Soal 5\nPertanyaan tanpa opsi`);
            expect("error" in r).toBe(true);
        });

        it("tidak valid: nol opsi benar", () => {
            const r = parseBlock(`## Soal 6\nPertanyaan?\n\n- [ ] A\n- [ ] B`);
            expect("error" in r).toBe(true);
        });

        it("tidak valid: dua opsi benar", () => {
            const r = parseBlock(`## Soal 7\nPertanyaan?\n\n- [x] A\n- [x] B`);
            expect("error" in r).toBe(true);
        });
    });

    describe("parseMarkdownQuiz", () => {
        it("dokumen lengkap: 3 soal valid", () => {
            const md = `# Kuis Fisika\n\n## Soal 1\nApa satuan gaya?\n\n- [x] Newton\n- [ ] Joule\n- [ ] Watt\n\n<!-- waktu: 30 -->\n\n## Soal 2\nAir mendidih pada 100 derajat?\n\n- [x] Benar\n- [ ] Salah\n\n## Soal 3\nManakah planet terbesar?\n\n1. [ ] Mars\n2. [x] Jupiter\n3. [ ] Venus\n\n<!-- poin: ganda -->`;
            const r = parseMarkdownQuiz(md);
            expect(r.questions).toHaveLength(3);
            expect(r.errors).toHaveLength(0);
            expect(r.failedBlocks).toHaveLength(0);
            expect(r.questions[0].type).toBe("multiple_choice");
            expect(r.questions[1].type).toBe("true_false");
            expect(r.questions[2].basePoints).toBe(BASE_POINTS.DOUBLE);
        });

        it("blok rusak dilaporkan, yang valid tetap masuk", () => {
            const md = `## Soal 1\nValid?\n\n- [x] Ya\n- [ ] Tidak\n\n## Soal 2\nTanpa opsi\n\n## Soal 3\nValid lagi?\n\n- [x] Tentu\n- [ ] Tidak`;
            const r = parseMarkdownQuiz(md);
            expect(r.questions).toHaveLength(2);
            expect(r.errors).toHaveLength(1);
            expect(r.failedBlocks).toEqual([2]);
        });
    });
});
