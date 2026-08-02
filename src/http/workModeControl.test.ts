import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkModeWriteError } from '../modbus/workModeWrite.js';
import { createBridgeHttpServer } from './server.js';

describe('POST /v1/control/work-mode', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
      server = null;
    }
  });

  async function startServer(
    setWorkMode?: (
      workMode: number,
      options?: { forcePowerW?: number }
    ) => Promise<{ workMode: number }>,
    options: { readOnly?: boolean } = {}
  ) {
    server = createBridgeHttpServer({
      port: 0,
      bridgeToken: 'secret',
      bridgeVersion: 'test',
      siteTimezone: 'Europe/London',
      store: {} as never,
      aggregator: {} as never,
      getDetectedInverter: () => null,
      readOnly: options.readOnly,
      setWorkMode,
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP port');
    }
    return `http://127.0.0.1:${address.port}/v1/control/work-mode`;
  }

  it('requires auth', async () => {
    const url = await startServer(vi.fn());

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workMode: 0 }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 503 when modbus is not connected', async () => {
    const url = await startServer();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workMode: 0 }),
    });

    expect(response.status).toBe(503);
  });

  it('returns 400 for invalid workMode', async () => {
    const url = await startServer(vi.fn());

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workMode: 'SelfUse' }),
    });

    expect(response.status).toBe(400);
  });

  it('returns 409 for unsupported profiles', async () => {
    const url = await startServer(async () => {
      throw new WorkModeWriteError('unsupported', 'UNSUPPORTED');
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workMode: 0 }),
    });

    expect(response.status).toBe(409);
  });

  it('returns 403 when bridge is read-only', async () => {
    const setWorkMode = vi.fn(async (workMode: number) => ({ workMode }));
    const url = await startServer(setWorkMode, { readOnly: true });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workMode: 0 }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Bridge is configured as read-only',
    });
    expect(setWorkMode).not.toHaveBeenCalled();
  });

  it('returns success payload when write succeeds', async () => {
    const setWorkMode = vi.fn(async (workMode: number) => ({ workMode }));
    const url = await startServer(setWorkMode);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workMode: 2 }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, workMode: 2 });
    expect(setWorkMode).toHaveBeenCalledWith(2, undefined);
  });

  it('returns 400 for force mode without forcePowerW', async () => {
    const setWorkMode = vi.fn(async (workMode: number) => ({ workMode }));
    const url = await startServer(setWorkMode);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workMode: 3 }),
    });

    expect(response.status).toBe(400);
    expect(setWorkMode).not.toHaveBeenCalled();
  });

  it('returns success for force mode when forcePowerW is provided', async () => {
    const setWorkMode = vi.fn(async (workMode: number, options?: { forcePowerW?: number }) => ({
      workMode,
    }));
    const url = await startServer(setWorkMode);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workMode: 3, forcePowerW: 2500 }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, workMode: 3 });
    expect(setWorkMode).toHaveBeenCalledWith(3, { forcePowerW: 2500 });
  });
});
