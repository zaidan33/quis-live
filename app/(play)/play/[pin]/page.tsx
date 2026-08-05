"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
    Check,
    Clock,
    Loader2,
    Trophy,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TimerBar } from "@/components/game/timer-bar";
import { ShapeIcon } from "@/components/game/shape-icon";
import { shapeOf } from "@/lib/game/shapes";
import { createGameSocket } from "@/lib/socket";
import { syncClock } from "@/lib/clock-sync";
import {
    ANSWER_ACK,
    GAME_ERROR,
    GAME_OVER,
    GAME_STATE,
    LEADERBOARD_UPDATE,
    PLAYER_ANSWER,
    PLAYER_JOIN,
    QUESTION_COUNTDOWN,
    QUESTION_END,
    QUESTION_START,
} from "@shared/events";
import type {
    GameErrorCode,
    PlayerFinalSummary,
    PlayerQuestionPayload,
    PlayerQuestionResult,
} from "@shared/types";

type Phase =
    | "lobby"
    | "countdown"
    | "question"
    | "feedback"
    | "leaderboard"
    | "finished";

type Conn =
    | { status: "connecting" }
    | { status: "error"; message: string }
    | { status: "ready"; nickname: string };

const STATE_TO_PHASE: Record<string, Phase> = {
    LOBBY: "lobby",
    COUNTDOWN: "countdown",
    QUESTION_ACTIVE: "question",
    QUESTION_ENDED: "feedback",
    LEADERBOARD: "leaderboard",
    FINISHED: "finished",
};

function playerKey(pin: string) {
    return `quis:player:${pin}`;
}

export default function PlayPage() {
    const router = useRouter();
    const params = useParams<{ pin: string }>();
    const pin = params.pin;

    const [conn, setConn] = React.useState<Conn>({ status: "connecting" });
    const [phase, setPhase] = React.useState<Phase>("lobby");
    const [kicked, setKicked] = React.useState(false);
    const [countdown, setCountdown] = React.useState<{
        n: number;
        index: number;
        total: number;
    } | null>(null);
    const [question, setQuestion] = React.useState<PlayerQuestionPayload | null>(
        null,
    );
    const [locked, setLocked] = React.useState(false);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [result, setResult] = React.useState<PlayerQuestionResult | null>(null);
    const [myRank, setMyRank] = React.useState<number | null>(null);
    const [myScore, setMyScore] = React.useState<number | null>(null);
    const [finalSummary, setFinalSummary] = React.useState<PlayerFinalSummary | null>(null);
    const [offset, setOffset] = React.useState(0);

    React.useEffect(() => {
        if (!pin) return;
        const stored = localStorage.getItem(playerKey(pin));
        let participantId: string | undefined;
        let storedName: string | undefined;
        if (stored) {
            try {
                const p = JSON.parse(stored) as {
                    participantId?: string;
                    nickname?: string;
                };
                participantId = p.participantId;
                storedName = p.nickname;
            } catch {
                /* abaikan */
            }
        }
        if (!participantId || !storedName) {
            router.replace(`/join?pin=${pin}`);
            return;
        }
        setConn({ status: "ready", nickname: storedName });

        let cancelled = false;
        let socket: ReturnType<typeof createGameSocket> | null = null;

        (async () => {
            const res = await fetch("/api/game/token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    pin,
                    nickname: storedName,
                    participantId,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.token) {
                if (!cancelled)
                    setConn({
                        status: "error",
                        message: data.error || "Gagal bergabung",
                    });
                return;
            }
            socket = createGameSocket(data.token);
            socketRef.current = socket;

            socket.on("connect", () => {
                socket!.emit(PLAYER_JOIN);
                syncClock(socket!).then((o) => !cancelled && setOffset(o));
            });
            socket.on("connect_error", (err: Error) => {
                if (!cancelled)
                    setConn({
                        status: "error",
                        message: `Koneksi gagal: ${err.message}`,
                    });
            });

            socket.on(GAME_STATE, (s: { state?: string; lobby?: unknown }) => {
                if (!cancelled) {
                    if (s.lobby) setPhase("lobby");
                    else if (s.state) setPhase(STATE_TO_PHASE[s.state] ?? "lobby");
                }
            });
            socket.on(QUESTION_COUNTDOWN, (c: { n: number; index: number; total: number }) => {
                if (cancelled) return;
                setPhase("countdown");
                setCountdown(c);
                setQuestion(null);
                setResult(null);
                setLocked(false);
                setSelectedId(null);
            });
            socket.on(QUESTION_START, (q: PlayerQuestionPayload) => {
                if (cancelled) return;
                const sameQuestion = qIdRef.current === q.question.id;
                qIdRef.current = q.question.id;
                setPhase("question");
                setQuestion(q);
                setResult(null);
                // Reconnect bisa memicu re-kirim QUESTION_START untuk soal yang sama.
                // Hanya reset pilihan bila benar-benar soal baru (PRD PLAY-6).
                if (!sameQuestion) {
                    setLocked(false);
                    setSelectedId(null);
                }
            });
            socket.on(ANSWER_ACK, (a: { received: boolean; reason?: string }) => {
                if (cancelled) return;
                if (a.received) setLocked(true);
            });
            socket.on(
                QUESTION_END,
                (p: { yourResult?: PlayerQuestionResult }) => {
                    if (cancelled) return;
                    if (p.yourResult) {
                        setResult(p.yourResult);
                        setMyRank(p.yourResult.rank);
                    }
                    setPhase("feedback");
                },
            );
            socket.on(
                LEADERBOARD_UPDATE,
                (l: { yourRank?: number; yourScore?: number }) => {
                    if (cancelled) return;
                    if (typeof l.yourRank === "number") setMyRank(l.yourRank);
                    if (typeof l.yourScore === "number") setMyScore(l.yourScore);
                    setPhase("leaderboard");
                },
            );
            socket.on(GAME_OVER, (g: { yourSummary?: PlayerFinalSummary }) => {
                if (cancelled) return;
                if (g.yourSummary) {
                    setFinalSummary(g.yourSummary);
                    setMyRank(g.yourSummary.rank);
                    setMyScore(g.yourSummary.score);
                }
                setPhase("finished");
            });
            socket.on(GAME_ERROR, (e: { code: GameErrorCode; message: string }) => {
                if (cancelled) return;
                if (e.code === "session_closed") setKicked(true);
            });
        })();

        return () => {
            cancelled = true;
            socketRef.current = null;
            socket?.removeAllListeners();
            socket?.disconnect();
        };
    }, [pin, router]);

    const socketRef = React.useRef<ReturnType<typeof createGameSocket> | null>(
        null,
    );
    const qIdRef = React.useRef<string | null>(null);

    function answer(optionId: string) {
        if (locked || !question) return;
        setSelectedId(optionId);
        setLocked(true); // optimis: kunci segera, konfirmasi via ANSWER_ACK
        socketRef.current?.emit(PLAYER_ANSWER, { optionId });
    }

    if (kicked) {
        return (
            <Center>
                <Card className="w-full max-w-sm">
                    <CardContent className="space-y-3 p-6 text-center">
                        <p className="text-lg font-semibold">Kamu dikeluarkan</p>
                        <p className="text-sm text-muted-foreground">
                            Host mengeluarkan kamu dari sesi ini.
                        </p>
                        <Button
                            className="w-full"
                            onClick={() => router.push(`/join?pin=${pin}`)}
                        >
                            Kembali ke Lobby
                        </Button>
                    </CardContent>
                </Card>
            </Center>
        );
    }

    if (conn.status === "error") {
        return (
            <Center>
                <Card className="w-full max-w-sm">
                    <CardContent className="space-y-3 p-6 text-center">
                        <p className="text-destructive">{conn.message}</p>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => router.push(`/join?pin=${pin}`)}
                        >
                            Coba Lagi
                        </Button>
                    </CardContent>
                </Card>
            </Center>
        );
    }

    if (conn.status === "connecting") {
        return (
            <Center>
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </Center>
        );
    }

    const nickname = conn.status === "ready" ? conn.nickname : "";

    if (phase === "lobby") {
        return (
            <Center>
                <Card className="w-full max-w-sm">
                    <CardContent className="space-y-4 p-8 text-center">
                        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
                        <div>
                            <p className="text-xl font-semibold">{nickname}</p>
                            <p className="text-sm text-muted-foreground">
                                Kamu sudah masuk. Tunggu host memulai permainan.
                            </p>
                        </div>
                        <div className="text-5xl">⏳</div>
                    </CardContent>
                </Card>
            </Center>
        );
    }

    if (phase === "countdown") {
        return (
            <Center>
                <div className="text-center">
                    <p className="mb-2 text-lg text-muted-foreground">
                        {countdown
                            ? `Soal ${countdown.index + 1} dari ${countdown.total}`
                            : "Bersiap…"}
                    </p>
                    <div
                        key={countdown?.n ?? 0}
                        className="animate-in fade-in zoom-in text-[9rem] font-bold leading-none text-primary"
                    >
                        {countdown?.n ?? "Mulai!"}
                    </div>
                </div>
            </Center>
        );
    }

    if (phase === "question" && question) {
        return (
            <div className="flex min-h-screen flex-col bg-background p-3">
                <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
                    <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                            Soal {question.index + 1}/{question.total}
                        </span>
                        <span className="font-medium text-foreground">{nickname}</span>
                    </div>
                    <div className="mb-3">
                        <TimerBar
                            serverStartAt={question.serverStartAt}
                            timeLimitMs={question.timeLimitMs}
                            offset={offset}
                        />
                    </div>
                    {question.question.text && (
                        <h2 className="mb-3 text-center text-2xl font-semibold">
                            {question.question.text}
                        </h2>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        {question.question.options.map((o) => {
                            const s = shapeOf(o.order);
                            const selected = selectedId === o.id;
                            return (
                                <button
                                    key={o.id}
                                    type="button"
                                    disabled={locked}
                                    onClick={() => answer(o.id)}
                                    aria-label={`${s.label}${o.text ? ` — ${o.text}` : ""}`}
                                    className="relative flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-white shadow-md transition active:scale-[0.98] disabled:cursor-default"
                                    style={{
                                        backgroundColor: s.fill,
                                        opacity: locked && !selected ? 0.45 : 1,
                                        outline:
                                            selected && locked
                                                ? `4px solid white`
                                                : "none",
                                        outlineOffset: "-4px",
                                    }}
                                >
                                    <ShapeIcon name={s.name} className="size-14 shrink-0" />
                                    {o.text && (
                                        <span className="w-full break-words text-center text-xl font-bold leading-snug">
                                            {o.text}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {locked && (
                        <p className="mt-3 text-center text-sm text-muted-foreground">
                            Jawaban terkunci. Menunggu soal selesai…
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (phase === "feedback") {
        return (
            <Center>
                <Card className="w-full max-w-sm">
                    <CardContent className="space-y-4 p-6 text-center">
                        {result?.correct ? (
                            <>
                                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-green-600 text-white">
                                    <Check className="size-9" />
                                </div>
                                <p className="text-2xl font-bold">Benar!</p>
                            </>
                        ) : (
                            <>
                                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive text-white">
                                    <X className="size-9" />
                                </div>
                                <p className="text-2xl font-bold">
                                    {selectedId ? "Belum tepat" : "Waktu habis"}
                                </p>
                            </>
                        )}
                        <div className="rounded-lg bg-muted p-3">
                            <p className="text-3xl font-bold tabular-nums">
                                +{result?.pointsAwarded ?? 0}
                            </p>
                            <p className="text-xs text-muted-foreground">poin</p>
                        </div>
                        {result && result.streakBonus > 0 && (
                            <p className="text-sm text-muted-foreground">
                                Bonus beruntun +{result.streakBonus}
                            </p>
                        )}
                        {typeof result?.rank === "number" && result.rank > 0 && (
                            <p className="flex items-center justify-center gap-1 text-sm">
                                <Trophy className="size-4 text-yellow-500" />
                                Peringkat #{result.rank}
                            </p>
                        )}
                        <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                            <Clock className="size-4" /> Menunggu soal berikutnya…
                        </p>
                    </CardContent>
                </Card>
            </Center>
        );
    }

    if (phase === "leaderboard") {
        return (
            <Center>
                <Card className="w-full max-w-sm">
                    <CardContent className="space-y-3 p-8 text-center">
                        <Trophy className="mx-auto size-10 text-yellow-500" />
                        <p className="text-sm text-muted-foreground">
                            Papan skor sementara
                        </p>
                        <p className="text-5xl font-bold tabular-nums">
                            #{myRank ?? "–"}
                        </p>
                        {myScore !== null && (
                            <p className="text-muted-foreground">{myScore} poin</p>
                        )}
                        <p className="text-sm text-muted-foreground">
                            Menunggu soal berikutnya…
                        </p>
                    </CardContent>
                </Card>
            </Center>
        );
    }

    // finished
    return (
        <Center>
            <Card className="w-full max-w-sm">
                <CardContent className="space-y-4 p-8 text-center">
                    <p className="text-lg font-semibold">Permainan Selesai</p>
                    <p className="text-sm text-muted-foreground">Terima kasih sudah bermain, {nickname}!</p>
                    <div className="rounded-lg bg-muted p-4">
                        <p className="text-sm text-muted-foreground">Peringkat akhir</p>
                        <p className="text-4xl font-bold tabular-nums">
                            #{finalSummary?.rank ?? myRank ?? "–"}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border p-3">
                            <p className="text-muted-foreground">Skor</p>
                            <p className="text-xl font-bold">
                                {finalSummary?.score ?? myScore ?? 0}
                            </p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-muted-foreground">Benar</p>
                            <p className="text-xl font-bold">
                                {finalSummary?.correctCount ?? 0}/
                                {finalSummary?.totalQuestions ?? "?"}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => router.push(`/join`)}
                    >
                        Main Lagi
                    </Button>
                </CardContent>
            </Card>
        </Center>
    );
}

function Center({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            {children}
        </div>
    );
}
