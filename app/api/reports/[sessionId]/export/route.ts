import { NextResponse } from "next/server";
import { getSessionReport } from "@/lib/data/reports";
import { requireUser } from "@/lib/session";

/**
 * Ekspor hasil sesi ke CSV (REPT-5). Satu baris per peserta dengan peringkat,
 * skor, jumlah benar, dan rasio akurasi. Mengembalikan 404 bila sesi bukan
 * milik host.
 */
function csvCell(value: string | number): string {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    const user = await requireUser();
    const { sessionId } = await params;
    const report = await getSessionReport(sessionId, user.id);
    if (!report) {
        return NextResponse.json(
            { error: "Sesi tidak ditemukan" },
            { status: 404 },
        );
    }

    const totalQuestions = report.questions.length;
    const header = [
        "Peringkat",
        "Nama Panggilan",
        "Skor",
        "Benar",
        `Dari ${totalQuestions} Soal`,
        "Akurasi (%)",
    ];
    const lines = [header.map(csvCell).join(",")];

    const ranked = [...report.participants].sort(
        (a, b) => (a.finalRank ?? 9999) - (b.finalRank ?? 9999),
    );
    for (const p of ranked) {
        const rank = p.finalRank ?? "";
        const accuracy =
            totalQuestions > 0
                ? Math.round((p.correctCount / totalQuestions) * 100)
                : 0;
        lines.push(
            [
                rank,
                p.nickname,
                p.finalScore,
                p.correctCount,
                totalQuestions,
                accuracy,
            ]
                .map(csvCell)
                .join(","),
        );
    }

    const csv = "﻿" + lines.join("\n"); // BOM agar Excel baca UTF-8
    const safeTitle = report.quizTitle.replace(/[^\w\-]+/g, "_").slice(0, 40);
    return new NextResponse(csv, {
        status: 200,
        headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="quis_${safeTitle}_${report.pin}.csv"`,
        },
    });
}
