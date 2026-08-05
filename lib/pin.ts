import { randomInt } from "node:crypto";

/** Panjang PIN sesi (PRD GAME-1: 6 digit). */
export const PIN_LENGTH = 6;
/** Maksimum percobaan generate PIN sebelum menyerah (PRD risiko PIN bertabrakan). */
export const MAX_PIN_RETRIES = 10;

/**
 * Menghasilkan PIN 6 digit acak kriptografis (rentang 000000–999999,
 * selalu 6 digit dengan padding nol di depan).
 *
 * Memakai node:crypto.randomInt agar distribusi seragam (bukan Math.random).
 */
export function generatePin(): string {
    const max = 10 ** PIN_LENGTH; // 1_000_000
    const n = randomInt(0, max);
    return n.toString().padStart(PIN_LENGTH, "0");
}

/**
 * Mencoba menghasilkan PIN yang belum dipakai sesi aktif. `isActivePin`
 * memeriksa keberadaan PIN pada sesi berstatus lobby/in_progress.
 * Mencoba ulang hingga MAX_PIN_RETRIES (PRD: maksimal 10 kali).
 */
export async function generateUniquePin(
    isActivePin: (pin: string) => Promise<boolean>,
): Promise<string> {
    for (let i = 0; i < MAX_PIN_RETRIES; i++) {
        const pin = generatePin();
        if (!(await isActivePin(pin))) return pin;
    }
    throw new Error(
        `Gagal membuat PIN unik setelah ${MAX_PIN_RETRIES} percobaan`,
    );
}
