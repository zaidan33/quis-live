import { listMyQuizzes } from "@/lib/actions/quiz";
import { QuizDashboardClient } from "@/components/quiz/quiz-dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
    const quizzes = await listMyQuizzes();
    return <QuizDashboardClient initialQuizzes={quizzes} />;
}
