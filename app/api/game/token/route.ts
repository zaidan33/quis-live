import { NextResponse } from "next/server";
import { z } from "zod";
import { signGameToken } from "@shared/token";
import { getSession } from "@/lib/session";
import { getGameSessionForHost } from "@/lib/data/game";
import {
    getActiveSessionByPin,
    getParticipantInSession,
    createParticipant,
} from "@/lib/data/game";
import {
    validateNickname,
    nicknameIssueMessage,
    NICKNAME_MIN,
    NICKNAME_MAX,
} from "@/lib/nickname";

const SECRET = process.env.GAME_TOKEN_SECRET!;
const TOKEN_TTL = 4 * 60 * 60;

const hostSchema = z.object({ sessionId: z.string().uuid() });
const playerSchema = z.object({
    pin: z.string().regex(/^\d{6}$/, "PIN harus 6 digit"),
    nickname: z.string().trim().min(NICKNAME_MIN).max(NICKNAME_MAX),
    participantId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });
    }

    // ----- Host: butuh sesi Better Auth + sessionId miliknya -----
    if (typeof body === "object" && body !== null && "sessionId" in body) {
        const parsed = hostSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
        }
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json(
                { error: "Tidak terautentikasi" },
                { status: 401 },
            );
        }
        const owned = await getGameSessionForHost(
            parsed.data.sessionId,
            session.user.id,
        );
        if (!owned) {
            return NextResponse.json(
                { error: "Sesi tidak ditemukan" },
                { status: 404 },
            );
        }
        const token = await signGameToken(
            { role: "host", sessionId: owned.id, userId: session.user.id },
            SECRET,
            TOKEN_TTL,
        );
        return NextResponse.json({ token, role: "host", sessionId: owned.id });
    }

    // ----- Peserta: PIN + nama panggilan (+ optional participantId reconnect) -----
    const parsed = playerSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Input tidak valid" },
            { status: 400 },
        );
    }
    const { pin, nickname, participantId } = parsed.data;

    const active = await getActiveSessionByPin(pin);
    if (!active) {
        return NextResponse.json(
            { error: "PIN tidak ditemukan atau sesi sudah berakhir." },
            { status: 404 },
        );
    }

    // Reconnect: participantId valid untuk sesi ini → terbitkan ulang token.
    if (participantId) {
        const existing = await getParticipantInSession(active.id, participantId);
        if (existing) {
            const token = await signGameToken(
                {
                    role: "player",
                    sessionId: active.id,
                    participantId: existing.id,
                    nickname: existing.nickname,
                },
                SECRET,
                TOKEN_TTL,
            );
            return NextResponse.json({
                token,
                role: "player",
                sessionId: active.id,
                participantId: existing.id,
                nickname: existing.nickname,
                status: active.status,
            });
        }
        // participantId tidak valid → lanjut membuat peserta baru.
    }

    const issues = validateNickname(nickname);
    if (issues.length) {
        return NextResponse.json(
            { error: nicknameIssueMessage(issues[0]) },
            { status: 422 },
        );
    }

    const created = await createParticipant(active.id, nickname.trim());
    if ("error" in created) {
        return NextResponse.json(
            { error: "Nama panggilan sudah dipakai di sesi ini." },
            { status: 409 },
        );
    }

    const token = await signGameToken(
        {
            role: "player",
            sessionId: active.id,
            participantId: created.id,
            nickname: nickname.trim(),
        },
        SECRET,
        TOKEN_TTL,
    );
    return NextResponse.json({
        token,
        role: "player",
        sessionId: active.id,
        participantId: created.id,
        nickname: nickname.trim(),
        status: active.status,
    });
}
