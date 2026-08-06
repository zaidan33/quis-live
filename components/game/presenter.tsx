"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
    Award,
    Flag,
    Loader2,
    LogOut,
    SkipForward,
    Trophy,
    Users,
    X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { createGameSocket } from "@/lib/socket";
import { syncClock } from "@/lib/clock-sync";
import { cn } from "@/lib/utils";
import { TimerBar } from "@/components/game/timer-bar";
import { AnswerDistribution } from "@/components/game/answer-distribution";
import { ShapeIcon } from "@/components/game/shape-icon";
import { shapeOf } from "@/lib/game/shapes";
import {
    ANSWER_ACK,
    GAME_ERROR,
    GAME_OVER,
    GAME_STATE,
    HOST_END_GAME,
    HOST_JOIN_SESSION,
    HOST_KICK_PARTICIPANT,
    HOST_NEXT_QUESTION,
    HOST_SHOW_LEADERBOARD,
    HOST_SKIP_QUESTION,
    HOST_START_GAME,
    LEADERBOARD_UPDATE,
    LOBBY_UPDATE,
    QUESTION_COUNTDOWN,
    QUESTION_END,
    QUESTION_START,
} from "@shared/events";
import type {
    AnswerDistributionEntry,
    GameErrorCode,
    HostQuestionPayload,
    LobbyUpdatePayload,
    PodiumEntry,
} from "@shared/types";

type Phase =
    | "LOBBY"
    | "COUNTDOWN"
    | "QUESTION_ACTIVE"
    | "QUESTION_ENDED"
    | "LEADERBOARD"
    | "FINISHED";

type Conn =
    | { status: "connecting" }
    | { status: "error"; message: string }
    | { status: "reconnecting" }
    | { status: "connected" };

interface DistEntry {
    order: number;
    text: string;
    count: number;
    correct: boolean;
}

const STATE_TO_PHASE: Record<string, Phase> = {
    LOBBY: "LOBBY",
    COUNTDOWN: "COUNTDOWN",
    QUESTION_ACTIVE: "QUESTION_ACTIVE",
    QUESTION_ENDED: "QUESTION_ENDED",
    LEADERBOARD: "LEADERBOARD",
    FINISHED: "FINISHED",
};

export function Presenter({
    sessionId,
    pin,
    quizTitle,
}: {
    sessionId: string;
    pin: string;
    quizTitle: string;
}) {
    const router = useRouter();
    const [conn, setConn] = React.useState<Conn>({ status: "connecting" });
    const [phase, setPhase] = React.useState<Phase>("LOBBY");
    const [lobby, setLobby] = React.useState<LobbyUpdatePayload>({
        participants: [],
        count: 0,
    });
    const [countdown, setCountdown] = React.useState<{
        n: number;
        index: number;
        total: number;
    } | null>(null);
    const [question, setQuestion] = React.useState<HostQuestionPayload | null>(
        null,
    );
    const [distEntries, setDistEntries] = React.useState<DistEntry[] | null>(null);
    const [leaderboard, setLeaderboard] = React.useState<{
        top: { participantId: string; nickname: string; score: number }[];
    } | null>(null);
    const [podium, setPodium] = React.useState<PodiumEntry[] | null>(null);
    const [progress, setProgress] = React.useState({ index: 0, total: 0 });
    const [answeredCount, setAnsweredCount] = React.useState(0);
    const [offset, setOffset] = React.useState(0);
    const [confirmEnd, setConfirmEnd] = React.useState(false);

    const socketRef = React.useRef<ReturnType<typeof createGameSocket> | null>(
        null,
    );

    const joinUrl = React.useMemo(
        () =>
            typeof window === "undefined"
                ? ""
                : `${window.location.origin}/join?pin=${pin}`,
        [pin],
    );

    React.useEffect(() => {
        let cancelled = false;
        let socket: ReturnType<typeof createGameSocket> | null = null;

        (async () => {
            const res = await fetch("/api/game/token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId }),
            });
            const data = await res.json();
            if (!res.ok || !data.token) {
                if (!cancelled)
                    setConn({
                        status: "error",
                        message: data.error || "Gagal mendapatkan token host",
                    });
                return;
            }
            socket = createGameSocket(data.token);
            socketRef.current = socket;

            socket.on("connect", () => {
                socket!.emit(HOST_JOIN_SESSION);
                if (!cancelled) setConn({ status: "connected" });
                // Offset jam hanya untuk akurasi tampilan (PRD 5.5).
                syncClock(socket!).then((o) => !cancelled && setOffset(o));
            });
            socket.on("disconnect", (reason) => {
                // Reconnect otomatis aktif (lib/socket.ts). Jangan tampilkan
                // layar error permanen — tandai "menghubungkan kembali".
                if (!cancelled && reason !== "io client disconnect")
                    setConn((c): Conn =>
                        c.status === "connected"
                            ? { status: "reconnecting" }
                            : c,
                    );
            });
            socket.on("connect_error", (err: Error) => {
                // Auto-reconnect terus mencoba; UI tetap di layar game.
                if (!cancelled)
                    setConn((c): Conn =>
                        c.status === "connected"
                            ? { status: "reconnecting" }
                            : c,
                    );
            });

            socket.on(GAME_STATE, (s: unknown) => {
                handleGameState(s);
            });
            socket.on(LOBBY_UPDATE, (l: LobbyUpdatePayload) => setLobby(l));
            socket.on(QUESTION_COUNTDOWN, (c: { n: number; index: number; total: number }) => {
                setPhase("COUNTDOWN");
                setCountdown(c);
                setProgress({ index: c.index, total: c.total });
                setQuestion(null);
                setDistEntries(null);
            });
            socket.on(QUESTION_START, (q: HostQuestionPayload) => {
                setPhase("QUESTION_ACTIVE");
                setQuestion(q);
                setCountdown(null);
                setDistEntries(null);
                setAnsweredCount(0);
                setProgress({ index: q.index, total: q.total });
            });
            socket.on(ANSWER_ACK, () => {
                /* host tidak menjawab; abaikan */
            });
            socket.on(
                QUESTION_END,
                (p: {
                    questionId: string;
                    correctOptionId: string | null;
                    distribution: AnswerDistributionEntry[];
                }) => {
                    const q = questionRef.current;
                    if (!q) return;
                    const byId = new Map(
                        p.distribution.map((d) => [d.optionId, d.count]),
                    );
                    setDistEntries(
                        q.question.options.map((o) => ({
                            order: o.order,
                            text: o.text,
                            count: byId.get(o.id) ?? 0,
                            correct: o.isCorrect,
                        })),
                    );
                    setPhase("QUESTION_ENDED");
                },
            );
            socket.on(LEADERBOARD_UPDATE, (l: { top: unknown[] }) => {
                setLeaderboard(l as { top: { participantId: string; nickname: string; score: number }[] });
                setPhase("LEADERBOARD");
            });
            socket.on(GAME_OVER, (g: { podium: PodiumEntry[] }) => {
                setPodium(g.podium);
                setPhase("FINISHED");
            });
            socket.on(GAME_ERROR, (e: { code: GameErrorCode; message: string }) => {
                toast.error(e.message);
            });
        })();

        return () => {
            cancelled = true;
            socket?.removeAllListeners();
            socket?.disconnect();
        };
        // question dipakai di handler QUESTION_END lewat closure terbaru via ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    // Simpan question terbaru agar handler QUESTION_END (didaftarkan sekali)
    // membaca nilai segar.
    const questionRef = React.useRef(question);
    React.useEffect(() => {
        questionRef.current = question;
    }, [question]);

    function handleGameState(s: unknown) {
        const st = s as {
            state?: string;
            lobby?: LobbyUpdatePayload;
            index?: number;
            total?: number;
        };
        if (st.lobby) {
            setPhase("LOBBY");
            setLobby(st.lobby);
            return;
        }
        if (st.state) {
            setPhase(STATE_TO_PHASE[st.state] ?? "LOBBY");
        }
        if (typeof st.index === "number" && typeof st.total === "number") {
            setProgress({ index: st.index, total: st.total });
        }
    }

    function kick(id: string, nickname: string) {
        socketRef.current?.emit(HOST_KICK_PARTICIPANT, { participantId: id });
        toast.success(`${nickname} dikeluarkan`);
    }

    function start() {
        socketRef.current?.emit(HOST_START_GAME);
    }
    function skip() {
        socketRef.current?.emit(HOST_SKIP_QUESTION);
    }
    function showLeaderboard() {
        socketRef.current?.emit(HOST_SHOW_LEADERBOARD);
    }
    function nextQuestion() {
        socketRef.current?.emit(HOST_NEXT_QUESTION);
    }
    function endGame() {
        socketRef.current?.emit(HOST_END_GAME);
        setConfirmEnd(false);
    }

    if (conn.status === "connecting") {
        return (
            <Centered>
                <Loader2 className="mr-2 size-5 animate-spin" /> Menghubungkan…
            </Centered>
        );
    }
    if (conn.status === "error") {
        return (
            <Centered column>
                <p className="text-destructive">{conn.message}</p>
                <Button variant="outline" onClick={() => router.push("/dashboard")}>
                    Kembali ke Dashboard
                </Button>
            </Centered>
        );
    }

    if (conn.status === "reconnecting") {
        return (
            <Centered column>
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="font-medium">Menghubungkan kembali…</p>
                <p className="text-sm text-muted-foreground">
                    Koneksi terputus — mencoba menyambung ulang otomatis.
                </p>
            </Centered>
        );
    }

    return (
        <div className="@container/main mx-auto flex h-dvh w-full max-w-6xl flex-col gap-4 overflow-hidden p-4 md:p-6">
            {/* Header */}
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                        {quizTitle}
                    </p>
                    <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                        {titleFor(phase)}
                    </h2>
                    {(phase === "QUESTION_ACTIVE" ||
                        phase === "QUESTION_ENDED" ||
                        phase === "LEADERBOARD") &&
                        progress.total > 0 && (
                            <p className="text-sm text-muted-foreground">
                                Soal {progress.index + 1} dari {progress.total}
                            </p>
                        )}
                </div>
                <div className="flex items-center gap-2">
                    {phase !== "LOBBY" && phase !== "FINISHED" && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmEnd(true)}
                        >
                            <Flag className="mr-2 size-4" /> Akhiri Game
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/dashboard")}
                    >
                        <LogOut className="mr-2 size-4" /> Keluar
                    </Button>
                </div>
            </div>

            {/* Body per fase */}
            {phase === "LOBBY" && (
                <LobbyView
                    pin={pin}
                    joinUrl={joinUrl}
                    lobby={lobby}
                    onKick={kick}
                    onStart={start}
                />
            )}

            {phase === "COUNTDOWN" && countdown && (
                <Centered>
                    <div className="text-center">
                        <p className="mb-4 text-xl font-medium text-muted-foreground">
                            Bersiap… Soal {countdown.index + 1} dari {countdown.total}
                        </p>
                        <div
                            key={countdown.n}
                            className="animate-in fade-in zoom-in text-[12rem] font-black leading-none text-primary md:text-[16rem]"
                            style={{ textShadow: "0 12px 40px -8px var(--primary)" }}
                        >
                            {countdown.n}
                        </div>
                    </div>
                </Centered>
            )}

            {phase === "QUESTION_ACTIVE" && question && (
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                    {/* Soal — hero, tinggi menyesuaikan tapi tidak mendominasi */}
                    <div className="flex min-h-0 flex-1 items-center justify-center rounded-3xl border bg-card p-4 text-center shadow-premium md:p-6">
                        <h3 className="line-clamp-4 max-w-5xl text-3xl font-bold leading-tight tracking-tight md:text-4xl lg:text-5xl">
                            {question.question.text}
                        </h3>
                    </div>

                    <TimerBar
                        serverStartAt={question.serverStartAt}
                        timeLimitMs={question.timeLimitMs}
                        offset={offset}
                    />

                    {/* Opsi — 4 tile besar berwarna, mengisi sisa tinggi */}
                    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
                        {question.question.options.map((o) => {
                            const s = shapeOf(o.order);
                            return (
                                <div
                                    key={o.id}
                                    className="relative flex min-h-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl p-3 text-white shadow-premium-lg md:gap-3 md:p-5"
                                    style={{
                                        backgroundImage: `linear-gradient(135deg, ${s.fill}, ${s.fillStrong})`,
                                    }}
                                >
                                    <ShapeIcon
                                        name={s.name}
                                        className="size-8 shrink-0 opacity-95 md:size-10"
                                    />
                                    <span className="min-w-0 break-words text-center text-lg font-bold leading-snug md:text-xl lg:text-2xl">
                                        {o.text}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex shrink-0 justify-center">
                        <Button variant="outline" onClick={skip}>
                            <SkipForward className="mr-2 size-4" /> Lewati Soal
                        </Button>
                    </div>
                </div>
            )}

            {phase === "QUESTION_ENDED" && question && distEntries && (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
                    <Card className="rounded-2xl shadow-premium">
                        <CardContent className="space-y-5 p-6 md:p-8">
                            <h3 className="text-center text-2xl font-bold leading-snug tracking-tight md:text-3xl">
                                {question.question.text}
                            </h3>
                            <AnswerDistribution entries={distEntries} showCorrect />
                        </CardContent>
                    </Card>
                    <div className="flex shrink-0 justify-center">
                        <Button size="lg" onClick={showLeaderboard}>
                            Lihat Papan Skor
                        </Button>
                    </div>
                </div>
            )}

            {phase === "LEADERBOARD" && (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
                    {leaderboard && leaderboard.top.length > 0 ? (
                        <div className="space-y-4">
                            <h3 className="flex items-center justify-center gap-2 text-center text-xl font-bold tracking-tight">
                                <Trophy className="size-6 text-amber-400" /> Papan Skor
                            </h3>
                            <Podium
                                entries={leaderboard.top
                                    .slice(0, 3)
                                    .map((t, i) => ({
                                        rank: i + 1,
                                        nickname: t.nickname,
                                        score: t.score,
                                    }))}
                            />
                            {leaderboard.top.length > 3 && (
                                <div className="mx-auto w-full max-w-md space-y-1.5">
                                    <LeaderboardRows
                                        rows={leaderboard.top
                                            .slice(3)
                                            .map((t, i) => ({
                                                rank: i + 4,
                                                nickname: t.nickname,
                                                score: t.score,
                                            }))}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <Card className="rounded-2xl shadow-premium">
                            <CardContent className="p-6">
                                <p className="text-center text-sm text-muted-foreground">
                                    Belum ada skor.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                    <div className="flex justify-center">
                        <Button size="lg" onClick={nextQuestion}>
                            Soal Berikutnya
                        </Button>
                    </div>
                </div>
            )}

            {phase === "FINISHED" && (
                <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto">
                    <h3 className="flex items-center justify-center gap-2 text-center text-2xl font-bold tracking-tight md:text-3xl">
                        <Award className="size-7 text-amber-400" /> Permainan Selesai
                    </h3>
                    {podium && podium.length > 0 ? (
                        <Podium
                            entries={podium.map((p) => ({
                                rank: p.rank,
                                nickname: p.nickname,
                                score: p.score,
                                subtitle: `${p.correctCount} benar`,
                            }))}
                        />
                    ) : (
                        <Card className="rounded-2xl shadow-premium">
                            <CardContent className="p-6">
                                <p className="text-center text-sm text-muted-foreground">
                                    Tidak ada peserta.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                    <div className="flex flex-wrap justify-center gap-3">
                        <Button asChild size="lg">
                            <Link href={`/reports/${sessionId}`}>Lihat Laporan</Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => router.push("/dashboard")}
                        >
                            Kembali ke Dashboard
                        </Button>
                    </div>
                </div>
            )}

            <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Akhiri permainan sekarang?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Skor peserta yang sudah tercatat akan disimpan. Permainan tidak
                            bisa dilanjutkan kembali.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={endGame}
                        >
                            Ya, Akhiri
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/* ----------------------------------------------------------- sub-tampilan */

function LobbyView({
    pin,
    joinUrl,
    lobby,
    onKick,
    onStart,
}: {
    pin: string;
    joinUrl: string;
    lobby: LobbyUpdatePayload;
    onKick: (id: string, nickname: string) => void;
    onStart: () => void;
}) {
    return (
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto md:grid-cols-2">
            <Card className="rounded-2xl shadow-premium">
                <CardContent className="flex flex-col items-center gap-5 p-8">
                    <p className="text-sm font-medium text-muted-foreground">
                        Masuk di perangkat masing-masing
                    </p>
                    <div className="rounded-2xl bg-brand-gradient-soft px-8 py-4 text-5xl font-black tracking-[0.3em] tabular-nums text-primary md:text-6xl">
                        {pin}
                    </div>
                    {joinUrl && (
                        <div className="rounded-2xl border bg-white p-3 shadow-premium">
                            <QRCodeSVG value={joinUrl} size={150} level="M" />
                        </div>
                    )}
                    <p className="text-center text-sm text-muted-foreground">
                        Pindai QR atau buka{" "}
                        <span className="font-medium text-foreground">
                            {typeof window !== "undefined"
                                ? window.location.host + "/join"
                                : "/join"}
                        </span>
                    </p>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-premium">
                <CardContent className="flex h-full flex-col gap-4 p-8">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Peserta</h3>
                        <Badge variant="secondary" className="gap-1">
                            <Users className="size-3" /> {lobby.count}
                        </Badge>
                    </div>
                    <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-auto sm:grid-cols-3">
                        {lobby.participants.length === 0 ? (
                            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                                Menunggu peserta bergabung…
                            </p>
                        ) : (
                            lobby.participants.map((p) => (
                                <div
                                    key={p.id}
                                    className="group flex items-center justify-between gap-1 rounded-xl border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent/50"
                                >
                                    <span className="truncate font-medium">
                                        {p.nickname}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onKick(p.id, p.nickname)}
                                        className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                                        aria-label={`Keluarkan ${p.nickname}`}
                                    >
                                        <X className="size-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="md:col-span-2 flex justify-center">
                <Button
                    size="lg"
                    onClick={onStart}
                    disabled={lobby.count === 0}
                    className="min-w-48 text-base"
                >
                    Mulai Permainan
                </Button>
            </div>
        </div>
    );
}

function LeaderboardRows({
    rows,
}: {
    rows: { rank: number; nickname: string; score: number }[];
}) {
    return (
        <div className="space-y-1.5">
            {rows.map((r) => (
                <div
                    key={`${r.rank}-${r.nickname}`}
                    className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 shadow-sm"
                >
                    <span className="w-6 text-center font-bold tabular-nums text-muted-foreground">
                        {r.rank}
                    </span>
                    <span className="flex-1 truncate font-medium">{r.nickname}</span>
                    <span className="tabular-nums font-semibold">{r.score}</span>
                </div>
            ))}
        </div>
    );
}

/* Podium 2-1-3 klasik: pemenang di tengah lebih tinggi. */
function Podium({
    entries,
}: {
    entries: {
        rank: number;
        nickname: string;
        score: number;
        subtitle?: string;
    }[];
}) {
    const byRank = new Map(entries.map((e) => [e.rank, e]));
    const cols = [
        { e: byRank.get(2), place: 2, h: "h-36 md:h-48" },
        { e: byRank.get(1), place: 1, h: "h-48 md:h-64" },
        { e: byRank.get(3), place: 3, h: "h-28 md:h-40" },
    ] as const;

    return (
        <div className="mx-auto grid w-full max-w-3xl grid-cols-3 items-end gap-3 md:gap-5">
            {cols.map(({ e, place, h }) =>
                e ? (
                    <PodiumStep key={place} entry={e} height={h} />
                ) : (
                    <div key={place} />
                ),
            )}
        </div>
    );
}

function PodiumStep({
    entry,
    height,
}: {
    entry: { rank: number; nickname: string; score: number; subtitle?: string };
    height: string;
}) {
    const gold = entry.rank === 1;
    return (
        <div className="flex flex-col items-center">
            <div className="mb-2 text-3xl md:text-4xl">{medal(entry.rank)}</div>
            <div
                className={cn(
                    "flex w-full flex-col items-center justify-end gap-1 rounded-2xl border p-3 text-center shadow-premium transition-transform",
                    height,
                    gold
                        ? "border-amber-400/60 bg-amber-400/10 ring-1 ring-amber-400/40"
                        : "bg-card",
                )}
            >
                <p className="line-clamp-2 max-w-full break-words font-bold leading-tight">
                    {entry.nickname}
                </p>
                <p
                    className={cn(
                        "text-xl font-extrabold tabular-nums md:text-2xl",
                        gold ? "text-amber-500 dark:text-amber-400" : "text-primary",
                    )}
                >
                    {entry.score}
                </p>
                {entry.subtitle && (
                    <p className="text-xs text-muted-foreground">{entry.subtitle}</p>
                )}
            </div>
        </div>
    );
}

function Centered({
    children,
    column,
}: {
    children: React.ReactNode;
    column?: boolean;
}) {
    return (
        <div
            className={`flex flex-1 items-center justify-center p-10 text-muted-foreground ${
                column ? "flex-col gap-3" : ""
            }`}
        >
            {children}
        </div>
    );
}

function titleFor(phase: Phase): string {
    switch (phase) {
        case "LOBBY":
            return "Lobby Sesi";
        case "COUNTDOWN":
            return "Bersiap!";
        case "QUESTION_ACTIVE":
            return "Soal Berjalan";
        case "QUESTION_ENDED":
            return "Hasil Soal";
        case "LEADERBOARD":
            return "Papan Skor";
        case "FINISHED":
            return "Selesai";
    }
}

function medal(rank: number): string {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}`;
}
