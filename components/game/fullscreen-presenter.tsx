"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Expand, LogOut, Minimize } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Presenter } from "./presenter";

/**
 * Pembungkus Presenter untuk mode layar penuh ("page pop up"):
 * - Tombol fullscreen (requestFullscreen API) dengan toggle ikon.
 * - Tombol keluar yang menutup popup atau kembali ke dashboard.
 * Tidak memakai layout (host) — jadi bebas sidebar, murni konten.
 */
export function FullscreenPresenter({
    sessionId,
    pin,
    quizTitle,
}: {
    sessionId: string;
    pin: string;
    quizTitle: string;
}) {
    const router = useRouter();
    const [isFullscreen, setIsFullscreen] = React.useState(false);

    React.useEffect(() => {
        function onFsChange() {
            setIsFullscreen(Boolean(document.fullscreenElement));
        }
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }
        } catch {
            /* fullscreen ditolak browser — abaikan */
        }
    }

    function leave() {
        if (window.opener) {
            // Dibuka sebagai popup — tutup popup, fokus ke dashboard.
            window.close();
        } else {
            router.push("/dashboard");
        }
    }

    return (
        <div className="flex h-screen flex-col bg-background">
            <div className="flex items-center justify-between border-b bg-card/60 px-4 py-2.5 backdrop-blur">
                <div className="flex items-center gap-3">
                    <span className="font-semibold tracking-tight">{quizTitle}</span>
                    <span className="rounded-lg bg-brand-gradient-soft px-2 py-0.5 text-sm font-semibold tabular-nums text-primary">
                        PIN {pin}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleFullscreen}
                        title={
                            isFullscreen
                                ? "Keluar layar penuh"
                                : "Tampilkan layar penuh"
                        }
                    >
                        {isFullscreen ? (
                            <Minimize className="mr-2 size-4" />
                        ) : (
                            <Expand className="mr-2 size-4" />
                        )}
                        {isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={leave}>
                        <LogOut className="mr-2 size-4" />
                        Keluar
                    </Button>
                </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
                <Presenter sessionId={sessionId} pin={pin} quizTitle={quizTitle} />
            </div>
        </div>
    );
}
