/**
 * Kontrak event socket — dipakai aplikasi Next.js DAN layanan realtime.
 *
 * Aturan proyek: jangan pernah menulis nama event sebagai string literal di
 * luar file ini. Setiap nama event didefinisikan tepat satu kali di sini.
 *
 * Lihat IMPLEMENTATION_PLAN.md bagian 4 untuk tabel kontrak lengkap.
 */

/* ------------------------------------------------------ Host → Server */
export const HOST_JOIN_SESSION = "host:join_session" as const;
export const HOST_START_GAME = "host:start_game" as const;
export const HOST_NEXT_QUESTION = "host:next_question" as const;
export const HOST_SKIP_QUESTION = "host:skip_question" as const;
export const HOST_SHOW_LEADERBOARD = "host:show_leaderboard" as const;
export const HOST_KICK_PARTICIPANT = "host:kick_participant" as const;
export const HOST_END_GAME = "host:end_game" as const;

/* ---------------------------------------------------- Player → Server */
export const PLAYER_JOIN = "player:join" as const;
export const PLAYER_ANSWER = "player:answer" as const;
export const TIME_SYNC = "time:sync" as const;

/* ---------------------------------------------------- Server → Client */
export const GAME_STATE = "game:state" as const;
export const LOBBY_UPDATE = "lobby:update" as const;
export const QUESTION_COUNTDOWN = "question:countdown" as const;
export const QUESTION_START = "question:start" as const;
export const QUESTION_END = "question:end" as const;
export const ANSWER_ACK = "answer:ack" as const;
export const LEADERBOARD_UPDATE = "leaderboard:update" as const;
export const GAME_OVER = "game:over" as const;
export const GAME_ERROR = "game:error" as const;
export const TIME_SYNC_ACK = "time:sync_ack" as const;

/** Daftar semua nama event host→server, untuk validasi middleware. */
export const HOST_EVENTS = [
    HOST_JOIN_SESSION,
    HOST_START_GAME,
    HOST_NEXT_QUESTION,
    HOST_SKIP_QUESTION,
    HOST_SHOW_LEADERBOARD,
    HOST_KICK_PARTICIPANT,
    HOST_END_GAME,
] as const;

/** Daftar semua nama event player→server. */
export const PLAYER_EVENTS = [PLAYER_JOIN, PLAYER_ANSWER, TIME_SYNC] as const;

/** Toleransi latensi jawaban setelah waktu habis (PRD 5.5). */
export const ANSWER_LATENCY_TOLERANCE_MS = 500;

/** Debounce update lobby agar 300 peserta tidak membanjiri render host. */
export const LOBBY_UPDATE_DEBOUNCE_MS = 300;

/** Jumlah sampel handshake time:sync yang dipakai klien untuk median offset. */
export const TIME_SYNC_SAMPLES = 5;
