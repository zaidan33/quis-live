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
            socket.on("connect_error", (err: Error) => {
                if (!cancelled)
                    setConn({
                        status: "error",
                        message: `Koneksi gagal: ${err.message}`,
                    });
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

    return (
        <div className="@container/main mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-sm text-muted-foreground">{quizTitle}</p>
                    <h2 className="text-2xl font-semibold tracking-tight">
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
                        <p className="mb-2 text-lg text-muted-foreground">
                            Bersiap… Soal {countdown.index + 1} dari {countdown.total}
                        </p>
                        <div
                            key={countdown.n}
                            className="animate-in fade-in zoom-in text-[10rem] font-bold leading-none text-primary"
                        >
                            {countdown.n}
                        </div>
                    </div>
                </Centered>
            )}

            {phase === "QUESTION_ACTIVE" && question && (
                <div className="flex flex-1 flex-col gap-6">
                    <Card>
                        <CardContent className="space-y-4 p-6">
                            <h3 className="text-center text-2xl font-semibold md:text-3xl">
                                {question.question.text}
                            </h3>
                            <TimerBar
                                serverStartAt={question.serverStartAt}
                                timeLimitMs={question.timeLimitMs}
                                offset={offset}
                            />
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {question.question.options.map((o) => {
                                    const s = shapeOf(o.order);
                                    return (
                                        <div
                                            key={o.id}
                                            className="flex items-center gap-2 rounded-lg p-2 text-white"
                                            style={{ backgroundColor: s.fill }}
                                        >
                                            <ShapeIcon name={s.name} className="size-6 shrink-0" />
                                            <span className="truncate text-sm font-medium">
                                                {o.text}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                    <div className="flex justify-center">
                        <Button variant="outline" onClick={skip}>
                            <SkipForward className="mr-2 size-4" /> Lewati Soal
                        </Button>
                    </div>
                </div>
            )}

            {phase === "QUESTION_ENDED" && question && distEntries && (
                <div className="flex flex-1 flex-col gap-4">
                    <Card>
                        <CardContent className="space-y-4 p-6">
                            <h3 className="text-center text-xl font-semibold md:text-2xl">
                                {question.question.text}
                            </h3>
                            <AnswerDistribution entries={distEntries} showCorrect />
                        </CardContent>
                    </Card>
                    <div className="flex justify-center">
                        <Button size="lg" onClick={showLeaderboard}>
                            Lihat Papan Skor
                        </Button>
                    </div>
                </div>
            )}

            {phase === "LEADERBOARD" && (
                <div className="flex flex-1 flex-col gap-4">
                    <Card>
                        <CardContent className="space-y-3 p-6">
                            <h3 className="flex items-center gap-2 text-lg font-semibold">
                                <Trophy className="size-5 text-yellow-500" /> Papan Skor — 5 Besar
                            </h3>
                            {leaderboard && leaderboard.top.length > 0 ? (
                                <LeaderboardRows
                                    rows={leaderboard.top.map((t, i) => ({
                                        rank: i + 1,
                                        nickname: t.nickname,
                                        score: t.score,
                                    }))}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Belum ada skor.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                    <div className="flex justify-center">
                        <Button size="lg" onClick={nextQuestion}>
                            Soal Berikutnya
                        </Button>
                    </div>
                </div>
            )}

            {phase === "FINISHED" && (
                <div className="flex flex-1 flex-col gap-4">
                    <Card>
                        <CardContent className="space-y-4 p-6">
                            <h3 className="flex items-center justify-center gap-2 text-center text-2xl font-semibold">
                                <Award className="size-6 text-yellow-500" /> Permainan Selesai
                            </h3>
                            {podium && podium.length > 0 ? (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    {podium.map((p) => (
                                        <div
                                            key={p.participantId}
                                            className={`rounded-xl border p-4 text-center ${
                                                p.rank === 1
                                                    ? "border-yellow-500 bg-yellow-500/10"
                                                    : ""
                                            }`}
                                        >
                                            <p className="text-3xl font-bold">
                                                {medal(p.rank)}
                                            </p>
                                            <p className="mt-1 font-medium">{p.nickname}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {p.score} poin · {p.correctCount} benar
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-sm text-muted-foreground">
                                    Tidak ada peserta.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button asChild>
                            <Link href={`/reports/${sessionId}`}>Lihat Laporan</Link>
                        </Button>
                        <Button variant="outline" onClick={() => router.push("/dashboard")}>
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
        <div className="grid flex-1 gap-6 md:grid-cols-2">
            <Card>
                <CardContent className="flex flex-col items-center gap-4 p-6">
                    <p className="text-sm font-medium text-muted-foreground">
                        Masuk di perangkat masing-masing
                    </p>
                    <div className="text-5xl font-bold tracking-[0.3em] tabular-nums">
                        {pin}
                    </div>
                    {joinUrl && (
                        <div className="rounded-xl border bg-white p-3">
                            <QRCodeSVG value={joinUrl} size={140} level="M" />
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

            <Card>
                <CardContent className="flex h-full flex-col gap-3 p-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium">Peserta</h3>
                        <Badge variant="secondary" className="gap-1">
                            <Users className="size-3" /> {lobby.count}
                        </Badge>
                    </div>
                    <div className="grid flex-1 grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
                        {lobby.participants.length === 0 ? (
                            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                                Menunggu peserta bergabung…
                            </p>
                        ) : (
                            lobby.participants.map((p) => (
                                <div
                                    key={p.id}
                                    className="group flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-sm"
                                >
                                    <span className="truncate">{p.nickname}</span>
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
                    className="flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                    <span className="w-6 text-center font-bold tabular-nums">
                        {r.rank}
                    </span>
                    <span className="flex-1 truncate font-medium">{r.nickname}</span>
                    <span className="tabular-nums text-muted-foreground">
                        {r.score}
                    </span>
                </div>
            ))}
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
