type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const minLevel: Level =
    (process.env.LOG_LEVEL as Level | undefined) ?? 'info';

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
    if (LEVELS[level] < LEVELS[minLevel]) return;
    const line = JSON.stringify({ level, msg, ...(meta ?? {}) });
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(line + '\n');
}

/** Logger JSON baris-tunggal (sederhana, tanpa dependensi eksternal). */
export const logger = {
    debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
