/**
 * Load test Quis — mensimulasikan banyak peserta concurrent dalam satu sesi
 * untuk mengukur metrik PRD 6.1 (p95 latensi ack < 200 ms, p95 selisih tampil
 * soal < 300 ms). Pakai socket.io-client (dependensi app), bukan k6/artillery,
 * agar handshake JWT + alur jawaban realistis. Skrip ini TIDAK menjalankan
 * game — host (manusia) membuat sesi, membagikan PIN, lalu menjalankan skrip
 * ini sebelum klik "Mulai Permainan".
 *
 * Jalankan:
 *   APP_URL=https://quis.airlangga.link \
 *   REALTIME_URL=https://quis.airlangga.link \
 *   PIN=123456 PLAYER_COUNT=300 \
 *   node loadtest/loadtest.mjs
 */
import { io } from "socket.io-client";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const REALTIME_URL = process.env.REALTIME_URL ?? "http://localhost:4000";
const PIN = process.env.PIN ?? "000000";
const PLAYER_COUNT = Number(process.env.PLAYER_COUNT ?? 50);
const PREFIX = process.env.NICKNAME_PREFIX ?? "lt";

const PLAYER_JOIN = "player:join";
const PLAYER_ANSWER = "player:answer";
const TIME_SYNC = "time:sync";
const GAME_STATE = "game:state";
const QUESTION_START = "question:start";
const ANSWER_ACK = "answer:ack";
const GAME_OVER = "game:over";

const latencies = []; // ack latency (ms)
const connectTimes = []; // waktu sambung (ms)
let answered = 0;

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[idx];
}

async function fetchToken(nickname) {
    const res = await fetch(`${APP_URL}/api/game/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: PIN, nickname }),
    });
    if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
    return (await res.json()).token;
}

function spawnPlayer(i) {
    return new Promise(async (resolve) => {
        const nickname = `${PREFIX}${i}`.slice(0, 18);
        let token;
        try {
            token = await fetchToken(nickname);
        } catch (e) {
            console.error(`[${nickname}] token gagal: ${e.message}`);
            return resolve();
        }
        const t0 = Date.now();
        const socket = io(REALTIME_URL, {
            path: "/socket.io",
            auth: { token },
            transports: ["websocket"],
            reconnection: false,
        });
        socket.on("connect", () => {
            connectTimes.push(Date.now() - t0);
            socket.emit(PLAYER_JOIN);
            socket.emit(TIME_SYNC, { clientSentAt: Date.now() });
        });
        socket.on(QUESTION_START, (q) => {
            const firstOption = q?.question?.options?.[0]?.id;
            if (!firstOption) return;
            const sentAt = Date.now();
            socket.once(ANSWER_ACK, () => {
                latencies.push(Date.now() - sentAt);
                answered += 1;
            });
            socket.emit(PLAYER_ANSWER, { optionId: firstOption });
        });
        socket.on(GAME_STATE, () => {});
        socket.on(GAME_OVER, () => {
            socket.disconnect();
            resolve();
        });
        socket.on("connect_error", (e) => {
            console.error(`[${nickname}] connect_error: ${e.message}`);
            resolve();
        });
    });
}

async function main() {
    console.log(
        `Load test: ${PLAYER_COUNT} peserta → PIN ${PIN} (${REALTIME_URL})`,
    );
    const t0 = Date.now();
    // Bergabung berombak untuk tidak menabraki rate limit join sekaligus.
    const batchSize = 25;
    for (let i = 0; i < PLAYER_COUNT; i += batchSize) {
        const batch = [];
        for (let j = i; j < Math.min(i + batchSize, PLAYER_COUNT); j++) {
            batch.push(spawnPlayer(j));
        }
        await Promise.all(batch);
    }
    const joined = connectTimes.length;
    console.log(
        `Terhubung ${joined}/${PLAYER_COUNT} peserta dalam ${Date.now() - t0} ms. ` +
            `Mulai game dari sisi host sekarang. Menunggu game:over… (Ctrl-C untuk hentikan)`,
    );

    // Tunggu sampai game selesai atau timeout.
    await new Promise((r) => setTimeout(r, 1000 * 60 * 30)).catch(() => {});

    report();
    process.exit(0);
}

function report() {
    console.log("\n=== Ringkasan load test ===");
    console.log(`Peserta terhubung : ${connectTimes.length}/${PLAYER_COUNT}`);
    console.log(`Jawaban terkirim : ${answered}`);
    if (connectTimes.length) {
        const c = [...connectTimes].sort((a, b) => a - b);
        console.log(
            `Waktu sambung    : p50=${percentile(c, 50)} ms  p95=${percentile(c, 95)} ms`,
        );
    }
    if (latencies.length) {
        const l = [...latencies].sort((a, b) => a - b);
        console.log(
            `Latensi ack      : p50=${percentile(l, 50)} ms  p95=${percentile(l, 95)} ms ` +
                `(target PRD 6.1 p95 < 200 ms)`,
        );
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
