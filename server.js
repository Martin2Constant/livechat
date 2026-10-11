const http = require('node:http');
const { WebSocket, WebSocketServer } = require('ws');

function createRelayServer({ isReady = () => true, logger = console, heartbeatMs = 30000, maxBufferedBytes = 1024 * 1024 } = {}) {
    const server = http.createServer((req, res) => {
        const ready = isReady();
        res.writeHead(ready ? 200 : 503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(ready ? 'Le bot Livechat est réveillé !' : 'Le bot Discord est déconnecté.');
    });
    const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
    server.on('error', error => logger.error('Erreur du serveur HTTP :', error.message));
    wss.on('error', error => logger.error('Erreur du serveur WebSocket :', error.message));
    wss.on('connection', ws => {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('error', error => logger.error('Erreur du client WebSocket :', error.message));
    });
    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) {
            if (!ws.isAlive) { ws.terminate(); continue; }
            if (ws.readyState !== WebSocket.OPEN) continue;
            ws.isAlive = false;
            ws.ping(() => {});
        }
    }, heartbeatMs);
    heartbeat.unref();
    wss.on('close', () => clearInterval(heartbeat));

    function broadcast(payload) {
        const data = JSON.stringify(payload);
        for (const ws of wss.clients) {
            if (ws.readyState !== WebSocket.OPEN) continue;
            if (ws.bufferedAmount + Buffer.byteLength(data) > maxBufferedBytes) {
                ws.terminate();
                continue;
            }
            try {
                ws.send(data, error => {
                    if (error) {
                        logger.error('Échec d’envoi WebSocket :', error.message);
                        ws.terminate();
                    }
                });
            } catch (error) {
                logger.error('Échec d’envoi WebSocket :', error.message);
                ws.terminate();
            }
        }
    }

    function listen(port, host) {
        return new Promise((resolve, reject) => {
            const onError = error => { server.off('listening', onListening); reject(error); };
            const onListening = () => { server.off('error', onError); resolve(server.address()); };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(port, host);
        });
    }

    let closePromise;
    function close() {
        if (!closePromise) closePromise = (async () => {
            clearInterval(heartbeat);
            for (const ws of wss.clients) ws.terminate();
            await new Promise(resolve => wss.close(resolve));
            await new Promise(resolve => {
                server.close(resolve);
                server.closeAllConnections();
            });
        })();
        return closePromise;
    }
    return { listen, close, broadcast };
}

module.exports = { createRelayServer };
