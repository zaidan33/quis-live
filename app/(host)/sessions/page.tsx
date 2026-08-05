import { requireUser } from "@/lib/session";
import { listHostSessions } from "@/lib/data/reports";
import { SessionsListClient } from "@/components/report/sessions-list";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
    const user = await requireUser();
    const sessions = await listHostSessions(user.id);
    return <SessionsListClient initialSessions={sessions} />;
}
