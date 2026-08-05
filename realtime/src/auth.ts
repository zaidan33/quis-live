/**
 * Autentikasi JWT realtime — re-export dari shared/token.ts (sumber tunggal).
 * app menandatangani token; realtime memverifikasi di middleware socket.
 */
export {
    signGameToken,
    verifyGameToken,
    isHostToken,
    isPlayerToken,
    GAME_TOKEN_TTL_SECONDS,
} from "../../shared/token";
