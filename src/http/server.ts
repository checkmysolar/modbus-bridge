import http from 'node:http';
import type { RealtimeStore } from '../storage/sqlite.js';
import { extractBearerToken, isAuthorized } from './auth.js';

export interface BridgeHttpServerOptions {
  port: number;
  bridgeToken: string;
  store: RealtimeStore;
}

export function createBridgeHttpServer(options: BridgeHttpServerOptions): http.Server {
  const { port, bridgeToken, store } = options;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const path = url.pathname;

    const sendJson = (body: unknown, status: number) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && path === '/v1/health') {
      sendJson({ status: 'ok' }, 200);
      return;
    }

    if (req.method === 'GET' && path === '/v1/realtime') {
      const bearer = extractBearerToken(req);
      if (!isAuthorized(bearer, bridgeToken)) {
        sendJson({ error: 'Unauthorized' }, 401);
        return;
      }

      const snapshot = store.getLatest();
      if (!snapshot) {
        sendJson({ error: 'No telemetry snapshot available yet' }, 503);
        return;
      }

      sendJson(
        {
          ...snapshot.telemetry,
          sampledAt: snapshot.sampledAt,
          receivedAt: snapshot.updatedAt,
        },
        200
      );
      return;
    }

    sendJson({ error: 'Not Found' }, 404);
  });

  return server;
}

export function startBridgeHttpServer(options: BridgeHttpServerOptions): http.Server {
  const server = createBridgeHttpServer(options);
  server.listen(options.port, '0.0.0.0', () => {
    console.log(`Bridge HTTP server listening on 0.0.0.0:${options.port}`);
  });
  return server;
}
