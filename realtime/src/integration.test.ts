import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server } from "socket.io";
import { createServer } from "node:http";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { signGameToken } from "./auth";
import { setupRealtime } from "./setup";
import {
    GAME_ERROR,
    GAME_STATE,
    HOST_JOIN_SESSION,
    HOST_KICK_PARTICIPANT,
    LOBBY_UPDATE,
    PLAYER_JOIN,
} from "../shared/events";
import type { LobbyUpdatePayload, GameErrorPayload } from "../shared/types";

const SECRET = "integration-test-secret-min-32-characters-aaaa";
const SESSION = "ses-lobby-integration";

let io: Server;
let port = 0;

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

afterAll(
    () => new Promise<void>((resolve) => io.close(() => resolve())),
);

function client(token: string): ClientSocket {
    return ioc(`http://localhost:${port}`, {
        auth: { token },
        transports: ["websocket"],
        forceNew: true,
    });
}

const hostToken = () =>
    signGameToken({ role: "host", sessionId: SESSION, userId: "u1" }, SECRET);
const playerToken = (id: string, nick: string) =>
    signGameToken(
        { role: "player", sessionId: SESSION, participantId: id, nickname: nick },
        SECRET,
    );

function once<T>(s: ClientSocket, ev: string): Promise<T> {
    return new Promise((resolve) => s.once(ev, (p: T) => resolve(p)));
}
function connected(s: ClientSocket): Promise<void> {
    if (s.connected) return Promise.resolve();
    return new Promise((r) => s.once("connect", () => r()));
}

async function nextLobbyWith(
    s: ClientSocket,
    nick: string,
    timeoutMs = 2500,
): Promise<LobbyUpdatePayload> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const upd = await new Promise<LobbyUpdatePayload | null>((resolve) => {
            const t = setTimeout(() => resolve(null), 700);
            s.once(LOBBY_UPDATE, (p: LobbyUpdatePayload) => {
                clearTimeout(t);
                resolve(p);
            });
        });
        if (upd && upd.participants.some((p) => p.nickname === nick)) return upd;
    }
    throw new Error(`lobby:update dengan "${nick}" tidak diterima`);
}

describe("lobby realtime (Fase 2)", () => {
    it("peserta bergabung terlihat host via lobby:update", async () => {
        const host = client(await hostToken());
        await connected(host);
        const hostState = once(host, GAME_STATE);
        host.emit(HOST_JOIN_SESSION);
        const st = await hostState;
        expect(st).toBeTruthy();

        const p1 = client(await playerToken("pa", "Andi"));
        await connected(p1);
        const p1State = once(p1, GAME_STATE);
        p1.emit(PLAYER_JOIN);
        await p1State;

        const update = await nextLobbyWith(host, "Andi");
        expect(update.participants.some((p) => p.nickname === "Andi")).toBe(true);
        expect(update.count).toBeGreaterThanOrEqual(1);

        host.disconnect();
        p1.disconnect();
    });

    it("kick mengeluarkan peserta (game:error session_closed)", async () => {
        const host = client(await hostToken());
        await connected(host);
        host.emit(HOST_JOIN_SESSION);

        const p2 = client(await playerToken("pb", "Budi"));
        await connected(p2);
        p2.emit(PLAYER_JOIN);
        await nextLobbyWith(host, "Budi");

        const kicked = once<GameErrorPayload>(p2, GAME_ERROR);
        host.emit(HOST_KICK_PARTICIPANT, { participantId: "pb" });
        const err = await kicked;
        expect(err.code).toBe("session_closed");

        host.disconnect();
    });

    it("menolak koneksi tanpa token valid", async () => {
        const bad = ioc(`http://localhost:${port}`, {
            auth: { token: "bogus" },
            transports: ["websocket"],
            forceNew: true,
            reconnection: false,
        });
        const err = await new Promise<Error>((resolve) =>
            bad.once("connect_error", (e: Error) => resolve(e)),
        );
        expect(err).toBeTruthy();
        bad.disconnect();
    });
});
