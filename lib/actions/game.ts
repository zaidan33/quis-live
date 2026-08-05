"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { gameSession } from "@/db/schema/quiz";
import { requireUser } from "@/lib/session";
import { getQuizForEditing } from "@/lib/actions/quiz";
import { assessQuizReadiness } from "@/lib/utils/quiz";
import { generateUniquePin } from "@/lib/pin";

async function isActivePin(pin: string): Promise<boolean> {
    const row = await db.query.gameSession.findFirst({
        where: and(
            eq(gameSession.pin, pin),
            inArray(gameSession.status, ["lobby", "in_progress"]),
        ),
        columns: { id: true },
    });
    return Boolean(row);
}

/**
 * Membuat sesi live baru untuk kuis (status lobby). Kuis harus siap (QUIZ-12).
 * Mengembalikan sessionId + PIN untuk diarahkan ke presenter lobby.
 */
export async function startGameSessionAction(
    quizId: string,
): Promise<{ sessionId: string; pin: string } | { error: string }> {
    const user = await requireUser();
    const tree = await getQuizForEditing(quizId);
    if (!tree) return { error: "Kuis tidak ditemukan" };

    const readiness = assessQuizReadiness(tree.questions);
    if (!readiness.ready) {
        return { error: readiness.issues[0] ?? "Kuis belum siap dimainkan" };
    }

    const pin = await generateUniquePin(isActivePin);
    const [row] = await db
        .insert(gameSession)
        .values({ quizId, hostId: user.id, pin })
        .returning({ id: gameSession.id, pin: gameSession.pin });

    revalidatePath("/dashboard");
    return { sessionId: row!.id, pin: row!.pin };
}
