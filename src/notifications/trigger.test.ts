import { describe, expect, it, vi, afterEach } from 'vitest';
import type { ModbusRealtimeTelemetry } from '@checkmysolar/modbus-telemetry';
import { createNotificationTrigger, notificationTriggerInternals } from './trigger.js';

const sampleTelemetry = (overrides: Partial<ModbusRealtimeTelemetry> = {}): ModbusRealtimeTelemetry => ({
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
  workMode: 0,
  sampledAt: '2026-07-09T11:59:30.000Z',
  ...overrides,
});

describe('notification trigger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('establishes baseline without POST on first telemetry', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const trigger = createNotificationTrigger({
      apiBaseUrl: 'https://checkmy.solar',
      bridgeToken: 'cms_bridge_test',
      enabled: true,
      verboseLogging: false,
    });

    const result = await trigger.handleTelemetry(sampleTelemetry());
    expect(result).toEqual({ triggered: false, reason: 'baseline' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs when SoC changes after baseline', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const trigger = createNotificationTrigger({
      apiBaseUrl: 'https://checkmy.solar/',
      bridgeToken: 'cms_bridge_test',
      enabled: true,
      verboseLogging: false,
    });

    await trigger.handleTelemetry(sampleTelemetry({ SoC: 85 }));
    const result = await trigger.handleTelemetry(sampleTelemetry({ SoC: 18 }));

    expect(result).toEqual({ triggered: true, reason: 'triggered' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://checkmy.solar/api/bridge/notifications/trigger',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer cms_bridge_test',
        }),
      })
    );
  });

  it('does not POST when monitored fields are unchanged', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const trigger = createNotificationTrigger({
      apiBaseUrl: 'https://checkmy.solar',
      bridgeToken: 'cms_bridge_test',
      enabled: true,
      verboseLogging: false,
    });

    await trigger.handleTelemetry(sampleTelemetry());
    const result = await trigger.handleTelemetry(sampleTelemetry());

    expect(result).toEqual({ triggered: false, reason: 'unchanged' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('detects runningState and workMode changes', () => {
    const { monitoredFieldsChanged, describeMonitoredChanges } = notificationTriggerInternals;
    expect(
      monitoredFieldsChanged(
        { soc: 50, runningState: 163, workMode: 0 },
        { soc: 50, runningState: 164, workMode: 0 }
      )
    ).toBe(true);
    expect(
      monitoredFieldsChanged(
        { soc: 50, runningState: 163, workMode: 0 },
        { soc: 50, runningState: 163, workMode: 1 }
      )
    ).toBe(true);
    expect(
      describeMonitoredChanges(
        { soc: 50, runningState: 163, workMode: 0 },
        { soc: 50, runningState: 163, workMode: 1 }
      )
    ).toEqual(['workMode 0→1']);
  });

  it('logs notification trail when verbose logging is enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const trigger = createNotificationTrigger({
      apiBaseUrl: 'https://checkmy.solar',
      bridgeToken: 'cms_bridge_test',
      enabled: true,
      verboseLogging: true,
    });

    await trigger.handleTelemetry(sampleTelemetry({ workMode: 0 }));
    await trigger.handleTelemetry(sampleTelemetry({ workMode: 1 }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logSpy).toHaveBeenCalledWith('[notifications] change detected: workMode 0→1');
    expect(logSpy).toHaveBeenCalledWith(
      '[notifications] POST https://checkmy.solar/api/bridge/notifications/trigger'
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[notifications] POST https://checkmy.solar/api/bridge/notifications/trigger 200'
    );
  });

  it('does not log notification trail when verbose logging is disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const trigger = createNotificationTrigger({
      apiBaseUrl: 'https://checkmy.solar',
      bridgeToken: 'cms_bridge_test',
      enabled: true,
      verboseLogging: false,
    });

    await trigger.handleTelemetry(sampleTelemetry({ workMode: 0 }));
    await trigger.handleTelemetry(sampleTelemetry({ workMode: 1 }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('[notifications]'));
  });
});
