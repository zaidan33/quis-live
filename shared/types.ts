/**
 * Tipe domain game — dipakai aplikasi Next.js DAN layanan realtime.
 *
 * Pure types/constants, TANPA dependensi pada Drizzle atau runtime tertentu,
 * agar mudah dipakai di kedua sisi. Mapping dari baris DB ke tipe ini dilakukan
 * di sisi masing-masing (app: server actions; realtime: persistence/handlers).
 */

export type GameStatus = "lobby" | "in_progress" | "finished" | "aborted";

/** State mesin internal satu game (IMPLEMENTATION_PLAN.md bagian 4.5). */
export type GameState =
    | "LOBBY"
    | "COUNTDOWN"
    | "QUESTION_ACTIVE"
    | "QUESTION_ENDED"
    | "LEADERBOARD"
    | "FINISHED";

export type QuestionType = "multiple_choice" | "true_false";

export type GameTokenRole = "host" | "player";

/** Pengaturan sesi permainan. */
export interface GameSessionSettings {
    streakBonus: boolean;
    showAnswersOnPlayerDevice: boolean;
    randomizeQuestions: boolean;
}

/* ------------------------------------------- Token JWT peserta & host */
/** Kontrak klaim JWT yang ditandatangani app dan diverifikasi realtime. */
export interface HostTokenPayload {
    role: "host";
    sessionId: string;
    userId: string;
}

export interface PlayerTokenPayload {
    role: "player";
    sessionId: string;
    participantId: string;
    /** Nama panggilan peserta (dipakai realtime untuk daftar lobby, bukan rahasia). */
    nickname: string;
}

export type GameTokenPayload = HostTokenPayload | PlayerTokenPayload;

/** TTL default token game (jam). */
export const GAME_TOKEN_TTL_HOURS = 4;

/* ------------------------------------------------------- Opsi jawaban */
/** Opsi jawaban tanpa info kebenaran — aman untuk peserta. */
export interface OptionPublic {
    id: string;
    order: number;
    text?: string; // hanya ada bila showAnswersOnPlayerDevice
}

/** Opsi jawaban lengkap dengan kebenaran — HANYA untuk host. */
export interface OptionWithCorrect extends OptionPublic {
    text: string;
    isCorrect: boolean;
}

/* ------------------------------------------------- Payload question */
interface QuestionBasePayload {
    index: number;
    total: number;
    /** Jam server (epoch ms) saat soal dimulai — otoritatif untuk skor. */
    serverStartAt: number;
    timeLimitMs: number;
}

/** Hitung mundur 3-2-1 sebelum soal tampil (GAME-5). */
export interface QuestionCountdownPayload {
    index: number;
    total: number;
    /** Sisa detik countdown (3 → 2 → 1 → 0 artinya soal segera muncul). */
    n: number;
}

/** Payload question:start ke HOST — boleh tahu jawaban benar. */
export interface HostQuestionPayload extends QuestionBasePayload {
    question: {
        id: string;
        text: string;
        imageUrl: string | null;
        options: OptionWithCorrect[];
    };
}

/**
 * Payload question:start ke PESERTA.
 * ATURAN KETAT: TIDAK boleh memuat `isCorrect`. Dibentuk HANYA lewat
 * toPlayerPayload() (IMPLEMENTATION_PLAN.md bagian 4.4, Fase 3).
 */
export interface PlayerQuestionPayload extends QuestionBasePayload {
    question: {
        id: string;
        text?: string; // hanya bila showAnswersOnPlayerDevice
        imageUrl?: string | null;
        options: OptionPublic[];
    };
}

/* ------------------------------------------------------- Lobby */
export interface LobbyParticipant {
    id: string;
    nickname: string;
}

export interface LobbyUpdatePayload {
    participants: LobbyParticipant[];
    count: number;
}

/* --------------------------------------------------- Hasil soal */
export interface AnswerDistributionEntry {
    optionId: string;
    order: number;
    count: number;
}

export interface PlayerQuestionResult {
    correct: boolean;
    pointsAwarded: number;
    streakBonus: number;
    newStreak: number;
    /** Peringkat sementara peserta setelah soal ini. */
    rank: number;
}

export interface QuestionEndPayload {
    questionId: string;
    correctOptionId: string | null;
    distribution: AnswerDistributionEntry[];
    /** Hanya dikirim ke peserta masing-masing (bukan ke room). */
    yourResult?: PlayerQuestionResult;
}

/* --------------------------------------------------- Leaderboard */
export interface LeaderboardEntry {
    participantId: string;
    nickname: string;
    score: number;
    correctCount: number;
}

export interface LeaderboardUpdatePayload {
    top: LeaderboardEntry[]; // top 5 ke layar bersama
    yourRank?: number; // per peserta
    yourScore?: number;
}

/* --------------------------------------------------- Akhir game */
export interface PodiumEntry {
    rank: number;
    participantId: string;
    nickname: string;
    score: number;
    correctCount: number;
}

export interface PlayerFinalSummary {
    rank: number;
    score: number;
    correctCount: number;
    totalQuestions: number;
}

export interface GameOverPayload {
    podium: PodiumEntry[]; // 3 besar
    yourSummary?: PlayerFinalSummary; // per peserta
}

/* ------------------------------------------------------- Error */
export type GameErrorCode =
    | "not_authorized"
    | "invalid_state"
    | "invalid_payload"
    | "not_found"
    | "nickname_taken"
    | "rate_limited"
    | "session_closed"
    | "internal";

export interface GameErrorPayload {
    code: GameErrorCode;
    message: string;
}

/* ----------------------------------------------- Handshake waktu */
export interface TimeSyncPayload {
    clientSentAt: number;
}

export interface TimeSyncAckPayload {
    clientSentAt: number;
    serverTime: number;
}
