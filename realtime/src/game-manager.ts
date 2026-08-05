import type { Server } from 'socket.io';
import { GameRoom } from './game-room';
import { logger } from './logger';

/**
 * Registry semua game aktif di memori realtime (IMPLEMENTATION_PLAN 2.3).
 * State otoritatif hidup di sini; database ditulis hanya pada checkpoint
 * (peserta join, soal ditutup, game selesai) — bukan per jawaban.
 *
 * Fase 0: kerangka. Pembuatan & pembersihan room dihidupkan di Fase 2.
 */
export class GameManager {
    private rooms = new Map<string, GameRoom>();

    constructor(private io: Server) {}

    getOrCreate(sessionId: string): GameRoom {
        let room = this.rooms.get(sessionId);
        if (!room) {
            room = new GameRoom(this.io, sessionId);
            this.rooms.set(sessionId, room);
            logger.info('game room dibuat', { sessionId });
        }
        return room;
    }

    get(sessionId: string): GameRoom | undefined {
        return this.rooms.get(sessionId);
    }

    remove(sessionId: string): void {
        this.rooms.delete(sessionId);
        logger.info('game room dihapus', { sessionId });
    }

    size(): number {
        return this.rooms.size;
    }
}
