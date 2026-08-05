"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NICKNAME_MIN, NICKNAME_MAX } from "@/lib/nickname";

function playerKey(pin: string) {
    return `quis:player:${pin}`;
}

function JoinForm() {
    const router = useRouter();
    const sp = useSearchParams();
    const [pin, setPin] = React.useState(sp.get("pin") ?? "");
    const [nickname, setNickname] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const cleanPin = pin.trim();
        const cleanName = nickname.trim();
        if (!/^\d{6}$/.test(cleanPin)) {
            setError("PIN harus 6 digit.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/game/token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ pin: cleanPin, nickname: cleanName }),
            });
            const data = await res.json();
            if (!res.ok || !data.token) {
                setError(data.error || "Gagal bergabung.");
                return;
            }
            localStorage.setItem(
                playerKey(cleanPin),
                JSON.stringify({
                    participantId: data.participantId,
                    nickname: data.nickname,
                    sessionId: data.sessionId,
                }),
            );
            router.push(`/play/${cleanPin}`);
        } catch {
            setError("Gagal menghubungi server.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-aurora px-4 py-10">
            <Card className="w-full max-w-sm rounded-2xl border-border/70 shadow-premium">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-premium">
                        <Sparkles className="size-7" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">
                        Gabung Kuis
                    </CardTitle>
                    <CardDescription>
                        Masukkan PIN dan nama panggilan Anda
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="pin">PIN Kuis</Label>
                            <Input
                                id="pin"
                                inputMode="numeric"
                                placeholder="000000"
                                value={pin}
                                onChange={(e) =>
                                    setPin(
                                        e.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, 6),
                                    )
                                }
                                className="text-center text-2xl tracking-[0.4em]"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="nickname">Nama Panggilan</Label>
                            <Input
                                id="nickname"
                                placeholder={`Min ${NICKNAME_MIN}–maks ${NICKNAME_MAX} karakter`}
                                value={nickname}
                                maxLength={NICKNAME_MAX}
                                onChange={(e) => setNickname(e.target.value)}
                                required
                            />
                        </div>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Menghubungkan…
                                </>
                            ) : (
                                "Masuk"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

export default function JoinPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center bg-aurora">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
            }
        >
            <JoinForm />
        </Suspense>
    );
}
