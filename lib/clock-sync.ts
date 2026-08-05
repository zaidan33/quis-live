"use client";

import type { Socket } from "socket.io-client";
import { TIME_SYNC, TIME_SYNC_ACK, TIME_SYNC_SAMPLES } from "@shared/events";

/**
 * Handshake jam: kirim TIME_SYNC_SAMPLES sampel, ambil median offset agar
 * hitung mundur klien akurat terhadap jam server. Nilai offset DIPAKAI HANYA
 * untuk tampilan — skor tetap dihitung dari jam server (PRD 5.5).
 *
 * Mengembalikan offset (ms) sehingga `serverTime ≈ Date.now() + offset`.
 */
export async function syncClock(
    socket: Socket,
    samples = TIME_SYNC_SAMPLES,
): Promise<number> {
    const offsets: number[] = [];

    for (let i = 0; i < samples; i++) {
        const offset = await sampleOnce(socket);
        if (offset !== null) offsets.push(offset);
    }

    if (offsets.length === 0) return 0;
    offsets.sort((a, b) => a - b);
    return offsets[Math.floor(offsets.length / 2)]; // median
}

function sampleOnce(socket: Socket): Promise<number | null> {
    return new Promise((resolve) => {
        const clientSentAt = Date.now();
        let done = false;

        const finish = (value: number | null) => {
            if (done) return;
            done = true;
            socket.off(TIME_SYNC_ACK, onAck);
            clearTimeout(timer);
            resolve(value);
        };

        const onAck = (payload: { clientSentAt: number; serverTime: number }) => {
            if (payload.clientSentAt !== clientSentAt) return;
            const rtt = Date.now() - clientSentAt;
            // Estimasi waktu server saat ini ≈ serverTime + rtt/2.
            const offset = payload.serverTime + rtt / 2 - Date.now();
            finish(offset);
        };

        const timer = setTimeout(() => finish(null), 2000);

        socket.on(TIME_SYNC_ACK, onAck);
        socket.emit(TIME_SYNC, { clientSentAt });
    });
}

/** Estimasi waktu server (epoch ms) memakai offset yang disimpan. */
export function serverNow(offset: number): number {
    return Date.now() + offset;
}
