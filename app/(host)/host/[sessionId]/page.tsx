import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getGameSessionForHost } from "@/lib/data/game";
import { Presenter } from "@/components/game/presenter";

export const dynamic = "force-dynamic";

export default async function PresenterPage({
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
        <Presenter
            sessionId={session.id}
            pin={session.pin}
            quizTitle={session.quizTitle}
        />
    );
}
