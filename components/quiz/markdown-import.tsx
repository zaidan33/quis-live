"use client";

import * as React from "react";
import { FileUp, X, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { parseMarkdownQuiz, type ImportedQuestion } from "@/lib/md-import";

interface MarkdownImportProps {
    onImport: (questions: ImportedQuestion[]) => void;
}

/** Contoh format yang ditampilkan di dialog. */
const SAMPLE_MD = `## Soal 1
Apa satuan gaya dalam SI?

- [x] Newton
- [ ] Joule
- [ ] Watt

<!-- waktu: 30 | poin: standar -->

## Soal 2
Air mendidih pada suhu 100°C?

- [x] Benar
- [ ] Salah
`;

/**
 * Dialog impor soal dari Markdown: unggah file .md atau tempel teks.
 * Parse di klien, tampilkan pratinjau, lalu kirim ke editor.
 */
export function MarkdownImport({ onImport }: MarkdownImportProps) {
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState("");
    const fileRef = React.useRef<HTMLInputElement>(null);
    const [preview, setPreview] = React.useState<{
        ok: ImportedQuestion[];
        errors: string[];
    } | null>(null);
    const [fileName, setFileName] = React.useState("");

    function runParse(md: string) {
        setText(md);
        const r = parseMarkdownQuiz(md);
        setPreview({ ok: r.questions, errors: r.errors });
    }

    function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (!f) return;
        setFileName(f.name);
        const reader = new FileReader();
        reader.onload = () => runParse(String(reader.result ?? ""));
        reader.readAsText(f);
    }

    function handleImport() {
        if (!preview || preview.ok.length === 0) return;
        onImport(preview.ok);
        setOpen(false);
        setText("");
        setPreview(null);
        setFileName("");
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" type="button">
                    <FileUp className="mr-2 size-4" />
                    Impor dari Markdown
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Impor Soal dari Markdown</DialogTitle>
                    <DialogDescription>
                        Unggah file <code className="text-xs">.md</code> atau
                        tempel teks. Tiap soal dimulai dengan{" "}
                        <code className="text-xs">## Soal N</code>, opsi pakai{" "}
                        <code className="text-xs">- [x]</code> untuk jawaban
                        benar.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".md,.markdown,.txt"
                        className="hidden"
                        onChange={onFile}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => fileRef.current?.click()}
                    >
                        <FileUp className="mr-2 size-4" />
                        {fileName || "Pilih file .md"}
                    </Button>

                    <Textarea
                        value={text}
                        onChange={(e) => runParse(e.target.value)}
                        placeholder={SAMPLE_MD}
                        rows={10}
                        className="font-mono text-xs"
                    />

                    {preview ? (
                        <div className="space-y-2 text-sm">
                            {preview.ok.length > 0 && (
                                <p className="flex items-center gap-2 text-emerald-600">
                                    <CheckCircle2 className="size-4" />
                                    {preview.ok.length} soal siap diimpor
                                </p>
                            )}
                            {preview.errors.map((err, i) => (
                                <p
                                    key={i}
                                    className="flex items-start gap-2 text-amber-600"
                                >
                                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                    {err}
                                </p>
                            ))}
                        </div>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setOpen(false)}
                    >
                        <X className="mr-2 size-4" />
                        Batal
                    </Button>
                    <Button
                        type="button"
                        onClick={handleImport}
                        disabled={!preview || preview.ok.length === 0}
                    >
                        <FileUp className="mr-2 size-4" />
                        Tambah {preview?.ok.length ?? 0} Soal
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
