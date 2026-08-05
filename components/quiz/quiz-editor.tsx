"use client";

import * as React from "react";
import Link from "next/link";
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    CheckCircle2,
    GripVertical,
    Loader2,
    Play,
    Plus,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { assessQuizReadiness } from "@/lib/utils/quiz";
import { ALLOWED_TIME_LIMITS_SEC, BASE_POINTS } from "@/db/schema/quiz";
import {
    saveQuizAction,
    type QuizOptionTree,
    type QuizQuestionTree,
    type QuizTree,
} from "@/lib/actions/quiz";
import { startGameSessionAction } from "@/lib/actions/game";
import type { SaveQuizInput } from "@/lib/validators/quiz";
import { ImageUpload } from "./image-upload";
import { MarkdownImport } from "./markdown-import";
import type { ImportedQuestion } from "@/lib/md-import";

const TIME_OPTIONS = ALLOWED_TIME_LIMITS_SEC;
const POINT_OPTIONS = [
    { value: BASE_POINTS.STANDARD, label: "Standar (1000)" },
    { value: BASE_POINTS.DOUBLE, label: "Ganda (2000)" },
    { value: BASE_POINTS.NONE, label: "Tanpa Poin (0)" },
];

function uid(): string {
    return crypto.randomUUID();
}

function newQuestion(order: number): QuizQuestionTree {
    return {
        id: uid(),
        order,
        type: "multiple_choice",
        text: "",
        imageUrl: null,
        timeLimitSec: 20,
        basePoints: BASE_POINTS.STANDARD,
        options: [
            { id: uid(), order: 0, text: "", isCorrect: true },
            { id: uid(), order: 1, text: "", isCorrect: false },
        ],
    };
}

function buildSaveInput(tree: QuizTree): SaveQuizInput {
    return {
        id: tree.id,
        title: tree.title,
        description: tree.description,
        coverImageUrl: tree.coverImageUrl,
        questions: tree.questions.map((q) => ({
            id: q.id,
            type: q.type,
            text: q.text,
            imageUrl: q.imageUrl,
            timeLimitSec: q.timeLimitSec,
            basePoints: q.basePoints,
            options: q.options.map((o, j) => ({
                id: o.id,
                order: j,
                text: o.text,
                isCorrect: o.isCorrect,
            })),
        })),
    };
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function QuizEditor({ initialQuiz }: { initialQuiz: QuizTree }) {
    const [tree, setTree] = React.useState<QuizTree>(initialQuiz);
    const [selectedId, setSelectedId] = React.useState<string>(
        initialQuiz.questions[0]?.id ?? "",
    );
    const [saveState, setSaveState] = React.useState<SaveState>("idle");
    const [starting, setStarting] = React.useState(false);

    const treeRef = React.useRef(tree);
    treeRef.current = tree;
    const dirtyRef = React.useRef(false);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

    function commit(next: QuizTree) {
        treeRef.current = next;
        setTree(next);
        scheduleSave();
    }

    function scheduleSave() {
        dirtyRef.current = true;
        setSaveState("idle");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void doSave(), 1000);
    }

    function flushSave() {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (dirtyRef.current) void doSave();
    }

    async function doSave() {
        setSaveState("saving");
        try {
            const res = await saveQuizAction(buildSaveInput(treeRef.current));
            if (res.ok) {
                dirtyRef.current = false;
                setSaveState("saved");
                if (savedTimerRef.current)
                    clearTimeout(savedTimerRef.current);
                savedTimerRef.current = setTimeout(
                    () => setSaveState("idle"),
                    2000,
                );
            } else {
                setSaveState("error");
                toast.error(res.error);
            }
        } catch {
            setSaveState("error");
            toast.error("Gagal menyimpan");
        }
    }

    React.useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        };
    }, []);

    /* --------------------------------------------- mutation helpers */
    function updateMeta(patch: Partial<Pick<QuizTree, "title" | "description" | "coverImageUrl">>) {
        commit({ ...treeRef.current, ...patch });
    }

    function updateQuestion(qid: string, patch: Partial<QuizQuestionTree>) {
        commit({
            ...treeRef.current,
            questions: treeRef.current.questions.map((q) =>
                q.id === qid ? { ...q, ...patch } : q,
            ),
        });
    }

    function setQuestionType(qid: string, type: QuizQuestionTree["type"]) {
        const q = treeRef.current.questions.find((x) => x.id === qid);
        if (!q) return;
        let options: QuizOptionTree[];
        if (type === "true_false") {
            options = [
                { id: q.options[0]?.id ?? uid(), order: 0, text: "Benar", isCorrect: true },
                { id: q.options[1]?.id ?? uid(), order: 1, text: "Salah", isCorrect: false },
            ];
        } else {
            // multiple_choice: pertahankan opsi yang ada, pastikan minimal 2.
            options = q.options.slice(0, 4);
            while (options.length < 2) {
                options.push({
                    id: uid(),
                    order: options.length,
                    text: "",
                    isCorrect: false,
                });
            }
        }
        updateQuestion(qid, { type, options });
    }

    function updateOption(
        qid: string,
        optId: string,
        patch: Partial<QuizOptionTree>,
    ) {
        commit({
            ...treeRef.current,
            questions: treeRef.current.questions.map((q) =>
                q.id === qid
                    ? {
                          ...q,
                          options: q.options.map((o) =>
                              o.id === optId ? { ...o, ...patch } : o,
                          ),
                      }
                    : q,
            ),
        });
    }

    /** Menandai satu opsi sebagai benar; opsi lain di-soal itu jadi salah. */
    function setCorrectOption(qid: string, optId: string) {
        commit({
            ...treeRef.current,
            questions: treeRef.current.questions.map((q) =>
                q.id === qid
                    ? {
                          ...q,
                          options: q.options.map((o) => ({
                              ...o,
                              isCorrect: o.id === optId,
                          })),
                      }
                    : q,
            ),
        });
    }

    function addOption(qid: string) {
        const q = treeRef.current.questions.find((x) => x.id === qid);
        if (!q || q.options.length >= 4) return;
        const opt: QuizOptionTree = {
            id: uid(),
            order: q.options.length,
            text: "",
            isCorrect: false,
        };
        updateQuestion(qid, { options: [...q.options, opt] });
    }

    function removeOption(qid: string, optId: string) {
        const q = treeRef.current.questions.find((x) => x.id === qid);
        if (!q || q.options.length <= 2) return;
        const remaining = q.options
            .filter((o) => o.id !== optId)
            .map((o, i) => ({ ...o, order: i }));
        updateQuestion(qid, { options: remaining });
    }

    function addQuestion() {
        const q = newQuestion(treeRef.current.questions.length);
        commit({ ...treeRef.current, questions: [...treeRef.current.questions, q] });
        setSelectedId(q.id);
    }

    /** Mengonversi hasil impor MD ke tree soal dan menambahkannya. */
    function importQuestions(imported: ImportedQuestion[]) {
        if (imported.length === 0) return;
        const base = treeRef.current.questions.length;
        const added = imported.map((iq, i) => ({
            id: uid(),
            order: base + i,
            type: iq.type,
            text: iq.text,
            imageUrl: null,
            timeLimitSec: iq.timeLimitSec,
            basePoints: iq.basePoints,
            options: iq.options.map((o, j) => ({
                id: uid(),
                order: j,
                text: o.text,
                isCorrect: o.isCorrect,
            })),
        }));
        commit({ ...treeRef.current, questions: [...treeRef.current.questions, ...added] });
        setSelectedId(added[0].id);
        toast.success(`${added.length} soal diimpor dari Markdown`);
    }

    function deleteQuestion(qid: string) {
        const remaining = treeRef.current.questions
            .filter((q) => q.id !== qid)
            .map((q, i) => ({ ...q, order: i }));
        commit({ ...treeRef.current, questions: remaining });
        if (selectedId === qid) {
            setSelectedId(remaining[0]?.id ?? "");
        }
    }

    function onDragEnd(e: DragEndEvent) {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        const qs = treeRef.current.questions;
        const oldIndex = qs.findIndex((q) => q.id === active.id);
        const newIndex = qs.findIndex((q) => q.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(qs, oldIndex, newIndex).map((q, i) => ({
            ...q,
            order: i,
        }));
        commit({ ...treeRef.current, questions: reordered });
    }

    /* --------------------------------------------------- derived */
    const selected =
        tree.questions.find((q) => q.id === selectedId) ?? tree.questions[0];
    const readiness = assessQuizReadiness(tree.questions);

    const startLive = async () => {
        if (!readiness.ready) return;
        flushSave(); // simpan draf tertunda sebelum mulai
        setStarting(true);
        try {
            const res = await startGameSessionAction(tree.id);
            if ("sessionId" in res) {
                // Presenter dibuka sebagai popup layar penuh (route /present,
                // tanpa sidebar dashboard).
                const win = window.open(
                    `/present/${res.sessionId}`,
                    "_blank",
                    "popup=yes,width=1280,height=800",
                );
                if (win) win.focus();
            } else {
                toast.error(res.error);
            }
        } finally {
            setStarting(false);
        }
    };

    return (
        <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                <Button asChild variant="ghost" size="sm">
                    <Link href="/dashboard">← Dashboard</Link>
                </Button>
                <SaveBadge state={saveState} />
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        onClick={startLive}
                        disabled={!readiness.ready || starting}
                        title={
                            readiness.ready
                                ? "Mulai sesi live"
                                : readiness.issues.join("\n")
                        }
                    >
                        {starting ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                            <Play className="mr-2 size-4" />
                        )}
                        Mulai Live
                    </Button>
                </div>
            </div>

            {/* Quiz meta */}
            <div className="rounded-lg border p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                        <Label htmlFor="title">Judul Kuis</Label>
                        <Input
                            id="title"
                            value={tree.title}
                            onChange={(e) => updateMeta({ title: e.target.value })}
                            onBlur={flushSave}
                            maxLength={200}
                        />
                    </div>
                    <ImageUpload
                        label="Sampul"
                        value={tree.coverImageUrl}
                        onChange={(url) => updateMeta({ coverImageUrl: url })}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="desc">Deskripsi</Label>
                    <Textarea
                        id="desc"
                        value={tree.description ?? ""}
                        onChange={(e) =>
                            updateMeta({
                                description: e.target.value || null,
                            })
                        }
                        onBlur={flushSave}
                        rows={2}
                        maxLength={2000}
                    />
                </div>
            </div>

            {/* Readiness */}
            {!readiness.ready ? (
                <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
                    <p className="font-medium">Belum siap dimulai:</p>
                    <ul className="ml-4 list-disc">
                        {readiness.issues.map((iss, i) => (
                            <li key={i}>{iss}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {/* Two-pane editor */}
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                {/* Question list */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                            Soal ({tree.questions.length})
                        </span>
                    </div>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={onDragEnd}
                    >
                        <SortableContext
                            items={tree.questions.map((q) => q.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {tree.questions.map((q, i) => (
                                    <SortableQuestion
                                        key={q.id}
                                        question={q}
                                        index={i}
                                        selected={selected?.id === q.id}
                                        onSelect={() => setSelectedId(q.id)}
                                        onDelete={() => deleteQuestion(q.id)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={addQuestion}
                    >
                        <Plus className="mr-2 size-4" />
                        Tambah Soal
                    </Button>
                    <MarkdownImport onImport={importQuestions} />
                </div>

                {/* Question form */}
                <div>
                    {selected ? (
                        <QuestionForm
                            key={selected.id}
                            question={selected}
                            onUpdate={(patch) => updateQuestion(selected.id, patch)}
                            onTypeChange={(t) => setQuestionType(selected.id, t)}
                            onUpdateOption={(optId, patch) =>
                                updateOption(selected.id, optId, patch)
                            }
                            onSetCorrect={(optId) =>
                                setCorrectOption(selected.id, optId)
                            }
                            onAddOption={() => addOption(selected.id)}
                            onRemoveOption={(optId) =>
                                removeOption(selected.id, optId)
                            }
                            onFlush={flushSave}
                        />
                    ) : (
                        <div className="flex h-64 items-center justify-center rounded-lg border text-muted-foreground">
                            Belum ada soal. Klik “Tambah Soal”.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* --------------------------------------------------- SaveBadge */
function SaveBadge({ state }: { state: SaveState }) {
    if (state === "saving")
        return (
            <Badge variant="secondary" className="gap-1">
                <Loader2 className="size-3 animate-spin" /> Menyimpan…
            </Badge>
        );
    if (state === "saved")
        return (
            <Badge variant="secondary" className="gap-1 text-emerald-600">
                <CheckCircle2 className="size-3" /> Tersimpan
            </Badge>
        );
    if (state === "error")
        return <Badge variant="destructive">Gagal menyimpan</Badge>;
    return (
        <Badge variant="outline" className="text-muted-foreground">
            Tersimpan otomatis
        </Badge>
    );
}

/* ----------------------------------------------- SortableQuestion */
function SortableQuestion({
    question,
    index,
    selected,
    onSelect,
    onDelete,
}: {
    question: QuizQuestionTree;
    index: number;
    selected: boolean;
    onSelect: () => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: question.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    };
    const hasCorrect = question.options.some((o) => o.isCorrect);
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group flex items-center gap-2 rounded-lg border p-2",
                selected
                    ? "border-primary ring-1 ring-primary"
                    : "hover:border-foreground/20",
            )}
        >
            <button
                type="button"
                className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                {...attributes}
                {...listeners}
                aria-label="Susun ulang"
            >
                <GripVertical className="size-4" />
            </button>
            <button
                type="button"
                onClick={onSelect}
                className="flex-1 text-left"
            >
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                        Soal {index + 1}
                    </span>
                    {question.type === "true_false" && (
                        <span className="text-xs text-muted-foreground">
                            · Benar/Salah
                        </span>
                    )}
                    {!hasCorrect && (
                        <span className="text-xs text-amber-600">
                            · belum ada jawaban
                        </span>
                    )}
                </div>
                <div className="line-clamp-1 text-sm">
                    {question.text || (
                        <span className="text-muted-foreground">
                            Soal kosong
                        </span>
                    )}
                </div>
            </button>
            <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100"
                onClick={onDelete}
                aria-label="Hapus soal"
            >
                <Trash2 className="size-4" />
            </Button>
        </div>
    );
}

/* --------------------------------------------------- QuestionForm */
function QuestionForm({
    question,
    onUpdate,
    onTypeChange,
    onUpdateOption,
    onSetCorrect,
    onAddOption,
    onRemoveOption,
    onFlush,
}: {
    question: QuizQuestionTree;
    onUpdate: (patch: Partial<QuizQuestionTree>) => void;
    onTypeChange: (t: QuizQuestionTree["type"]) => void;
    onUpdateOption: (optId: string, patch: Partial<QuizOptionTree>) => void;
    onSetCorrect: (optId: string) => void;
    onAddOption: () => void;
    onRemoveOption: (optId: string) => void;
    onFlush: () => void;
}) {
    return (
        <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-2">
                <Label htmlFor="qtext">Teks Soal</Label>
                <Textarea
                    id="qtext"
                    value={question.text}
                    onChange={(e) => onUpdate({ text: e.target.value })}
                    onBlur={onFlush}
                    rows={3}
                    maxLength={1000}
                    placeholder="Tulis pertanyaan di sini…"
                />
            </div>

            <ImageUpload
                label="Gambar Soal (opsional)"
                value={question.imageUrl}
                onChange={(url) => onUpdate({ imageUrl: url })}
            />

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                    <Label>Tipe Soal</Label>
                    <Select
                        value={question.type}
                        onValueChange={(v) =>
                            onTypeChange(v as QuizQuestionTree["type"])
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="multiple_choice">
                                Pilihan Ganda
                            </SelectItem>
                            <SelectItem value="true_false">
                                Benar / Salah
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Batas Waktu</Label>
                    <Select
                        value={String(question.timeLimitSec)}
                        onValueChange={(v) =>
                            onUpdate({ timeLimitSec: Number(v) })
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_OPTIONS.map((s) => (
                                <SelectItem key={s} value={String(s)}>
                                    {s} detik
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Bobot Poin</Label>
                    <Select
                        value={String(question.basePoints)}
                        onValueChange={(v) =>
                            onUpdate({ basePoints: Number(v) })
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {POINT_OPTIONS.map((p) => (
                                <SelectItem key={p.value} value={String(p.value)}>
                                    {p.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Options */}
            <div className="space-y-2">
                <Label>Opsi Jawaban</Label>
                {question.type === "true_false" ? (
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            Pilih jawaban yang benar:
                        </p>
                        <RadioGroup
                            value={
                                question.options.find((o) => o.isCorrect)
                                    ?.text === "Salah"
                                    ? "Salah"
                                    : "Benar"
                            }
                            onValueChange={(val) => {
                                const correctOpt = question.options.find(
                                    (o) => o.text === val,
                                );
                                if (correctOpt) onSetCorrect(correctOpt.id);
                            }}
                            className="flex gap-6"
                        >
                            {["Benar", "Salah"].map((lbl) => (
                                <div
                                    key={lbl}
                                    className="flex items-center gap-2"
                                >
                                    <RadioGroupItem value={lbl} id={`tf-${lbl}`} />
                                    <Label htmlFor={`tf-${lbl}`}>{lbl}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {question.options.map((o, i) => (
                            <div
                                key={o.id}
                                className="flex items-center gap-2"
                            >
                                <button
                                    type="button"
                                    onClick={() => onSetCorrect(o.id)}
                                    className={cn(
                                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                                        o.isCorrect
                                            ? "border-emerald-500 bg-emerald-500 text-white"
                                            : "border-muted-foreground/30",
                                    )}
                                    aria-label="Tandai benar"
                                >
                                    {o.isCorrect && <CheckCircle2 className="size-4" />}
                                </button>
                                <Input
                                    value={o.text}
                                    onChange={(e) =>
                                        onUpdateOption(o.id, {
                                            text: e.target.value,
                                        })
                                    }
                                    onBlur={onFlush}
                                    placeholder={`Opsi ${String.fromCharCode(65 + i)}`}
                                    maxLength={200}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    disabled={question.options.length <= 2}
                                    onClick={() => onRemoveOption(o.id)}
                                    aria-label="Hapus opsi"
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={question.options.length >= 4}
                            onClick={onAddOption}
                        >
                            <Plus className="mr-2 size-4" />
                            Tambah Opsi
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
