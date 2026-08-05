/**
 * Penandatanganan JWT peserta/host — sumber tunggal, dipakai app (sign di
 * /api/game/token) DAN realtime (verify di middleware socket). Keduanya memakai
 * `jose` dan GAME_TOKEN_SECRET yang sama.
 */
import { jwtVerify, SignJWT } from "jose";
import type { GameTokenPayload } from "./types";

const enc = (secret: string) => new TextEncoder().encode(secret);

/** TTL default token game (jam). */
export const GAME_TOKEN_TTL_SECONDS = 4 * 60 * 60;

export async function signGameToken(
    payload: GameTokenPayload,
    secret: string,
    ttlSeconds = GAME_TOKEN_TTL_SECONDS,
): Promise<string> {
    return new SignJWT(payload as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
        .sign(enc(secret));
}

/** Verifikasi JWT; lempar bila tidak valid/kadaluarsa/role tidak dikenal. */
export async function verifyGameToken(
    token: string,
    secret: string,
): Promise<GameTokenPayload> {
    const { payload } = await jwtVerify(token, enc(secret), {
        algorithms: ["HS256"],
    });
    if (payload.role !== "host" && payload.role !== "player") {
        throw new Error("Token tanpa role yang valid");
    }
    return payload as unknown as GameTokenPayload;
}

export function isHostToken(
    p: GameTokenPayload,
): p is Extract<GameTokenPayload, { role: "host" }> {
    return p.role === "host";
}

export function isPlayerToken(
    p: GameTokenPayload,
): p is Extract<GameTokenPayload, { role: "player" }> {
    return p.role === "player";
}
