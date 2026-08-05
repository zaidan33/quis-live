import type { Server, Socket } from "socket.io";
import type {
    GameErrorCode,
    GameState,
    GameSessionSettings,
    LobbyUpdatePayload,
    LeaderboardUpdatePayload,
    PlayerQuestionResult,
    PodiumEntry,
} from "../../shared/types";
import {
    ANSWER_ACK,
    GAME_ERROR,
    GAME_OVER,
    GAME_STATE,
    LEADERBOARD_UPDATE,
    LOBBY_UPDATE,
    LOBBY_UPDATE_DEBOUNCE_MS,
    QUESTION_COUNTDOWN,
    QUESTION_END,
    QUESTION_START,
} from "../../shared/events";
import type { FullQuestion } from "../../shared/payload";
import { toHostPayload, toPlayerPayload } from "../../shared/payload";
import {
    calculatePoints,
    calculateStreakBonus,
    isAnswerOnTime,
    rankParticipants,
    type ParticipantScore,
} from "../../shared/scoring";
import { loadSessionQuiz } from "./quiz-loader";
import {
    batchInsertAnswers,
    finalizeParticipants,
    markSessionFinished,
    markSessionStarted,
    type AnswerRow,
} from "./persistence";
import { logger } from "./logger";

const COUNTDOWN_SECONDS = 3;

interface RoomParticipant {
    id: string;
    nickname: string;
    socketId: string;
    connected: boolean;
    joinedOrder: number;
    score: number;
    correctCount: number;
    totalResponseMs: number;
    streak: number;
}

interface CurrentAnswer {
    optionId: string;
    receivedAt: number;
}

/**
 * State machine satu sesi permainan (IMPLEMENTATION_PLAN 4.5).
 * State otoritatif di memori; DB ditulis pada checkpoint saja.
 */
export class GameRoom {
    state: GameState = "LOBBY";
    readonly createdAt = Date.now();

    private participants = new Map<string, RoomParticipant>();
    private hostSocketId: string | null = null;
    private lobbyTimer: ReturnType<typeof setTimeout> | null = null;

    private settings: GameSessionSettings | null = null;
    private questions: FullQuestion[] = [];
    private order: number[] = [];
    private currentPos = -1;
    private serverStartAt = 0;
    private currentAnswers = new Map<string, CurrentAnswer>();
    private questionTimer: ReturnType<typeof setTimeout> | null = null;
    private countdownTimer: ReturnType<typeof setTimeout> | null = null;
    private joinCounter = 0;

    constructor(
        protected io: Server,
        readonly sessionId: string,
    ) {}

    /* ----------------------------------------------------- host */
    hostJoin(socket: Socket): void {
        this.hostSocketId = socket.id;
        socket.join(this.sessionId);
        this.sendHostState(socket);
        logger.info("host bergabung", {
            sessionId: this.sessionId,
            state: this.state,
        });
    }

    isHost(socketId: string): boolean {
        return this.hostSocketId === socketId;
    }

    /* --------------------------------------------------- player */
    playerJoin(
        socket: Socket,
        participantId: string,
        nickname: string,
    ): void {
        socket.join(this.sessionId);
        const existing = this.participants.get(participantId);

        if (existing) {
            // Reconnect: pertahankan skor, perbarui socket.
            existing.socketId = socket.id;
            existing.connected = true;
            socket.data.participantId = participantId;
            this.sendPlayerState(socket, existing);
            logger.info("peserta reconnect", {
                sessionId: this.sessionId,
                participantId,
            });
            return;
        }

        // Peserta baru hanya boleh di lobby.
        if (this.state !== "LOBBY") {
            socket.emit(GAME_ERROR, {
                code: "session_closed",
                message: "Permainan sudah dimulai.",
            });
            socket.disconnect(true);
            return;
        }

        const p: RoomParticipant = {
            id: participantId,
            nickname,
            socketId: socket.id,
            connected: true,
            joinedOrder: this.joinCounter++,
            score: 0,
            correctCount: 0,
            totalResponseMs: 0,
            streak: 0,
        };
        socket.data.participantId = participantId;
        this.participants.set(participantId, p);
        this.sendPlayerState(socket, p);
        this.scheduleLobbyUpdate();
        logger.info("peserta bergabung lobby", {
            sessionId: this.sessionId,
            participantId,
            count: this.participants.size,
        });
    }

    playerLeave(participantId: string): void {
        const p = this.participants.get(participantId);
        if (!p) return;
        p.connected = false;
        if (this.state === "LOBBY") {
            this.scheduleLobbyUpdate();
        } else if (this.state === "QUESTION_ACTIVE") {
            // Bila semua peserta tersisa sudah menjawab, tutup lebih awal.
            if (this.allConnectedAnswered()) this.closeQuestion();
        }
    }

    kick(participantId: string): Socket | null {
        const p = this.participants.get(participantId);
        if (!p) return null;
        if (this.state === "LOBBY") this.scheduleLobbyUpdate();
        return this.io.sockets.sockets.get(p.socketId) ?? null;
    }

    private connectedPlayers(): RoomParticipant[] {
        return [...this.participants.values()].filter((p) => p.connected);
    }

    private lobbyParticipants() {
        return this.connectedPlayers()
            .sort((a, b) => a.nickname.localeCompare(b.nickname))
            .map((p) => ({ id: p.id, nickname: p.nickname }));
    }

    /* ------------------------------------------- transisi host */
    async startGame(): Promise<void> {
        if (this.state !== "LOBBY") return;
        const loaded = await loadSessionQuiz(this.sessionId);
        if (!loaded || loaded.questions.length === 0) {
            this.emitToHost(GAME_ERROR, {
                code: "internal",
                message: "Kuis tidak memiliki soal.",
            });
            return;
        }
        this.questions = loaded.questions;
        this.settings = loaded.settings;
        this.order = loaded.questions.map((_, i) => i);
        if (this.settings.randomizeQuestions) this.shuffle(this.order);
        await markSessionStarted(this.sessionId);
        logger.info("permainan dimulai", {
            sessionId: this.sessionId,
            questions: this.questions.length,
        });
        this.beginCountdown(0);
    }

    nextQuestion(): void {
        if (this.state !== "LEADERBOARD") return;
        const next = this.currentPos + 1;
        if (next >= this.order.length) {
            this.finish();
            return;
        }
        this.beginCountdown(next);
    }

    skipQuestion(): void {
        if (this.state === "QUESTION_ACTIVE") {
            this.closeQuestion();
        } else if (this.state === "COUNTDOWN") {
            this.clearCountdown();
            this.beginQuestion();
        }
    }

    showLeaderboard(): void {
        if (this.state !== "QUESTION_ENDED") return;
        this.state = "LEADERBOARD";
        this.broadcastLeaderboard();
        // host juga perlu tahu state berubah
        this.emitToHost(GAME_STATE, this.stateSnapshot());
    }

    endGame(): void {
        this.finish();
    }

    /* ------------------------------------------- jawaban peserta */
    playerAnswer(
        socket: Socket,
        participantId: string,
        optionId: string,
    ): void {
        if (this.state !== "QUESTION_ACTIVE") {
            socket.emit(ANSWER_ACK, { received: false, reason: "not_active" });
            return;
        }
        if (this.currentAnswers.has(participantId)) {
            socket.emit(ANSWER_ACK, { received: false, reason: "locked" });
            return;
        }
        const now = Date.now();
        if (!isAnswerOnTime(now, this.serverStartAt, this.currentQuestion().timeLimitSec * 1000)) {
            socket.emit(ANSWER_ACK, { received: false, reason: "late" });
            return;
        }
        this.currentAnswers.set(participantId, { optionId, receivedAt: now });
        socket.emit(ANSWER_ACK, { received: true });

        if (this.allConnectedAnswered()) this.closeQuestion();
    }

    /* ------------------------------------------- internals: countdown */
    private beginCountdown(pos: number): void {
        this.currentPos = pos;
        this.state = "COUNTDOWN";
        this.currentAnswers.clear();
        const total = this.order.length;
        const index = pos;
        let n = COUNTDOWN_SECONDS;
        this.emitToRoom(QUESTION_COUNTDOWN, { index, total, n });
        this.countdownTimer = setInterval(() => {
            n -= 1;
            if (n > 0) {
                this.emitToRoom(QUESTION_COUNTDOWN, { index, total, n });
            } else {
                this.clearCountdown();
                this.beginQuestion();
            }
        }, 1000);
    }

    private clearCountdown(): void {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
    }

    private beginQuestion(): void {
        const q = this.currentQuestion();
        this.state = "QUESTION_ACTIVE";
        this.serverStartAt = Date.now();
        this.currentAnswers.clear();
        const settings = this.settings!;
        const index = this.currentPos;
        const total = this.order.length;

        // Host: payload lengkap (boleh tahu jawaban).
        this.emitToHost(QUESTION_START, toHostPayload(q, index, total, this.serverStartAt));
        // Peserta: payload tanpa isCorrect.
        for (const p of this.connectedPlayers()) {
            this.emitToSocket(p.socketId, QUESTION_START, toPlayerPayload(q, index, total, this.serverStartAt, settings));
        }

        const timeLimitMs = q.timeLimitSec * 1000;
        this.questionTimer = setTimeout(() => {
            if (this.state === "QUESTION_ACTIVE") this.closeQuestion();
        }, timeLimitMs);
    }

    private closeQuestion(): void {
        if (this.state !== "QUESTION_ACTIVE") return;
        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }
        this.state = "QUESTION_ENDED";
        const q = this.currentQuestion();
        const correctOption = q.options.find((o) => o.isCorrect) ?? null;
        const correctOptionId = correctOption?.id ?? null;

        // Distribusi jawaban
        const distribution = q.options.map((o) => ({
            optionId: o.id,
            order: o.order,
            count: 0,
        }));
        const byOption = new Map(distribution.map((d) => [d.optionId, d]));
        for (const a of this.currentAnswers.values()) {
            byOption.get(a.optionId)?.count !== undefined &&
                (byOption.get(a.optionId)!.count += 1);
        }

        // Hitung skor untuk SEMUA peserta dulu (update state), baru susun
        // peringkat sekali — agar rank di umpan balik personal akurat (PLAY-5).
        const answerRows: AnswerRow[] = [];
        const timeLimitMs = q.timeLimitSec * 1000;
        const useStreak = this.settings?.streakBonus ?? false;
        const perPlayer = new Map<
            string,
            { correct: boolean; points: number; streakBonus: number }
        >();

        for (const p of this.participants.values()) {
            const ans = this.currentAnswers.get(p.id);
            const isCorrect = !!ans && ans.optionId === correctOptionId;
            const responseTimeMs = ans ? ans.receivedAt - this.serverStartAt : null;
            let points = calculatePoints({
                isCorrect,
                responseTimeMs: responseTimeMs ?? 0,
                timeLimitMs,
                basePoints: q.basePoints,
            });
            if (isCorrect) p.streak += 1;
            else p.streak = 0;
            const streakBonus = useStreak ? calculateStreakBonus(p.streak) : 0;
            points += streakBonus;

            if (isCorrect) {
                p.correctCount += 1;
                p.score += points;
            }
            p.totalResponseMs += responseTimeMs ?? timeLimitMs;

            answerRows.push({
                participantId: p.id,
                questionId: q.id,
                selectedOptionId: ans?.optionId ?? null,
                isCorrect,
                responseTimeMs,
                pointsAwarded: points,
            });
            perPlayer.set(p.id, { correct: isCorrect, points, streakBonus });
        }

        // Peringkat setelah skor soal ini diakumulasi.
        const ranked = rankParticipants(this.scoresForRanking());
        const rankMap = new Map(ranked.map((r) => [r.participantId, r.rank]));

        // Umpan balik personal ke tiap peserta yang terhubung.
        for (const p of this.connectedPlayers()) {
            const me = perPlayer.get(p.id) ?? {
                correct: false,
                points: 0,
                streakBonus: 0,
            };
            const yourResult: PlayerQuestionResult = {
                correct: me.correct,
                pointsAwarded: me.points,
                streakBonus: me.streakBonus,
                newStreak: p.streak,
                rank: rankMap.get(p.id) ?? 0,
            };
            this.emitToSocket(p.socketId, QUESTION_END, {
                questionId: q.id,
                correctOptionId,
                distribution,
                yourResult,
            });
        }

        // Presenter (host) menerima correctOptionId + distribusi.
        this.emitToHost(QUESTION_END, { questionId: q.id, correctOptionId, distribution });

        // Batch insert jawaban ke Postgres (checkpoint).
        batchInsertAnswers(answerRows).catch((err) =>
            logger.error("gagal menyimpan jawaban", {
                sessionId: this.sessionId,
                error: (err as Error).message,
            }),
        );

        this.emitToHost(GAME_STATE, this.stateSnapshot());
        logger.info("soal ditutup", {
            sessionId: this.sessionId,
            pos: this.currentPos,
            answered: this.currentAnswers.size,
        });
    }

    /* --------------------------------------------- leaderboard */
    private scoresForRanking(): ParticipantScore[] {
        return [...this.participants.values()].map((p) => ({
            participantId: p.id,
            nickname: p.nickname,
            totalPoints: p.score,
            correctCount: p.correctCount,
            totalResponseMs: p.totalResponseMs,
            joinedOrder: p.joinedOrder,
        }));
    }

    private broadcastLeaderboard(): void {
        const ranked = rankParticipants(this.scoresForRanking());
        const top = ranked.slice(0, 5).map((r) => ({
            participantId: r.participantId,
            nickname: r.nickname,
            score: r.totalPoints,
            correctCount: r.correctCount,
        }));
        const base: LeaderboardUpdatePayload = { top };
        // Host (presenter): hanya daftar top — tidak punya peringkat pribadi.
        this.emitToHost(LEADERBOARD_UPDATE, base);

        // Peserta: top + peringkat & skor pribadi. Hanya satu pesan per peserta
        // (bukan broadcast room kosong + pesan pribadi) agar yourRank tak hilang.
        const rankMap = new Map(ranked.map((r) => [r.participantId, r]));
        for (const p of this.connectedPlayers()) {
            const r = rankMap.get(p.id);
            if (r) {
                this.emitToSocket(p.socketId, LEADERBOARD_UPDATE, {
                    ...base,
                    yourRank: r.rank,
                    yourScore: r.totalPoints,
                });
            }
        }
    }

    /* ------------------------------------------------- finish */
    private finish(): void {
        this.clearCountdown();
        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }
        // Jika sedang QUESTION_ACTIVE dan dipaksa selesai, simpan dulu soal itu.
        if (this.state === "QUESTION_ACTIVE") {
            this.closeQuestion();
        }
        this.state = "FINISHED";
        const ranked = rankParticipants(this.scoresForRanking());
        const podium: PodiumEntry[] = ranked.slice(0, 3).map((r) => ({
            rank: r.rank,
            participantId: r.participantId,
            nickname: r.nickname,
            score: r.totalPoints,
            correctCount: r.correctCount,
        }));

        // Host (presenter): podium saja. Peserta: podium + ringkasan pribadi.
        this.emitToHost(GAME_OVER, { podium });
        const rankMap = new Map(ranked.map((r) => [r.participantId, r]));
        for (const p of this.connectedPlayers()) {
            const r = rankMap.get(p.id);
            if (r) {
                this.emitToSocket(p.socketId, GAME_OVER, {
                    podium,
                    yourSummary: {
                        rank: r.rank,
                        score: r.totalPoints,
                        correctCount: r.correctCount,
                        totalQuestions: this.order.length,
                    },
                });
            }
        }

        finalizeParticipants(
            this.sessionId,
            ranked.map((r) => ({
                participantId: r.participantId,
                finalScore: r.totalPoints,
                correctCount: r.correctCount,
                finalRank: r.rank,
            })),
        ).catch((err) =>
            logger.error("gagal finalisasi peserta", {
                sessionId: this.sessionId,
                error: (err as Error).message,
            }),
        );
        markSessionFinished(this.sessionId, this.currentPos).catch((err) =>
            logger.error("gagal menandai sesi selesai", {
                sessionId: this.sessionId,
                error: (err as Error).message,
            }),
        );

        this.emitToHost(GAME_STATE, this.stateSnapshot());
        logger.info("permainan selesai", { sessionId: this.sessionId });
    }

    /* ------------------------------------- snapshot (reconnect) */
    private stateSnapshot() {
        return { state: this.state, index: this.currentPos, total: this.order.length };
    }

    private sendHostState(socket: Socket): void {
        if (this.state === "LOBBY") {
            const lobby: LobbyUpdatePayload = {
                participants: this.lobbyParticipants(),
                count: this.connectedPlayers().length,
            };
            socket.emit(GAME_STATE, { state: this.state, lobby });
        } else {
            socket.emit(GAME_STATE, this.stateSnapshot());
        }
    }

    private sendPlayerState(socket: Socket, p: RoomParticipant): void {
        if (this.state === "LOBBY") {
            socket.emit(GAME_STATE, {
                state: this.state,
                lobby: {
                    participants: this.lobbyParticipants(),
                    count: this.connectedPlayers().length,
                },
            });
            return;
        }
        if (this.state === "COUNTDOWN") {
            socket.emit(GAME_STATE, this.stateSnapshot());
            return;
        }
        if (this.state === "QUESTION_ACTIVE") {
            const q = this.currentQuestion();
            const settings = this.settings!;
            socket.emit(
                QUESTION_START,
                toPlayerPayload(
                    q,
                    this.currentPos,
                    this.order.length,
                    this.serverStartAt,
                    settings,
                ),
            );
            // Sudah menjawab → kunci.
            if (this.currentAnswers.has(p.id)) {
                socket.emit(ANSWER_ACK, { received: true });
            }
            return;
        }
        if (this.state === "QUESTION_ENDED" || this.state === "LEADERBOARD") {
            const ranked = rankParticipants(this.scoresForRanking());
            const me = ranked.find((r) => r.participantId === p.id);
            socket.emit(LEADERBOARD_UPDATE, {
                top: ranked.slice(0, 5).map((r) => ({
                    participantId: r.participantId,
                    nickname: r.nickname,
                    score: r.totalPoints,
                    correctCount: r.correctCount,
                })),
                yourRank: me?.rank,
                yourScore: me?.totalPoints,
            });
            return;
        }
        if (this.state === "FINISHED") {
            const ranked = rankParticipants(this.scoresForRanking());
            const me = ranked.find((r) => r.participantId === p.id);
            socket.emit(GAME_OVER, {
                podium: ranked.slice(0, 3).map((r) => ({
                    rank: r.rank,
                    participantId: r.participantId,
                    nickname: r.nickname,
                    score: r.totalPoints,
                    correctCount: r.correctCount,
                })),
                yourSummary: me
                    ? {
                          rank: me.rank,
                          score: me.totalPoints,
                          correctCount: me.correctCount,
                          totalQuestions: this.order.length,
                      }
                    : undefined,
            });
        }
    }

    /* --------------------------------------------------- helpers */
    private currentQuestion(): FullQuestion {
        return this.questions[this.order[this.currentPos]];
    }

    private allConnectedAnswered(): boolean {
        const players = this.connectedPlayers();
        return players.length > 0 && players.every((p) => this.currentAnswers.has(p.id));
    }

    private scheduleLobbyUpdate(): void {
        if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
        this.lobbyTimer = setTimeout(() => {
            const payload: LobbyUpdatePayload = {
                participants: this.lobbyParticipants(),
                count: this.connectedPlayers().length,
            };
            this.io.to(this.sessionId).emit(LOBBY_UPDATE, payload);
            this.lobbyTimer = null;
        }, LOBBY_UPDATE_DEBOUNCE_MS);
    }

    private emitToHost(event: string, payload: unknown): void {
        if (this.hostSocketId) {
            this.io.sockets.sockets.get(this.hostSocketId)?.emit(event, payload);
        }
    }

    private emitToSocket(socketId: string, event: string, payload: unknown): void {
        this.io.sockets.sockets.get(socketId)?.emit(event, payload);
    }

    private emitToRoom(event: string, payload: unknown): void {
        this.io.to(this.sessionId).emit(event, payload);
    }

    private shuffle(arr: number[]): void {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    dispose(): void {
        this.clearCountdown();
        if (this.questionTimer) clearTimeout(this.questionTimer);
        if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    }
}

/** Helper: kirim game:error ke socket. */
export function sendError(
    socket: Socket,
    code: GameErrorCode,
    message: string,
): void {
    socket.emit(GAME_ERROR, { code, message });
}
