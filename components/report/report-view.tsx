"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Bar,
    BarChart,
    Cell,
    LabelList,
    XAxis,
    YAxis,
} from "recharts";
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import {
    ArrowLeft,
    Award,
    Clock,
    Download,
    Flame,
    Target,
    TrendingUp,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { ShapeIcon } from "@/components/game/shape-icon";
import { shapeOf } from "@/lib/game/shapes";
import type {
    ReportParticipant,
    ReportQuestionStat,
    SessionReport,
} from "@/lib/data/reports";

function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}j ${m}m`;
    if (m > 0) return `${m}m ${s}d`;
    return `${s}d`;
}

export function ReportView({ report }: { report: SessionReport }) {
    const router = useRouter();
    const totalQuestions = report.questions.length;
    const participantCount = report.participants.length;

    const avgScore =
        participantCount > 0
            ? Math.round(
                  report.participants.reduce((s, p) => s + p.finalScore, 0) /
                      participantCount,
              )
            : 0;
    const totalCorrect = report.participants.reduce(
        (s, p) => s + p.correctCount,
        0,
    );
    const overallAccuracy =
        participantCount > 0 && totalQuestions > 0
            ? Math.round((totalCorrect / (participantCount * totalQuestions)) * 100)
            : 0;
    const duration =
        report.startedAt && report.endedAt
            ? formatDuration(report.endedAt.getTime() - report.startedAt.getTime())
            : "—";

    const accuracyData = report.questions
        .filter((q) => q.present > 0)
        .map((q) => ({
            label: `${q.order + 1}`,
            accuracy: Math.round(q.accuracy * 100),
        }));
    const chartConfig: ChartConfig = { accuracy: { label: "Akurasi %" } };

    const hardest =
        report.questions.find((q) => q.id === report.hardestQuestionId) ?? null;

    return (
        <div className="@container/main mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link
                        href="/sessions"
                        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" /> Riwayat Sesi
                    </Link>
                    <h2 className="text-2xl font-semibold tracking-tight">
                        {report.quizTitle}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        PIN {report.pin} · {report.status} ·{" "}
                        {report.startedAt
                            ? report.startedAt.toLocaleString("id-ID")
                            : "belum dimulai"}
                    </p>
                </div>
                <Button asChild>
                    <a
                        href={`/api/reports/${report.sessionId}/export`}
                        download
                    >
                        <Download className="mr-2 size-4" /> Ekspor CSV
                    </a>
                </Button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                    icon={<Users className="size-4" />}
                    label="Peserta"
                    value={String(participantCount)}
                />
                <StatCard
                    icon={<TrendingUp className="size-4" />}
                    label="Rata-rata Skor"
                    value={String(avgScore)}
                />
                <StatCard
                    icon={<Target className="size-4" />}
                    label="Akurasi"
                    value={`${overallAccuracy}%`}
                />
                <StatCard
                    icon={<Clock className="size-4" />}
                    label="Durasi"
                    value={duration}
                />
            </div>

            {/* Hardest question */}
            {hardest && (
                <Card className="border-orange-500/40 bg-orange-500/5">
                    <CardContent className="flex items-start gap-3 p-4">
                        <Flame className="mt-0.5 size-5 shrink-0 text-orange-500" />
                        <div className="text-sm">
                            <p className="font-medium">
                                Soal tersulit (akurasi{" "}
                                {Math.round(hardest.accuracy * 100)}%)
                            </p>
                            <p className="text-muted-foreground">
                                Soal {hardest.order + 1}: {hardest.text}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Participants table */}
            <Card>
                <CardContent className="p-4 md:p-6">
                    <h3 className="mb-3 font-medium">Hasil Peserta</h3>
                    <ParticipantsTable participants={report.participants} totalQuestions={totalQuestions} />
                </CardContent>
            </Card>

            {/* Per-question analysis */}
            <Card>
                <CardContent className="space-y-4 p-4 md:p-6">
                    <h3 className="font-medium">Analisis per Soal</h3>
                    {accuracyData.length > 0 && (
                        <ChartContainer
                            config={chartConfig}
                            className="h-[180px] w-full"
                        >
                            <BarChart
                                data={accuracyData}
                                margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
                            >
                                <XAxis
                                    dataKey="label"
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                />
                                <YAxis domain={[0, 100]} hide />
                                <Bar dataKey="accuracy" radius={6} maxBarSize={48}>
                                    {accuracyData.map((d, i) => (
                                        <Cell
                                            key={i}
                                            fill={
                                                d.accuracy >= 70
                                                    ? "#26890c"
                                                    : d.accuracy >= 40
                                                      ? "#d89e00"
                                                      : "#e21b3c"
                                            }
                                        />
                                    ))}
                                    <LabelList
                                        dataKey="accuracy"
                                        position="top"
                                        className="fill-foreground"
                                        formatter={(v: number) => `${v}%`}
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    )}

                    <Accordion type="single" collapsible className="w-full">
                        {report.questions.map((q) => (
                            <AccordionItem
                                key={q.id}
                                value={q.id}
                                className="border-b"
                            >
                                <AccordionTrigger className="hover:no-underline">
                                    <span className="flex flex-1 items-center gap-2 pr-2 text-left">
                                        <span className="font-medium">
                                            Soal {q.order + 1}
                                        </span>
                                        {q.id === report.hardestQuestionId && (
                                            <Badge
                                                variant="secondary"
                                                className="bg-orange-500/15 text-orange-600 dark:text-orange-400"
                                            >
                                                Tersulit
                                            </Badge>
                                        )}
                                        <span className="ml-auto text-sm text-muted-foreground">
                                            {Math.round(q.accuracy * 100)}% benar
                                        </span>
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <QuestionDetail q={q} />
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button variant="outline" onClick={() => router.push("/sessions")}>
                    Kembali ke Riwayat
                </Button>
            </div>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <Card>
            <CardContent className="flex flex-col gap-1 p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {icon} {label}
                </div>
                <p className="text-2xl font-bold tabular-nums">{value}</p>
            </CardContent>
        </Card>
    );
}

function ParticipantsTable({
    participants,
    totalQuestions,
}: {
    participants: ReportParticipant[];
    totalQuestions: number;
}) {
    const columns = React.useMemo<ColumnDef<ReportParticipant>[]>(
        () => [
            {
                accessorKey: "finalRank",
                header: "#",
                cell: ({ row }) => (
                    <span className="font-bold tabular-nums">
                        {row.original.finalRank ?? "—"}
                    </span>
                ),
            },
            {
                accessorKey: "nickname",
                header: "Nama",
                cell: ({ row }) => {
                    const rank = row.original.finalRank;
                    return (
                        <span className="flex items-center gap-1.5 font-medium">
                            {rank === 1 && (
                                <Award className="size-4 text-yellow-500" />
                            )}
                            {row.original.nickname}
                        </span>
                    );
                },
            },
            {
                accessorKey: "finalScore",
                header: "Skor",
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {row.original.finalScore}
                    </span>
                ),
            },
            {
                id: "correct",
                header: "Benar",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.correctCount} / {totalQuestions}
                    </span>
                ),
            },
        ],
        [totalQuestions],
    );

    const table = useReactTable({
        data: participants,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        initialState: { sorting: [{ id: "finalRank", desc: false }] },
    });

    if (participants.length === 0) {
        return (
            <p className="py-6 text-center text-sm text-muted-foreground">
                Tidak ada peserta tercatat.
            </p>
        );
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                        <TableRow key={hg.id}>
                            {hg.headers.map((header) => (
                                <TableHead key={header.id}>
                                    {flexRender(
                                        header.column.columnDef.header,
                                        header.getContext(),
                                    )}
                                </TableHead>
                            ))}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows.map((row) => (
                        <TableRow key={row.id}>
                            {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext(),
                                    )}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function QuestionDetail({ q }: { q: ReportQuestionStat }) {
    const max = Math.max(1, ...q.distribution.map((d) => d.count));
    return (
        <div className="space-y-3 pb-2">
            <p className="text-sm">{q.text}</p>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                    Benar:{" "}
                    <span className="font-medium text-foreground">
                        {q.correct}/{q.present}
                    </span>{" "}
                    ({Math.round(q.accuracy * 100)}%)
                </span>
                <span>
                    Menjawab:{" "}
                    <span className="font-medium text-foreground">
                        {q.answered}/{q.present}
                    </span>
                </span>
                {q.avgResponseMs !== null && (
                    <span>
                        Rata-rata waktu:{" "}
                        <span className="font-medium text-foreground">
                            {(q.avgResponseMs / 1000).toFixed(1)}d
                        </span>
                    </span>
                )}
            </div>
            <div className="space-y-1.5">
                {q.distribution.map((d, i) => {
                    const shape =
                        d.order !== null ? shapeOf(d.order) : null;
                    const pct = Math.round((d.count / max) * 100);
                    return (
                        <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="flex w-28 shrink-0 items-center gap-1.5">
                                {shape && (
                                    <span
                                        className="flex size-4 items-center justify-center rounded text-white"
                                        style={{ backgroundColor: shape.fill }}
                                    >
                                        <ShapeIcon
                                            name={shape.name}
                                            className="size-2.5"
                                        />
                                    </span>
                                )}
                                <span
                                    className={`truncate ${d.correct ? "font-semibold" : ""}`}
                                >
                                    {d.text}
                                </span>
                            </span>
                            <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                                <div
                                    className="h-full rounded"
                                    style={{
                                        width: `${pct}%`,
                                        backgroundColor:
                                            shape?.fill ?? "var(--muted-foreground)",
                                    }}
                                />
                            </div>
                            <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                                {d.count}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
