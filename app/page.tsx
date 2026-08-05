"use client";

import Link from "next/link";
import {
    BarChart3,
    Gauge,
    MonitorPlay,
    Smartphone,
    Sparkles,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButtons, HeroAuthButtons } from "@/components/auth-buttons";

const features = [
    {
        icon: MonitorPlay,
        title: "Live bersama host",
        desc: "Tampilkan soal di layar bersama; peserta ikut dari perangkat masing-masing.",
    },
    {
        icon: Smartphone,
        title: "Tanpa akun untuk peserta",
        desc: "Cukup PIN dan nama panggilan. Hambatan masuk nol.",
    },
    {
        icon: Gauge,
        title: "Skor adil berbasis kecepatan",
        desc: "Timer & skor dihitung server, bukan browser. Tidak bisa dicurangi.",
    },
    {
        icon: BarChart3,
        title: "Laporan instan",
        desc: "Distribusi jawaban, peringkat, dan soal tersulit langsung setelah main.",
    },
    {
        icon: Users,
        title: "Skala kelas besar",
        desc: "Dirancang untuk ratusan peserta dalam satu sesi.",
    },
    {
        icon: Sparkles,
        title: "Bisa di-self-host",
        desc: "Data di kendali Anda. Jalankan di VPS sendiri dengan Docker.",
    },
];

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
            <div className="text-center py-12 sm:py-20 relative px-4">
                <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <AuthButtons />
                        <ThemeToggle />
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-4 mb-6">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-premium">
                        <Sparkles className="size-8" />
                    </div>
                    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight font-parkinsans text-gradient-brand">
                        Quis
                    </h1>
                </div>
                <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto px-4 mb-10">
                    Platform kuis interaktif real-time. Buat kuis, mainkan
                    live, dan lihat hasilnya — tanpa biaya per peserta.
                </p>

                <HeroAuthButtons />
            </div>

            <main className="container mx-auto px-4 sm:px-6 pb-16 max-w-5xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {features.map((f) => (
                        <div
                            key={f.title}
                            className="rounded-2xl border bg-card p-6 text-left shadow-premium transition-all duration-200 hover:-translate-y-1 hover:shadow-premium-lg"
                        >
                            <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-brand-gradient-soft text-primary">
                                <f.icon className="size-5" />
                            </div>
                            <h3 className="font-semibold mb-1">{f.title}</h3>
                            <p className="text-sm text-muted-foreground">
                                {f.desc}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="mt-10 text-center">
                    <Button asChild size="lg">
                        <Link href="/sign-up">Mulai Gratis</Link>
                    </Button>
                </div>
            </main>
        </div>
    );
}
