"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameSession } from "@/db/schema/quiz";
import { requireUser } from "@/lib/session";

/**
 * Menghapus sesi beserta seluruh datanya (PRD 6.5: data sesi dapat dihapus
 * host kapan saja). Cascade FK game_session → participant → participant_answer
 * membuang jawaban & peserta otomatis. Hanya pemilik yang bisa menghapus.
 */
export async function deleteSessionAction(
    sessionId: string,
): Promise<{ ok: true } | { error: string }> {
    const user = await requireUser();
    const result = await db
        .delete(gameSession)
        .where(
            and(eq(gameSession.id, sessionId), eq(gameSession.hostId, user.id)),
        );
    if (result.rowCount === 0) {
        return { error: "Sesi tidak ditemukan" };
    }
    revalidatePath("/sessions");
    revalidatePath("/dashboard");
    return { ok: true };
}
