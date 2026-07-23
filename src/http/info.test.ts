import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { DetectedInverter } from '../modbus/profiles/types.js';
import { buildBridgeInfoResponse } from './info.js';
import { createBridgeHttpServer } from './server.js';

describe('bridge info endpoint', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
      server = null;
    }
  });

  it('buildBridgeInfoResponse includes detected inverter metadata', () => {
    const detected: DetectedInverter = {
      modelId: 'H3_SMART',
      modelName: 'H3-10.0-Smart',
      profileId: 'h3Modern',
      connectionType: 'aux',
      firmwareVariant: 'default',
      managerVersion: '1.2C',
    };

    expect(buildBridgeInfoResponse('1.0.0', detected)).toEqual({
      bridgeVersion: '1.0.0',
      inverter: {
        inverterModel: 'H3-10.0-Smart',
        modelId: 'H3_SMART',
        profileId: 'h3Modern',
        connectionType: 'aux',
        managerVersion: '1.2C',
        firmwareVariant: 'default',
      },
    });
  });

  it('GET /v1/health stays lightweight', async () => {
    server = createBridgeHttpServer({
      port: 0,
      bridgeToken: 'secret',
      bridgeVersion: 'test',
      siteTimezone: 'Europe/London',
      store: {} as never,
      aggregator: {} as never,
      getDetectedInverter: () => null,
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('GET /v1/info requires auth and returns bridge metadata', async () => {
    const detected: DetectedInverter = {
      modelId: 'KH',
      modelName: 'KH10',
      profileId: 'kh',
      connectionType: 'lan',
      firmwareVariant: 'khPre133',
      managerVersion: '1.32',
    };

    server = createBridgeHttpServer({
      port: 0,
      bridgeToken: 'secret',
      bridgeVersion: 'test',
      siteTimezone: 'Europe/London',
      store: {} as never,
      aggregator: {} as never,
      getDetectedInverter: () => detected,
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}/v1/info`;

    const unauthorized = await fetch(baseUrl);
    expect(unauthorized.status).toBe(401);

    const response = await fetch(baseUrl, {
      headers: { Authorization: 'Bearer secret' },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      bridgeVersion: 'test',
      inverter: {
        inverterModel: 'KH10',
        modelId: 'KH',
        profileId: 'kh',
        connectionType: 'lan',
        managerVersion: '1.32',
        firmwareVariant: 'khPre133',
      },
    });
  });
});
