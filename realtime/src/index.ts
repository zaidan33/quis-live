import http from "node:http";
import { Server } from "socket.io";
import { env } from "./config";
import { logger } from "./logger";
import { setupRealtime } from "./setup";

/** HTTP server dengan endpoint health check; Socket.IO menempel di atasnya. */
const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
            JSON.stringify({
                ok: true,
                service: "quis-realtime",
                rooms: gameManager.size(),
            }),
        );
        return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
});

const io = new Server(httpServer, {
    cors: {
        origin: env.corsOrigin === "*" ? true : env.corsOrigin,
        methods: ["GET", "POST"],
    },
    path: "/socket.io",
});

export const gameManager = setupRealtime(io, env.gameTokenSecret);

httpServer.listen(env.port, () => {
    logger.info("quis realtime mendengarkan", { port: env.port });
});

function shutdown(signal: string): void {
    logger.info("mematikan realtime", { signal });
    io.close(() => {
        httpServer.close(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
