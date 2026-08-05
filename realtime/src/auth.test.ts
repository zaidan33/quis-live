import { describe, it, expect } from 'vitest';
import { signGameToken, verifyGameToken, isHostToken } from './auth';

const SECRET = 'quis-test-secret-min-32-characters-long-aaaa';

describe('game token (jose JWT)', () => {
    it('round-trip token host', async () => {
        const token = await signGameToken(
            { role: 'host', sessionId: 'ses-1', userId: 'user-1' },
            SECRET,
        );
        const payload = await verifyGameToken(token, SECRET);
        expect(payload).toMatchObject({
            role: 'host',
            sessionId: 'ses-1',
            userId: 'user-1',
        });
        expect(isHostToken(payload)).toBe(true);
    });

    it('round-trip token peserta', async () => {
        const token = await signGameToken(
            {
                role: 'player',
                sessionId: 'ses-1',
                participantId: 'part-1',
                nickname: 'Andi',
            },
            SECRET,
        );
        const payload = await verifyGameToken(token, SECRET);
        expect(payload).toMatchObject({
            role: 'player',
            sessionId: 'ses-1',
            participantId: 'part-1',
            nickname: 'Andi',
        });
    });

    it('menolak token dengan secret berbeda', async () => {
        const token = await signGameToken(
            { role: 'host', sessionId: 'ses-1', userId: 'user-1' },
            SECRET,
        );
        await expect(verifyGameToken(token, 'secret-salah')).rejects.toThrow();
    });

    it('menolak token yang sudah kadaluarsa', async () => {
        const token = await signGameToken(
            { role: 'host', sessionId: 'ses-1', userId: 'user-1' },
            SECRET,
            -10, // sudah lewat
        );
        await expect(verifyGameToken(token, SECRET)).rejects.toThrow();
    });
});
