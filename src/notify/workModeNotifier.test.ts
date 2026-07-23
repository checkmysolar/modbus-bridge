import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { WorkModeNotifier, postWorkModeEvent } from './workModeNotifier.js';

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
      },
      0
    );

    await notifier.handleSample(sampleTelemetry(3));
    expect(fetchMock).not.toHaveBeenCalled();

    await notifier.handleSample(sampleTelemetry(3));
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
      },
      0
    );

    await notifier.handleSample(sampleTelemetry(3));
    await notifier.handleSample(sampleTelemetry(4));
    expect(fetchMock).not.toHaveBeenCalled();

    await notifier.handleSample(sampleTelemetry(4));
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
      },
      0
    );

    await expect(notifier.handleSample(sampleTelemetry(1))).resolves.toBeUndefined();
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
        { apiUrl: 'https://checkmy.solar/', bridgeToken: 'cms_bridge_test' },
        { workMode: 2, sampledAt: '2026-07-09T11:59:30.000Z' }
      )
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://checkmy.solar/api/bridge/events/work-mode',
      expect.any(Object)
    );
  });
});
