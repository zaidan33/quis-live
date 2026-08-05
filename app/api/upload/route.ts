import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getSession } from "@/lib/session";

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 5);
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./public/uploads";

const ALLOWED: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
};

export async function POST(req: Request) {
    const session = await getSession();
    if (!session?.user) {
        return NextResponse.json(
            { error: "Tidak terautentikasi" },
            { status: 401 },
        );
    }

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ error: "Body bukan form-data" }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }

    const ext = ALLOWED[file.type];
    if (!ext) {
        return NextResponse.json(
            { error: "Tipe file tidak diizinkan (hanya gambar)" },
            { status: 415 },
        );
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        return NextResponse.json(
            { error: `Ukuran melebihi ${MAX_UPLOAD_MB} MB` },
            { status: 413 },
        );
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const dir = path.resolve(process.cwd(), UPLOAD_DIR);
    await fs.mkdir(dir, { recursive: true });
    const fullPath = path.join(dir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(fullPath, buffer);

    return NextResponse.json({ url: `/uploads/${filename}` });
}
