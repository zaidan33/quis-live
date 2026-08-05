import { describe, it, expect } from 'vitest';
import {
    HOST_START_GAME,
    PLAYER_ANSWER,
    QUESTION_START,
    GAME_ERROR,
    HOST_EVENTS,
    PLAYER_EVENTS,
    ANSWER_LATENCY_TOLERANCE_MS,
} from './events';

describe('kontrak event socket', () => {
    it('nama event stabil dan sesuai konvensi', () => {
        expect(HOST_START_GAME).toBe('host:start_game');
        expect(PLAYER_ANSWER).toBe('player:answer');
        expect(QUESTION_START).toBe('question:start');
        expect(GAME_ERROR).toBe('game:error');
    });

    it('daftar event host & peserta tidak tumpang tindih', () => {
        const playerEvents = PLAYER_EVENTS as readonly string[];
        const overlap = HOST_EVENTS.filter((e) => playerEvents.includes(e));
        expect(overlap).toEqual([]);
    });

    it('toleransi latensi jawaban = 500 ms (PRD 5.5)', () => {
        expect(ANSWER_LATENCY_TOLERANCE_MS).toBe(500);
    });
});
