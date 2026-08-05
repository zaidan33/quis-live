import type { Socket } from "socket.io";
import { GameManager } from "./game-manager";
import { sendError } from "./game-room";
import { verifyGameToken } from "./auth";
import { logger } from "./logger";
import {
    HOST_END_GAME,
    HOST_JOIN_SESSION,
    HOST_KICK_PARTICIPANT,
    HOST_NEXT_QUESTION,
    HOST_SHOW_LEADERBOARD,
    HOST_SKIP_QUESTION,
    HOST_START_GAME,
    PLAYER_ANSWER,
    PLAYER_JOIN,
    TIME_SYNC,
    TIME_SYNC_ACK,
} from "../../shared/events";
import type { GameTokenPayload } from "../../shared/types";

/**
 * Memasang middleware autentikasi JWT + handler koneksi ke sebuah Server
 * Socket.IO. Dipisah dari bootstrap (index.ts) agar bisa diuji dengan server
 * in-memory. Mengembalikan GameManager yang menyimpan state seluruh room.
 */
export function setupRealtime(io: import("socket.io").Server, secret: string): GameManager {
    const gameManager = new GameManager(io);

    io.use(async (socket, next) => {
        const token =
            (socket.handshake.auth as { token?: string }).token ??
            (socket.handshake.headers.authorization as string | undefined)?.replace(
                "Bearer ",
                "",
            );
        if (!token) {
            return next(new Error("missing_token"));
        }
        try {
            const payload = await verifyGameToken(token, secret);
            socket.data = payload satisfies GameTokenPayload;
            next();
        } catch {
            next(new Error("invalid_token"));
        }
    });

    io.on("connection", (socket: Socket) => {
        const payload = socket.data as GameTokenPayload;
        const sessionId = payload.sessionId;
        const room = gameManager.getOrCreate(sessionId);
        let joinedAsPlayer = false;

        logger.info("socket terhubung", {
            id: socket.id,
            role: payload.role,
            sessionId,
        });

        socket.on(HOST_JOIN_SESSION, () => {
            if (payload.role !== "host") {
                return sendError(socket, "not_authorized", "Hanya host.");
            }
            room.hostJoin(socket);
        });

        socket.on(HOST_START_GAME, () => {
            if (payload.role !== "host" || !room.isHost(socket.id)) {
                return sendError(socket, "not_authorized", "Hanya host.");
            }
            void room.startGame();
        });

        socket.on(HOST_NEXT_QUESTION, () => {
            if (payload.role !== "host" || !room.isHost(socket.id)) {
                return sendError(socket, "not_authorized", "Hanya host.");
            }
            room.nextQuestion();
        });

        socket.on(HOST_SKIP_QUESTION, () => {
            if (payload.role !== "host" || !room.isHost(socket.id)) {
                return sendError(socket, "not_authorized", "Hanya host.");
            }
            room.skipQuestion();
        });

        socket.on(HOST_SHOW_LEADERBOARD, () => {
            if (payload.role !== "host" || !room.isHost(socket.id)) {
                return sendError(socket, "not_authorized", "Hanya host.");
            }
            room.showLeaderboard();
        });

        socket.on(HOST_END_GAME, () => {
            if (payload.role !== "host" || !room.isHost(socket.id)) {
                return sendError(socket, "not_authorized", "Hanya host.");
            }
            room.endGame();
        });

        socket.on(PLAYER_JOIN, () => {
            if (payload.role !== "player") {
                return sendError(socket, "not_authorized", "Hanya peserta.");
            }
            room.playerJoin(socket, payload.participantId, payload.nickname);
            joinedAsPlayer = true;
        });

        socket.on(PLAYER_ANSWER, (data: unknown) => {
            if (payload.role !== "player") {
                return sendError(socket, "not_authorized", "Hanya peserta.");
            }
            const optionId =
                data && typeof data === "object" && "optionId" in data
                    ? String((data as { optionId: unknown }).optionId)
                    : null;
            if (!optionId) {
                return sendError(socket, "invalid_payload", "optionId wajib.");
            }
            room.playerAnswer(socket, payload.participantId, optionId);
        });

        socket.on(HOST_KICK_PARTICIPANT, (data: unknown) => {
            if (payload.role !== "host" || !room.isHost(socket.id)) {
                return sendError(socket, "not_authorized", "Hanya host.");
            }
            const participantId =
                data && typeof data === "object" && "participantId" in data
                    ? String((data as { participantId: unknown }).participantId)
                    : null;
            if (!participantId) {
                return sendError(socket, "invalid_payload", "participantId wajib.");
            }
            const kicked = room.kick(participantId);
            if (kicked) {
                sendError(kicked, "session_closed", "Anda dikeluarkan oleh host.");
                kicked.disconnect(true);
            }
        });

        socket.on(TIME_SYNC, (data: unknown) => {
            const clientSentAt =
                data && typeof data === "object" && "clientSentAt" in data
                    ? Number((data as { clientSentAt: unknown }).clientSentAt)
                    : null;
            if (typeof clientSentAt !== "number") return;
            socket.emit(TIME_SYNC_ACK, {
                clientSentAt,
                serverTime: Date.now(),
            });
        });

        socket.on("disconnect", (reason) => {
            if (joinedAsPlayer && payload.role === "player") {
                room.playerLeave(payload.participantId);
            }
            logger.info("socket terputus", { id: socket.id, reason });
        });
    });

    return gameManager;
}
