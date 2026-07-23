import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import {
  WorkModeNotifier,
  type WorkModeNotifyStateStore,
  postWorkModeEvent,
} from './workModeNotifier.js';

function sampleTelemetry(workMode: number): ModbusRealtimeTelemetry {
  return {
    loadsPower: 2.88,
    pvPower: 3.5,
    pv1Power: 2,
    pv2Power: 1.5,
    pvStringCount: 2,
    pvStringPowers: { pv1Power: 2, pv2Power: 1.5 },
    feedinPower: 1.2,
    gridConsumptionPower: 0,
    batChargePower: 0,
    batDischargePower: 0.5,
    SoC: 85,
    ResidualEnergy: 10.5,
    batVoltage: 51.2,
    batCurrent: -1,
    batTemperature: 28,
    gridVoltage: 230,
    gridCurrent: 5,
    gridFrequency: 50,
    meterPower2: 0.1,
    ambientTemperature: 25,
    deviceTemperature: 45,
    runningState: 163,
    isOffGrid: false,
    epsPower: 0,
    epsPowerR: 0,
    epsVoltR: 240,
    epsCurrentR: 0,
    workMode,
    sampledAt: '2026-07-09T11:59:30.000Z',
  };
}

function createStateStore(initialWorkMode?: number): WorkModeNotifyStateStore {
  let lastEmittedWorkMode = initialWorkMode;
  return {
    getLastEmittedWorkMode: () => lastEmittedWorkMode,
    setLastEmittedWorkMode: (workMode) => {
      lastEmittedWorkMode = workMode;
    },
  };
}

async function flushNotifications(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('WorkModeNotifier', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires stable polls before posting a work mode change', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const notifier = new WorkModeNotifier(
      {
        apiUrl: 'https://checkmy.solar',
        bridgeToken: 'cms_bridge_test',
        debouncePolls: 2,
        timeoutMs: 5_000,
      },
      createStateStore(0)
    );

    notifier.handleSample(sampleTelemetry(3));
    await flushNotifications();
    expect(fetchMock).not.toHaveBeenCalled();

    notifier.handleSample(sampleTelemetry(3));
    await flushNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://checkmy.solar/api/bridge/events/work-mode',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer cms_bridge_test',
        }),
        body: JSON.stringify({
          workMode: 3,
          sampledAt: '2026-07-09T11:59:30.000Z',
          previousWorkMode: 0,
          soc: 85,
        }),
      })
    );
  });

  it('resets debounce when the pending mode changes before stability', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const notifier = new WorkModeNotifier(
      {
        apiUrl: 'https://checkmy.solar',
        bridgeToken: 'cms_bridge_test',
        debouncePolls: 2,
        timeoutMs: 5_000,
      },
      createStateStore(0)
    );

    notifier.handleSample(sampleTelemetry(3));
    notifier.handleSample(sampleTelemetry(4));
    await flushNotifications();
    expect(fetchMock).not.toHaveBeenCalled();

    notifier.handleSample(sampleTelemetry(4));
    await flushNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          workMode: 4,
          sampledAt: '2026-07-09T11:59:30.000Z',
          previousWorkMode: 0,
          soc: 85,
        }),
      })
    );
  });

  it('does not fail the poll loop when the API rejects the event', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }));

    const notifier = new WorkModeNotifier(
      {
        apiUrl: 'https://checkmy.solar',
        bridgeToken: 'cms_bridge_test',
        debouncePolls: 1,
        timeoutMs: 5_000,
      },
      createStateStore(0)
    );

    notifier.handleSample(sampleTelemetry(1));
    await flushNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed post when the mode is still unchanged', async () => {
    const fetchMock = vi.mocked(fetch);
    let resolveFirst: ((response: Response) => void) | undefined;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const stateStore = createStateStore(0);
    const notifier = new WorkModeNotifier(
      {
        apiUrl: 'https://checkmy.solar',
        bridgeToken: 'cms_bridge_test',
        debouncePolls: 1,
        timeoutMs: 5_000,
      },
      stateStore
    );

    notifier.handleSample(sampleTelemetry(3));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const firstRequest = fetchMock.mock.results[0]?.value as Promise<Response>;
    resolveFirst!(new Response('bad request', { status: 400 }));
    await firstRequest;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stateStore.getLastEmittedWorkMode()).toBe(0);

    notifier.handleSample(sampleTelemetry(3));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(stateStore.getLastEmittedWorkMode()).toBe(3));
  });

  it('does not post duplicate notifications while a request is in flight', async () => {
    const fetchMock = vi.mocked(fetch);
    let resolveFetch: (() => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = () => resolve(new Response(null, { status: 204 }));
        })
    );

    const notifier = new WorkModeNotifier(
      {
        apiUrl: 'https://checkmy.solar',
        bridgeToken: 'cms_bridge_test',
        debouncePolls: 1,
        timeoutMs: 5_000,
      },
      createStateStore(0)
    );

    notifier.handleSample(sampleTelemetry(3));
    await flushNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    notifier.handleSample(sampleTelemetry(3));
    await flushNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.();
    await flushNotifications();
  });

  it('restores last emitted work mode from persistent state on startup', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const stateStore = createStateStore(0);
    const notifier = new WorkModeNotifier(
      {
        apiUrl: 'https://checkmy.solar',
        bridgeToken: 'cms_bridge_test',
        debouncePolls: 1,
        timeoutMs: 5_000,
      },
      stateStore
    );

    notifier.handleSample(sampleTelemetry(3));
    await flushNotifications();
    expect(stateStore.getLastEmittedWorkMode()).toBe(3);

    const restartedNotifier = new WorkModeNotifier(
      {
        apiUrl: 'https://checkmy.solar',
        bridgeToken: 'cms_bridge_test',
        debouncePolls: 1,
        timeoutMs: 5_000,
      },
      stateStore
    );

    restartedNotifier.handleSample(sampleTelemetry(3));
    await flushNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('postWorkModeEvent', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts 204 responses', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      postWorkModeEvent(
        { apiUrl: 'https://checkmy.solar/', bridgeToken: 'cms_bridge_test', timeoutMs: 5_000 },
        { workMode: 2, sampledAt: '2026-07-09T11:59:30.000Z' }
      )
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://checkmy.solar/api/bridge/events/work-mode',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });
});
