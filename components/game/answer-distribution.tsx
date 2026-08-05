"use client";

import * as React from "react";
import { Bar, BarChart, Cell, LabelList, XAxis } from "recharts";
import { Check } from "lucide-react";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { ShapeIcon } from "@/components/game/shape-icon";
import { shapeOf } from "@/lib/game/shapes";

export interface DistributionEntry {
    order: number;
    text: string;
    count: number;
    correct: boolean;
}

/**
 * Distribusi jawaban untuk layar presenter (GAME-9). Bar chart recharts
 * berisi 4 batang berwarna per bentuk; di bawahnya legenda opsi dengan tanda
 ✓ pada jawaban benar. `total` dipakai untuk persentase.
 */
export function AnswerDistribution({
    entries,
    showCorrect,
}: {
    entries: DistributionEntry[];
    showCorrect: boolean;
}) {
    const total = entries.reduce((s, e) => s + e.count, 0);
    const data = entries.map((e) => ({
        label: shapeOf(e.order).label,
        count: e.count,
        fill: shapeOf(e.order).fill,
    }));
    const config: ChartConfig = { count: { label: "Pemilih" } };

    return (
        <div className="space-y-4">
            <ChartContainer config={config} className="h-[220px] w-full">
                <BarChart data={data} margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
                    <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        className="text-xs"
                    />
                    <Bar dataKey="count" radius={8} maxBarSize={120}>
                        {data.map((d, i) => (
                            <Cell key={i} fill={d.fill} />
                        ))}
                        <LabelList dataKey="count" position="top" className="fill-foreground" />
                    </Bar>
                </BarChart>
            </ChartContainer>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {entries.map((e) => {
                    const s = shapeOf(e.order);
                    const pct = total > 0 ? Math.round((e.count / total) * 100) : 0;
                    return (
                        <div
                            key={e.order}
                            className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                            style={
                                showCorrect && e.correct
                                    ? { borderColor: s.fill, boxShadow: `0 0 0 1px ${s.fill}` }
                                    : undefined
                            }
                        >
                            <span
                                className="flex size-7 shrink-0 items-center justify-center rounded text-white"
                                style={{ backgroundColor: s.fill }}
                            >
                                {showCorrect && e.correct ? (
                                    <Check className="size-4" />
                                ) : (
                                    <ShapeIcon name={s.name} className="size-4" />
                                )}
                            </span>
                            <div className="min-w-0">
                                <p className="break-words font-medium leading-snug">{e.text || s.label}</p>
                                <p className="text-xs text-muted-foreground">
                                    {e.count} ({pct}%)
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
