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
    const danger = remaining < timeLimitMs * 0.25;

    return (
        <div className="w-full">
            <div className="mb-1 flex items-center justify-between text-sm tabular-nums text-muted-foreground">
                <span>Sisa waktu</span>
                <span className={danger ? "font-semibold text-destructive" : ""}>
                    {Math.max(0, Math.ceil(remaining / 1000))} detik
                </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
                        danger ? "bg-destructive" : "bg-primary"
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
