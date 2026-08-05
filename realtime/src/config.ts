import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// realtime/src/ → .env proyek ada dua level ke atas.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `Realtime: variabel lingkungan ${name} belum diset. Periksa .env proyek.`,
        );
    }
    return value;
}

export const env = {
    /** Port HTTP+Socket.IO. */
    port: Number(process.env.REALTIME_PORT ?? 4000),
    /** Connection string Postgres (sama dengan app). */
    databaseUrl: required('DATABASE_URL'),
    /** Secret bersama dengan app untuk menandatangani JWT peserta/host. */
    gameTokenSecret: required('GAME_TOKEN_SECRET'),
    /** Origin yang diizinkan CORS (URL app). */
    corsOrigin: process.env.NEXT_PUBLIC_REALTIME_URL ?? '*',
} as const;
