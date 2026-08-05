"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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
import { type SessionListItem } from "@/lib/data/reports";
import { deleteSessionAction } from "@/lib/actions/reports";

const STATUS_LABEL: Record<SessionListItem["status"], string> = {
    lobby: "Lobby",
    in_progress: "Berjalan",
    finished: "Selesai",
    aborted: "Dihentikan",
};

const STATUS_VARIANT: Record<
    SessionListItem["status"],
    "secondary" | "default" | "destructive" | "outline"
> = {
    lobby: "outline",
    in_progress: "default",
    finished: "secondary",
    aborted: "destructive",
};

export function SessionsListClient({
    initialSessions,
}: {
    initialSessions: SessionListItem[];
}) {
    const [data, setData] = React.useState<SessionListItem[]>(initialSessions);
    const [pendingId, setPendingId] = React.useState<string | null>(null);
    const [toDelete, setToDelete] = React.useState<SessionListItem | null>(null);

    async function handleDelete(session: SessionListItem) {
        setPendingId(session.id);
        try {
            const res = await deleteSessionAction(session.id);
            if ("ok" in res) {
                setData((d) => d.filter((s) => s.id !== session.id));
                toast.success("Sesi dihapus");
            } else {
                toast.error(res.error);
            }
        } finally {
            setPendingId(null);
            setToDelete(null);
        }
    }

    return (
        <div className="@container/main mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 md:gap-6 md:p-8">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold tracking-tight">
                    Riwayat Sesi
                </h2>
                <p className="text-sm text-muted-foreground">
                    Semua sesi live yang pernah dijalankan beserta hasilnya.
                </p>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Kuis</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Peserta</TableHead>
                            <TableHead>Dijalankan</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="h-32 text-center text-muted-foreground"
                                >
                                    Belum ada sesi. Jalankan kuis dari dashboard
                                    untuk mulai.
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((s) => (
                                <TableRow key={s.id}>
                                    <TableCell className="font-medium">
                                        {s.quizTitle}
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            PIN {s.pin}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANT[s.status]}>
                                            {STATUS_LABEL[s.status]}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {s.participantCount}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {s.startedAt
                                            ? formatDistanceToNow(s.startedAt, {
                                                  addSuffix: true,
                                                  locale: idLocale,
                                              })
                                            : "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            {s.status === "finished" ||
                                            s.status === "aborted" ? (
                                                <Button
                                                    asChild
                                                    size="sm"
                                                    variant="outline"
                                                >
                                                    <Link
                                                        href={`/reports/${s.id}`}
                                                    >
                                                        Laporan
                                                    </Link>
                                                </Button>
                                            ) : (
                                                <Button
                                                    asChild
                                                    size="sm"
                                                    variant="outline"
                                                >
                                                    <Link href={`/host/${s.id}`}>
                                                        Lanjutkan
                                                    </Link>
                                                </Button>
                                            )}
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="size-8 text-muted-foreground hover:text-destructive"
                                                disabled={pendingId === s.id}
                                                onClick={() => setToDelete(s)}
                                                aria-label="Hapus sesi"
                                            >
                                                {pendingId === s.id ? (
                                                    <Loader2 className="size-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="size-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog
                open={!!toDelete}
                onOpenChange={(o) => !o && setToDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Hapus sesi &ldquo;{toDelete?.quizTitle}&rdquo;?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Semua data sesi — peserta, jawaban, dan skor — akan
                            dihapus permanen. Tindakan ini tidak dapat
                            dibatalkan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            disabled={!!toDelete && pendingId === toDelete.id}
                            onClick={() => toDelete && handleDelete(toDelete)}
                        >
                            Hapus
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
