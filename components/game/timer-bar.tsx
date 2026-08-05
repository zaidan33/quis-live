"use client";

import * as React from "react";

/**
 * Bar hitung mundur yang menyusut berdasarkan jam SERVER (serverStartAt +
 * timeLimitMs), bukan jam lokal mentah. Offset dari handshake time:sync
 * dipakai agar tampilan akurat terhadap otoritas server (PRD 5.5, GAME-6).
 *
 * Nilai offset HANYA untuk tampilan — skor tetap dihitung server.
 */
export function TimerBar({
    serverStartAt,
    timeLimitMs,
    offset,
}: {
    serverStartAt: number;
    timeLimitMs: number;
    offset: number;
}) {
    const [remaining, setRemaining] = React.useState(() =>
        clampRemain(serverStartAt + timeLimitMs - (Date.now() + offset), timeLimitMs),
    );

    React.useEffect(() => {
        let raf = 0;
        const tick = () => {
            setRemaining(
                clampRemain(
                    serverStartAt + timeLimitMs - (Date.now() + offset),
                    timeLimitMs,
                ),
            );
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [serverStartAt, timeLimitMs, offset]);

    const pct = timeLimitMs > 0 ? (remaining / timeLimitMs) * 100 : 0;
    const frac = timeLimitMs > 0 ? remaining / timeLimitMs : 0;
    const tone = frac > 0.5 ? "safe" : frac > 0.25 ? "warn" : "danger";

    const barClass =
        tone === "safe"
            ? "bg-primary"
            : tone === "warn"
              ? "bg-amber-500"
              : "bg-destructive";
    const glowClass =
        tone === "safe"
            ? "shadow-[0_0_18px_-2px_var(--primary)]"
            : tone === "warn"
              ? "shadow-[0_0_18px_-2px_oklch(0.76_0.16_70)]"
              : "shadow-[0_0_22px_-2px_var(--destructive)]";

    return (
        <div className="w-full">
            <div className="mb-1.5 flex items-center justify-between text-sm tabular-nums text-muted-foreground">
                <span>Sisa waktu</span>
                <span
                    className={
                        tone === "danger"
                            ? "font-bold text-destructive"
                            : tone === "warn"
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "font-medium text-foreground"
                    }
                >
                    {Math.max(0, Math.ceil(remaining / 1000))} detik
                </span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-black/5 dark:ring-white/10">
                <div
                    className={`h-full rounded-full transition-[width] duration-100 ease-linear ${barClass} ${glowClass} ${
                        tone === "danger" ? "animate-pulse" : ""
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                />
            </div>
        </div>
    );
}

function clampRemain(v: number, limit: number): number {
    return Math.max(0, Math.min(v, limit));
}
