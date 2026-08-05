import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getGameSessionForHost } from "@/lib/data/game";
import { FullscreenPresenter } from "@/components/game/fullscreen-presenter";

export const dynamic = "force-dynamic";

/**
 * Presenter view dalam mode layar penuh (tanpa sidebar dashboard).
 * Dipakai dari dashboard/editor lewat window.open — "page pop up".
 */
export default async function PresentFullscreenPage({
    params,
}: {
    params: Promise<{ sessionId: string }>;
}) {
    const user = await requireUser();
    const { sessionId } = await params;
    const session = await getGameSessionForHost(sessionId, user.id);
    if (!session) notFound();
    if (session.status === "finished" || session.status === "aborted") {
        redirect(`/reports/${session.id}`);
    }

    return (
        <FullscreenPresenter
            sessionId={session.id}
            pin={session.pin}
            quizTitle={session.quizTitle}
        />
    );
}
