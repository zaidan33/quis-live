import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Server } from "socket.io";
import { createServer } from "node:http";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { setupRealtime } from "./setup";
import { signGameToken } from "./auth";
import {
    ANSWER_ACK,
    GAME_OVER,
    GAME_STATE,
    HOST_JOIN_SESSION,
    HOST_NEXT_QUESTION,
    HOST_SHOW_LEADERBOARD,
    HOST_SKIP_QUESTION,
    HOST_START_GAME,
    LEADERBOARD_UPDATE,
    PLAYER_ANSWER,
    PLAYER_JOIN,
    QUESTION_COUNTDOWN,
    QUESTION_END,
    QUESTION_START,
} from "../../shared/events";
import type { PlayerQuestionPayload } from "../../shared/types";

// Mock sumber data eksternal agar state machine bisa diuji tanpa Postgres.
// loadSessionQuiz mengembalikan kuis tetap; persistence menjadi no-op.
vi.mock("./quiz-loader", () => ({
    loadSessionQuiz: async () => ({
        settings: {
            streakBonus: false,
            showAnswersOnPlayerDevice: false,
            randomizeQuestions: false,
        },
        questions: [
            {
                id: "q1",
                text: "Ibukota Indonesia?",
                imageUrl: null,
                timeLimitSec: 20,
                basePoints: 1000,
                type: "multiple_choice",
                options: [
                    { id: "q1o0", order: 0, text: "Jakarta", isCorrect: true },
                    { id: "q1o1", order: 1, text: "Bandung", isCorrect: false },
                    { id: "q1o2", order: 2, text: "Surabaya", isCorrect: false },
                    { id: "q1o3", order: 3, text: "Medan", isCorrect: false },
                ],
            },
            {
                id: "q2",
                text: "2 + 2 = 4?",
                imageUrl: null,
                timeLimitSec: 20,
                basePoints: 1000,
                type: "true_false",
                options: [
                    { id: "q2o0", order: 0, text: "Benar", isCorrect: true },
                    { id: "q2o1", order: 1, text: "Salah", isCorrect: false },
                ],
            },
        ],
    }),
}));
vi.mock("./persistence", () => ({
    markSessionStarted: async () => {},
    markSessionFinished: async () => {},
    batchInsertAnswers: async () => {},
    finalizeParticipants: async () => {},
}));

const SECRET = "gameplay-test-secret-min-32-characters-aaaa";
const CORRECT = { q1: "q1o0", q2: "q2o0" };

let io: Server;
let port = 0;
let sessionSeq = 0;

beforeAll(
    () =>
        new Promise<void>((resolve) => {
            const http = createServer();
            io = new Server(http, { path: "/socket.io" });
            setupRealtime(io, SECRET);
            http.listen(0, () => {
                const addr = http.address();
                port = typeof addr === "object" && addr ? addr.port : 0;
                resolve();
            });
        }),
);
afterAll(() => new Promise<void>((r) => io.close(() => r())));

function client(token: string): ClientSocket {
    return ioc(`http://localhost:${port}`, {
        auth: { token },
        transports: ["websocket"],
        forceNew: true,
    });
}
/** Sesi unik per test agar tidak memakai ulang room dari test sebelumnya. */
function newSession(): string {
    sessionSeq += 1;
    return `ses-gameplay-${sessionSeq}`;
}
const hostToken = (s: string) =>
    signGameToken({ role: "host", sessionId: s, userId: "u1" }, SECRET);
const playerToken = (s: string, id: string, nick: string) =>
    signGameToken(
        { role: "player", sessionId: s, participantId: id, nickname: nick },
        SECRET,
    );

function once<T>(s: ClientSocket, ev: string): Promise<T> {
    return new Promise((resolve) => s.once(ev, (p: T) => resolve(p)));
}
function connected(s: ClientSocket): Promise<void> {
    if (s.connected) return Promise.resolve();
    return new Promise((r) => s.once("connect", () => r()));
}

async function setupPair(session: string) {
    const host = client(await hostToken(session));
    const p = client(await playerToken(session, "p1", "Andi"));
    await connected(host);
    await connected(p);
    // Daftar listener SEBELUM emit (menghindari race event terlewat).
    const hostState = once(host, GAME_STATE);
    const playerState = once(p, GAME_STATE);
    host.emit(HOST_JOIN_SESSION);
    p.emit(PLAYER_JOIN);
    await hostState;
    await playerState;
    return { host, p };
}

/**
 * Mulai soal baru, lewati countdown 3-2-1 agar soal langsung tampil.
 * Listener didaftarkan sebelum emit pemicu.
 */
async function startAndSkipToQuestion(
    host: ClientSocket,
    p: ClientSocket,
    trigger: () => void,
) {
    const onCountdown = once(host, QUESTION_COUNTDOWN);
    const hostQ = once<PlayerQuestionPayload>(host, QUESTION_START);
    const playerQ = once<PlayerQuestionPayload>(p, QUESTION_START);
    trigger();
    await onCountdown;
    host.emit(HOST_SKIP_QUESTION);
    return { hostQ, playerQ };
}

describe("loop permainan (Fase 3)", () => {
    it(
        "start → jawab → hasil → leaderboard → selesai; isCorrect tak bocor ke peserta",
        async () => {
            const session = newSession();
            const { host, p } = await setupPair(session);

            // Soal 1
            const { hostQ, playerQ } = await startAndSkipToQuestion(host, p, () =>
                host.emit(HOST_START_GAME),
            );
            const hq1 = await hostQ;
            const pq1 = await playerQ;

            // HOST boleh tahu jawaban benar; PESERTA tidak.
            expect(JSON.stringify(hq1.question.options)).toContain("isCorrect");
            expect(JSON.stringify(pq1)).not.toContain("isCorrect");

            // Peserta menjawab benar → ANSWER_ACK + QUESTION_END.
            // Keduanya dipancarkan berurutan cepat, jadi daftar keduanya sebelum emit.
            const ack = once<{ received: boolean }>(p, ANSWER_ACK);
            const end1 = once<{
                yourResult?: { correct: boolean; pointsAwarded: number; rank: number };
            }>(p, QUESTION_END);
            p.emit(PLAYER_ANSWER, { optionId: CORRECT.q1 });
            expect((await ack).received).toBe(true);
            const r1 = await end1;
            expect(r1.yourResult?.correct).toBe(true);
            expect(r1.yourResult?.pointsAwarded).toBeGreaterThan(0);
            expect(r1.yourResult?.rank).toBe(1); // perbaikan: rank akurat, bukan 0

            // Leaderboard setelah host menampilkannya.
            const lbPromise = once<{ yourRank?: number; yourScore?: number }>(
                p,
                LEADERBOARD_UPDATE,
            );
            host.emit(HOST_SHOW_LEADERBOARD);
            const lb = await lbPromise;
            expect(lb.yourRank).toBe(1);
            expect(lb.yourScore ?? 0).toBeGreaterThan(0);

            // Soal 2
            await startAndSkipToQuestion(host, p, () => host.emit(HOST_NEXT_QUESTION));
            const ack2 = once<{ received: boolean }>(p, ANSWER_ACK);
            const q2end = once(p, QUESTION_END);
            p.emit(PLAYER_ANSWER, { optionId: CORRECT.q2 });
            expect((await ack2).received).toBe(true);
            await q2end;

            const lb2 = once(p, LEADERBOARD_UPDATE);
            host.emit(HOST_SHOW_LEADERBOARD);
            await lb2;

            // Soal habis → game over.
            const over = once<{
                yourSummary?: {
                    rank: number;
                    score: number;
                    correctCount: number;
                    totalQuestions: number;
                };
            }>(p, GAME_OVER);
            host.emit(HOST_NEXT_QUESTION);
            const go = await over;
            expect(go.yourSummary?.rank).toBe(1);
            expect(go.yourSummary?.correctCount).toBe(2);
            expect(go.yourSummary?.totalQuestions).toBe(2);

            host.disconnect();
            p.disconnect();
        },
        15000,
    );

    it(
        "menolak jawaban kedua untuk soal yang sama (terkunci)",
        async () => {
            const session = newSession();
            const { host, p } = await setupPair(session);

            await startAndSkipToQuestion(host, p, () => host.emit(HOST_START_GAME));

            const ack1 = once<{ received: boolean; reason?: string }>(p, ANSWER_ACK);
            p.emit(PLAYER_ANSWER, { optionId: CORRECT.q1 });
            expect((await ack1).received).toBe(true);

            // Jawaban kedua ditolak (soal sama).
            const ack2 = once<{ received: boolean; reason?: string }>(p, ANSWER_ACK);
            p.emit(PLAYER_ANSWER, { optionId: "q1o1" });
            const second = await ack2;
            expect(second.received).toBe(false);

            host.disconnect();
            p.disconnect();
        },
        10000,
    );
});
