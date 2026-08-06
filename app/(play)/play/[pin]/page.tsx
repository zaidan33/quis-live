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
import { cn } from "@/lib/utils";
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
    | { status: "reconnecting"; nickname: string }
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
                setConn((c): Conn => {
                    if (c.status === "error" || c.status === "reconnecting") {
                        return { status: "ready", nickname: storedName ?? "" };
                    }
                    return c;
                });
                socket!.emit(PLAYER_JOIN);
                syncClock(socket!).then((o) => !cancelled && setOffset(o));
            });
            socket.on("disconnect", (reason) => {
                // Reconnect otomatis aktif; jangan tampilkan layar error permanen.
                // Hanya tandai status agar UI bisa menampilkan "menghubungkan kembali".
                if (!cancelled && reason !== "io client disconnect")
                    setConn((c): Conn =>
                        c.status === "ready"
                            ? { status: "reconnecting", nickname: storedName ?? "" }
                            : c,
                    );
            });
            socket.on("connect_error", (err: Error) => {
                // Auto-reconnect akan terus mencoba; jangan render layar error.
                if (!cancelled)
                    setConn((c): Conn =>
                        c.status === "ready"
                            ? { status: "reconnecting", nickname: storedName ?? "" }
                            : c,
                    );
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
                <Card className="w-full max-w-sm rounded-2xl shadow-premium">
                    <CardContent className="space-y-3 p-6 text-center">
                        <p className="text-lg font-bold tracking-tight">
                            Kamu dikeluarkan
                        </p>
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

    if (conn.status === "reconnecting") {
        return (
            <Center>
                <Card className="w-full max-w-sm">
                    <CardContent className="space-y-4 p-8 text-center">
                        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
                        <p className="text-lg font-semibold">
                            Menghubungkan kembali…
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Koneksi terputus. Mencoba menyambung ulang secara
                            otomatis — skor kamu aman.
                        </p>
                        <div className="text-4xl">📶</div>
                    </CardContent>
                </Card>
            </Center>
        );
    }

    if (conn.status === "error") {
        return (
            <Center>
                <Card className="w-full max-w-sm rounded-2xl shadow-premium">
                    <CardContent className="space-y-3 p-6 text-center">
                        <p className="font-medium text-destructive">
                            {conn.message}
                        </p>
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
                <Card className="w-full max-w-sm rounded-2xl shadow-premium">
                    <CardContent className="space-y-4 p-8 text-center">
                        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
                        <div>
                            <p className="text-xl font-bold tracking-tight">
                                {nickname}
                            </p>
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
                    <p className="mb-3 text-lg text-muted-foreground">
                        {countdown
                            ? `Soal ${countdown.index + 1} dari ${countdown.total}`
                            : "Bersiap…"}
                    </p>
                    <div
                        key={countdown?.n ?? 0}
                        className="animate-in fade-in zoom-in text-[9rem] font-black leading-none text-primary md:text-[12rem]"
                        style={{ textShadow: "0 12px 40px -8px var(--primary)" }}
                    >
                        {countdown?.n ?? "Mulai!"}
                    </div>
                </div>
            </Center>
        );
    }

    if (phase === "question" && question) {
        return (
            <div className="dark flex h-dvh flex-col bg-stage p-3">
                <div className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col">
                    <div className="mb-2 flex shrink-0 items-center justify-between text-sm text-white/70">
                        <span className="tabular-nums">
                            Soal {question.index + 1}/{question.total}
                        </span>
                        <span className="font-medium text-white">{nickname}</span>
                    </div>
                    <div className="mb-3 shrink-0">
                        <TimerBar
                            serverStartAt={question.serverStartAt}
                            timeLimitMs={question.timeLimitMs}
                            offset={offset}
                        />
                    </div>
                    {question.question.text && (
                        <h2 className="mb-4 min-h-0 flex-1 content-center text-center text-2xl font-bold leading-snug text-white md:text-3xl">
                            {question.question.text}
                        </h2>
                    )}
                    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3">
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
                                    className={cn(
                                        "relative flex min-h-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl p-3 text-white shadow-premium-lg transition-all duration-150 active:scale-95 disabled:cursor-default",
                                        selected && locked && "scale-[1.03] ring-4 ring-white",
                                    )}
                                    style={{
                                        backgroundImage: `linear-gradient(135deg, ${s.fill}, ${s.fillStrong})`,
                                        opacity: locked && !selected ? 0.4 : 1,
                                    }}
                                >
                                    <ShapeIcon
                                        name={s.name}
                                        className="size-10 shrink-0 drop-shadow md:size-12"
                                    />
                                    {o.text && (
                                        <span className="w-full break-words text-center text-base font-bold leading-snug md:text-lg">
                                            {o.text}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {locked && (
                        <p className="mt-2 shrink-0 text-center text-sm text-white/70">
                            Jawaban terkunci. Menunggu soal selesai…
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (phase === "feedback") {
        const correct = result?.correct;
        return (
            <div
                className={cn(
                    "dark flex min-h-screen items-center justify-center p-4",
                    correct
                        ? "bg-gradient-to-b from-emerald-500 to-emerald-700"
                        : "bg-gradient-to-b from-rose-500 to-rose-700",
                )}
            >
                <Card className="w-full max-w-sm rounded-3xl border-0 shadow-premium-lg">
                    <CardContent className="space-y-5 p-8 text-center">
                        {correct ? (
                            <>
                                <div className="mx-auto flex size-20 animate-pop items-center justify-center rounded-full bg-white text-emerald-600 shadow-lg">
                                    <Check className="size-11" strokeWidth={3} />
                                </div>
                                <p className="text-3xl font-extrabold tracking-tight text-white">
                                    Benar!
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="mx-auto flex size-20 animate-shake items-center justify-center rounded-full bg-white text-rose-600 shadow-lg">
                                    <X className="size-11" strokeWidth={3} />
                                </div>
                                <p className="text-3xl font-extrabold tracking-tight text-white">
                                    {selectedId ? "Belum tepat" : "Waktu habis"}
                                </p>
                            </>
                        )}
                        <div className="animate-count-pop rounded-2xl bg-white/15 p-4 backdrop-blur">
                            <p className="text-4xl font-black tabular-nums text-white">
                                +{result?.pointsAwarded ?? 0}
                            </p>
                            <p className="text-xs font-medium uppercase tracking-wide text-white/80">
                                poin
                            </p>
                        </div>
                        {result && result.streakBonus > 0 && (
                            <p className="text-sm font-medium text-white/90">
                                🔥 Bonus beruntun +{result.streakBonus}
                            </p>
                        )}
                        {typeof result?.rank === "number" && result.rank > 0 && (
                            <p className="flex items-center justify-center gap-1 text-sm font-semibold text-white/90">
                                <Trophy className="size-4 text-amber-200" />
                                Peringkat #{result.rank}
                            </p>
                        )}
                        <p className="flex items-center justify-center gap-1 text-sm text-white/70">
                            <Clock className="size-4" /> Menunggu soal berikutnya…
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (phase === "leaderboard") {
        return (
            <Center>
                <Card className="w-full max-w-sm rounded-2xl shadow-premium">
                    <CardContent className="space-y-3 p-8 text-center">
                        <Trophy className="mx-auto size-12 text-amber-400" />
                        <p className="text-sm font-medium text-muted-foreground">
                            Papan skor sementara
                        </p>
                        <p className="text-6xl font-black tabular-nums text-gradient-brand">
                            #{myRank ?? "–"}
                        </p>
                        {myScore !== null && (
                            <p className="font-medium text-muted-foreground">
                                {myScore} poin
                            </p>
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
            <Card className="w-full max-w-sm rounded-2xl shadow-premium">
                <CardContent className="space-y-5 p-8 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-premium">
                        <Trophy className="size-7 text-amber-200" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-lg font-bold tracking-tight">
                            Permainan Selesai
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Terima kasih sudah bermain, {nickname}!
                        </p>
                    </div>
                    <div className="rounded-2xl bg-brand-gradient-soft p-4">
                        <p className="text-sm font-medium text-muted-foreground">
                            Peringkat akhir
                        </p>
                        <p className="text-5xl font-black tabular-nums text-gradient-brand">
                            #{finalSummary?.rank ?? myRank ?? "–"}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border bg-card p-3">
                            <p className="text-muted-foreground">Skor</p>
                            <p className="text-xl font-bold tabular-nums">
                                {finalSummary?.score ?? myScore ?? 0}
                            </p>
                        </div>
                        <div className="rounded-xl border bg-card p-3">
                            <p className="text-muted-foreground">Benar</p>
                            <p className="text-xl font-bold tabular-nums">
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
        <div className="flex min-h-screen items-center justify-center bg-aurora p-4">
            {children}
        </div>
    );
}
