import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getSessionReport } from "@/lib/data/reports";
import { ReportView } from "@/components/report/report-view";

export const dynamic = "force-dynamic";

export default async function ReportPage({
    params,
}: {
    params: Promise<{ sessionId: string }>;
}) {
    const user = await requireUser();
    const { sessionId } = await params;
    const report = await getSessionReport(sessionId, user.id);
    if (!report) notFound();

    return <ReportView report={report} />;
}
