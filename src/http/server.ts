import http from 'node:http';
import type { HourlyAggregator } from '../aggregation/hourlyAggregator.js';
import type { DetectedInverter } from '../modbus/profiles/types.js';
import { WorkModeWriteError } from '../modbus/workModeWrite.js';
import type { RealtimeStore } from '../storage/sqlite.js';
import { formatTelemetryPreview } from '../telemetryLog.js';
import { extractBearerToken, isAuthorized } from './auth.js';
import { buildBridgeInfoResponse } from './info.js';
import {
  buildReportResponse,
  buildReportStatusResponse,
  parseReportDate,
  parseReportDimension,
  parseReportYear,
} from './reportHandlers.js';

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

export interface BridgeHttpServerOptions {
  port: number;
  bridgeToken: string;
  bridgeVersion: string;
  siteTimezone: string;
  store: RealtimeStore;
  aggregator: HourlyAggregator;
  getDetectedInverter: () => DetectedInverter | null;
  readOnly?: boolean;
  setWorkMode?: (workMode: number) => Promise<{ workMode: number }>;
  verboseLogging?: boolean;
}

export function createBridgeHttpServer(options: BridgeHttpServerOptions): http.Server {
  const {
    port,
    bridgeToken,
    bridgeVersion,
    siteTimezone,
    store,
    aggregator,
    getDetectedInverter,
    readOnly = false,
    setWorkMode,
    verboseLogging = false,
  } = options;

  const logRequest = (method: string, route: string, status: number, detail?: string) => {
    if (!verboseLogging) {
      return;
    }
    const line = `${method} ${route} ${status}`;
    console.log(detail ? `${line} — ${detail}` : line);
  };

  const server = http.createServer((req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const path = url.pathname;
    const route = url.search ? `${path}${url.search}` : path;

    const sendJson = (body: unknown, status: number) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (method === 'GET' && path === '/v1/health') {
      logRequest(method, route, 200);
      sendJson({ status: 'ok' }, 200);
      return;
    }

    if (method === 'GET' && path === '/v1/info') {
      const bearer = extractBearerToken(req);
      if (!isAuthorized(bearer, bridgeToken)) {
        logRequest(method, route, 401);
        sendJson({ error: 'Unauthorized' }, 401);
        return;
      }

      logRequest(method, route, 200);
      sendJson(buildBridgeInfoResponse(bridgeVersion, getDetectedInverter(), { readOnly }), 200);
      return;
    }

    if (method === 'GET' && path === '/v1/realtime') {
      const bearer = extractBearerToken(req);
      if (!isAuthorized(bearer, bridgeToken)) {
        logRequest(method, route, 401);
        sendJson({ error: 'Unauthorized' }, 401);
        return;
      }

      const snapshot = store.getLatest();
      if (!snapshot) {
        logRequest(method, route, 503);
        sendJson({ error: 'No telemetry snapshot available yet' }, 503);
        return;
      }

      const preview = formatTelemetryPreview(snapshot.telemetry);
      logRequest(method, route, 200, preview || `sampledAt=${snapshot.sampledAt}`);
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

    if (method === 'GET' && path === '/v1/today-totals') {
      const bearer = extractBearerToken(req);
      if (!isAuthorized(bearer, bridgeToken)) {
        logRequest(method, route, 401);
        sendJson({ error: 'Unauthorized' }, 401);
        return;
      }

      const snapshot = store.getLatestTodayTotals();
      if (!snapshot) {
        logRequest(method, route, 503);
        sendJson({ error: 'No today totals snapshot available yet' }, 503);
        return;
      }

      logRequest(method, route, 200, `sampledAt=${snapshot.sampledAt}`);
      sendJson(
        {
          ...snapshot.totals,
          sampledAt: snapshot.sampledAt,
          receivedAt: snapshot.updatedAt,
        },
        200
      );
      return;
    }

    if (method === 'GET' && path === '/v1/report/status') {
      const bearer = extractBearerToken(req);
      if (!isAuthorized(bearer, bridgeToken)) {
        logRequest(method, route, 401);
        sendJson({ error: 'Unauthorized' }, 401);
        return;
      }

      logRequest(method, route, 200);
      sendJson(buildReportStatusResponse(aggregator, siteTimezone), 200);
      return;
    }

    if (method === 'GET' && path === '/v1/report') {
      const bearer = extractBearerToken(req);
      if (!isAuthorized(bearer, bridgeToken)) {
        logRequest(method, route, 401);
        sendJson({ error: 'Unauthorized' }, 401);
        return;
      }

      const dimension = parseReportDimension(url.searchParams.get('dimension'));
      if (!dimension) {
        logRequest(method, route, 400, 'Missing or invalid dimension');
        sendJson({ error: 'Missing or invalid dimension (day|week|month|year)' }, 400);
        return;
      }

      try {
        const report = buildReportResponse(aggregator, siteTimezone, dimension, {
          date: parseReportDate(url.searchParams.get('date')),
          year: parseReportYear(url.searchParams.get('year')),
        });
        logRequest(method, route, 200, `dimension=${dimension}`);
        sendJson(report, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to build report';
        logRequest(method, route, 500, message);
        sendJson({ error: message }, 500);
      }
      return;
    }

    if (method === 'POST' && path === '/v1/control/work-mode') {
      const bearer = extractBearerToken(req);
      if (!isAuthorized(bearer, bridgeToken)) {
        logRequest(method, route, 401);
        sendJson({ error: 'Unauthorized' }, 401);
        return;
      }

      if (readOnly) {
        logRequest(method, route, 403, 'read-only');
        sendJson({ error: 'Bridge is configured as read-only' }, 403);
        return;
      }

      if (!setWorkMode) {
        logRequest(method, route, 503);
        sendJson({ error: 'Modbus client is not connected' }, 503);
        return;
      }

      void (async () => {
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch {
          logRequest(method, route, 400, 'Invalid JSON body');
          sendJson({ error: 'Invalid JSON body' }, 400);
          return;
        }

        const workMode = (body as { workMode?: unknown }).workMode;
        if (typeof workMode !== 'number' || !Number.isInteger(workMode)) {
          logRequest(method, route, 400, 'Invalid workMode');
          sendJson({ error: 'workMode must be an integer between 0 and 5' }, 400);
          return;
        }

        try {
          const result = await setWorkMode(workMode);
          logRequest(method, route, 200, `workMode=${result.workMode}`);
          sendJson({ success: true, workMode: result.workMode }, 200);
        } catch (error) {
          if (error instanceof WorkModeWriteError) {
            if (error.code === 'UNSUPPORTED') {
              logRequest(method, route, 409, error.message);
              sendJson({ error: error.message }, 409);
              return;
            }
            logRequest(method, route, 400, error.message);
            sendJson({ error: error.message }, 400);
            return;
          }

          const message = error instanceof Error ? error.message : 'Failed to set work mode';
          if (message === 'Modbus client is not connected') {
            logRequest(method, route, 503, message);
            sendJson({ error: message }, 503);
            return;
          }

          logRequest(method, route, 500, message);
          sendJson({ error: message }, 500);
        }
      })();
      return;
    }

    logRequest(method, route, 404);
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
