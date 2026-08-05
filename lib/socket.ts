"use client";

import { io, type Socket } from "socket.io-client";

/**
 * Membuat koneksi socket ke layanan realtime dengan JWT di auth.
 * Reconnection aktif agar peserta/host pulih otomatis (PRD PLAY-6).
 */
export function createGameSocket(token: string): Socket {
    const url =
        process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:4000";
    return io(url, {
        path: "/socket.io",
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 3000,
    });
}
