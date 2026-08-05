import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from './config';
import * as quizSchema from '../../db/schema/quiz';

/**
 * Koneksi Drizzle realtime ke Postgres yang sama dengan app.
 * Dipakai HANYA pada checkpoint (peserta join, soal ditutup, game selesai) —
 * bukan untuk tiap jawaban (PRD 6.2, IMPLEMENTATION_PLAN 2.3).
 */
export const db = drizzle(env.databaseUrl, { schema: { ...quizSchema } });
export { quizSchema };
