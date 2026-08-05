"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
    Copy,
    Loader2,
    MoreHorizontal,
    Pencil,
    Play,
    Plus,
    Search,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    createQuizAction,
    deleteQuizAction,
    duplicateQuizAction,
    type QuizListItem,
} from "@/lib/actions/quiz";
import { startGameSessionAction } from "@/lib/actions/game";

type RowAction =
    | { kind: "duplicate"; quiz: QuizListItem }
    | { kind: "delete"; quiz: QuizListItem }
    | null;

export function QuizDashboardClient({
    initialQuizzes,
}: {
    initialQuizzes: QuizListItem[];
}) {
    const router = useRouter();
    const [data, setData] = React.useState<QuizListItem[]>(initialQuizzes);
    const [search, setSearch] = React.useState("");
    const [creating, setCreating] = React.useState(false);
    const [pendingId, setPendingId] = React.useState<string | null>(null);
    const [startingId, setStartingId] = React.useState<string | null>(null);
    const [dialog, setDialog] = React.useState<RowAction>(null);

    const columns = React.useMemo<ColumnDef<QuizListItem>[]>(
        () => [
            {
                accessorKey: "title",
                header: "Judul",
                cell: ({ row }) => {
                    const q = row.original;
                    return (
                        <div className="flex flex-col">
                            <span className="font-medium">{q.title}</span>
                            {q.description ? (
                                <span className="line-clamp-1 text-sm text-muted-foreground">
                                    {q.description}
                                </span>
                            ) : null}
                        </div>
                    );
                },
            },
            {
                accessorKey: "questionCount",
                header: "Soal",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.questionCount} soal
                    </span>
                ),
            },
            {
                accessorKey: "updatedAt",
                header: "Diperbarui",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {formatDistanceToNow(row.original.updatedAt, {
                            addSuffix: true,
                            locale: idLocale,
                        })}
                    </span>
                ),
            },
            {
                id: "start",
                header: () => <span className="sr-only">Mulai Live</span>,
                cell: ({ row }) => {
                    const q = row.original;
                    return (
                        <div className="text-right">
                            <Button
                                size="sm"
                                disabled={!q.ready || startingId === q.id}
                                title={
                                    q.ready
                                        ? `Mulai live: ${q.title}`
                                        : q.readinessIssues.join("\n")
                                }
                                onClick={() => handleStart(q)}
                            >
                                {startingId === q.id ? (
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                    <Play className="mr-2 size-4" />
                                )}
                                Mulai Live
                            </Button>
                        </div>
                    );
                },
            },
            {
                id: "actions",
                header: () => <span className="sr-only">Aksi</span>,
                cell: ({ row }) => (
                    <div className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                >
                                    <MoreHorizontal className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                    <Link href={`/quiz/${row.original.id}/edit`}>
                                        <Pencil className="mr-2 size-4" />
                                        Edit
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        setDialog({
                                            kind: "duplicate",
                                            quiz: row.original,
                                        })
                                    }
                                >
                                    <Copy className="mr-2 size-4" />
                                    Duplikat
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() =>
                                        setDialog({
                                            kind: "delete",
                                            quiz: row.original,
                                        })
                                    }
                                >
                                    <Trash2 className="mr-2 size-4" />
                                    Hapus
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ),
            },
        ],
        [],
    );

    const table = useReactTable({
        data,
        columns,
        state: { globalFilter: search },
        onGlobalFilterChange: setSearch,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    async function handleNew() {
        setCreating(true);
        try {
            const res = await createQuizAction();
            router.push(`/quiz/${res.id}/edit`);
        } catch {
            toast.error("Gagal membuat kuis");
            setCreating(false);
        }
    }

    /** Mulai sesi live langsung dari dashboard (tanpa buka editor). */
    async function handleStart(quiz: QuizListItem) {
        if (!quiz.ready) return;
        setStartingId(quiz.id);
        try {
            const res = await startGameSessionAction(quiz.id);
            if ("sessionId" in res) {
                router.push(`/host/${res.sessionId}`);
            } else {
                toast.error(res.error);
            }
        } catch {
            toast.error("Gagal memulai sesi");
        } finally {
            setStartingId(null);
        }
    }

    async function handleDuplicate(quiz: QuizListItem) {
        setPendingId(quiz.id);
        try {
            const res = await duplicateQuizAction(quiz.id);
            if ("id" in res) {
                toast.success("Kuis berhasil diduplikat");
                router.push(`/quiz/${res.id}/edit`);
            } else {
                toast.error(res.error);
            }
        } finally {
            setPendingId(null);
            setDialog(null);
        }
    }

    async function handleDelete(quiz: QuizListItem) {
        setPendingId(quiz.id);
        try {
            const res = await deleteQuizAction(quiz.id);
            if ("ok" in res) {
                setData((d) => d.filter((q) => q.id !== quiz.id));
                toast.success("Kuis dihapus");
            } else {
                toast.error(res.error);
            }
        } finally {
            setPendingId(null);
            setDialog(null);
        }
    }

    return (
        <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold tracking-tight">
                    Kuis Saya
                </h2>
                <p className="text-sm text-muted-foreground">
                    Kelola kuis, tambah soal, dan mulai sesi live.
                </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari kuis…"
                        className="pl-8"
                    />
                </div>
                <Button onClick={handleNew} disabled={creating}>
                    {creating ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                        <Plus className="mr-2 size-4" />
                    )}
                    Kuis Baru
                </Button>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((hg) => (
                            <TableRow key={hg.id}>
                                {hg.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {flexRender(
                                            header.column.columnDef.header,
                                            header.getContext(),
                                        )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-32 text-center text-muted-foreground"
                                >
                                    {search
                                        ? "Tidak ada kuis yang cocok."
                                        : "Belum ada kuis. Klik “Kuis Baru” untuk memulai."}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog
                open={dialog?.kind === "duplicate"}
                onOpenChange={(o) => !o && setDialog(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Duplikat “{dialog?.quiz.title}”?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Salinan kuis beserta semua soal akan dibuat.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={
                                pendingId === dialog?.quiz.id &&
                                dialog?.kind === "duplicate"
                            }
                            onClick={() =>
                                dialog?.kind === "duplicate" &&
                                handleDuplicate(dialog.quiz)
                            }
                        >
                            Duplikat
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={dialog?.kind === "delete"}
                onOpenChange={(o) => !o && setDialog(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Hapus “{dialog?.quiz.title}”?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Kuis disembunyikan dari daftar. Tindakan ini tidak
                            dapat dibatalkan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            disabled={
                                pendingId === dialog?.quiz.id &&
                                dialog?.kind === "delete"
                            }
                            onClick={() =>
                                dialog?.kind === "delete" &&
                                handleDelete(dialog.quiz)
                            }
                        >
                            Hapus
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
