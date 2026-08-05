import { notFound } from "next/navigation";
import { getQuizForEditing } from "@/lib/actions/quiz";
import { QuizEditor } from "@/components/quiz/quiz-editor";

export const dynamic = "force-dynamic";

export default async function EditQuizPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const tree = await getQuizForEditing(id);
    if (!tree) notFound();
    return <QuizEditor initialQuiz={tree} />;
}
