import * as React from "react";
import type { ShapeName } from "@/lib/game/shapes";

/**
 * Ikon bentuk jawaban (segitiga/wajik/lingkaran/kotak) — bagian dari
 * diferensiasi aksesibilitas warna+BENTUK (PRD 6.4). Digambar sebagai SVG
 * putih agar kontras di atas tombol berwarna.
 */
export function ShapeIcon({
    name,
    className,
}: {
    name: ShapeName;
    className?: string;
}) {
    const common = {
        className,
        viewBox: "0 0 100 100",
        fill: "currentColor",
        "aria-hidden": true as const,
    };
    switch (name) {
        case "segitiga":
            return (
                <svg {...common}>
                    <polygon points="50,14 90,84 10,84" />
                </svg>
            );
        case "wajik":
            return (
                <svg {...common}>
                    <polygon points="50,8 90,50 50,92 10,50" />
                </svg>
            );
        case "lingkaran":
            return (
                <svg {...common}>
                    <circle cx="50" cy="50" r="40" />
                </svg>
            );
        case "kotak":
            return (
                <svg {...common}>
                    <rect x="12" y="12" width="76" height="76" rx="10" />
                </svg>
            );
    }
}
