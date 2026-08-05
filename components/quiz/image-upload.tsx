"use client";

import * as React from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ImageUpload({
    value,
    onChange,
    label = "Gambar",
    className,
}: {
    value: string | null;
    onChange: (url: string | null) => void;
    label?: string;
    className?: string;
}) {
    const [uploading, setUploading] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    async function handleFile(file: File) {
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || "Gagal mengunggah");
            }
            onChange(json.url as string);
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : "Gagal mengunggah gambar",
            );
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className={cn("space-y-2", className)}>
            {label && (
                <span className="text-sm font-medium">{label}</span>
            )}
            {value ? (
                <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={value}
                        alt={label}
                        className="max-h-40 rounded-md border object-contain"
                    />
                    <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -right-2 -top-2 size-6 rounded-full"
                        onClick={() => onChange(null)}
                        aria-label="Hapus gambar"
                    >
                        <X className="size-3" />
                    </Button>
                </div>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                >
                    {uploading ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                        <Upload className="mr-2 size-4" />
                    )}
                    Unggah Gambar
                </Button>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                }}
            />
        </div>
    );
}
