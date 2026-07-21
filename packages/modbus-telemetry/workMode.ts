/** Unified work-mode codes used in realtime payloads and UI labels. */
export const WORK_MODE_SELF_USE = 0;
export const WORK_MODE_FEED_IN = 1;
export const WORK_MODE_BACKUP = 2;
export const WORK_MODE_FORCE_CHARGE = 3;
export const WORK_MODE_FORCE_DISCHARGE = 4;
export const WORK_MODE_PEAK_SHAVING = 5;

const WORK_MODE_LABELS: Record<number, string> = {
  [WORK_MODE_SELF_USE]: 'Self Use',
  [WORK_MODE_FEED_IN]: 'Feed-in',
  [WORK_MODE_BACKUP]: 'Backup',
  [WORK_MODE_FORCE_CHARGE]: 'Force Charge',
  [WORK_MODE_FORCE_DISCHARGE]: 'Force Discharge',
  [WORK_MODE_PEAK_SHAVING]: 'Peak Shaving',
};

const FOX_SETTING_TO_CODE: Record<string, number> = {
  SelfUse: WORK_MODE_SELF_USE,
  Feedin: WORK_MODE_FEED_IN,
  Backup: WORK_MODE_BACKUP,
  ForceCharge: WORK_MODE_FORCE_CHARGE,
  ForceDischarge: WORK_MODE_FORCE_DISCHARGE,
  PeakShaving: WORK_MODE_PEAK_SHAVING,
};

export function toSignedInt16(raw: number): number {
  return raw >= 0x8000 ? raw - 0x10000 : raw;
}

function mapWorkModeRegister(raw: number | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }

  switch (raw) {
    case 0:
      return WORK_MODE_SELF_USE;
    case 1:
      return WORK_MODE_FEED_IN;
    case 2:
      return WORK_MODE_BACKUP;
    case 4:
      return WORK_MODE_PEAK_SHAVING;
    default:
      return undefined;
  }
}

/**
 * Resolve the effective work mode for H1 G2 from Modbus registers.
 * Register 41000 is the configured work mode. Remote control (44000/44002) only
 * overrides it while the remote timeout countdown (input 44004) is still running;
 * stale active-power setpoints are ignored after the watchdog expires.
 */
export function resolveH1G2WorkMode(inputs: {
  workModeRegister?: number;
  remoteEnable?: number;
  remoteActivePowerRaw?: number;
  remoteTimeoutCountdown?: number;
}): number | undefined {
  const configuredWorkMode = mapWorkModeRegister(inputs.workModeRegister);

  if (
    inputs.remoteEnable === 1 &&
    inputs.remoteTimeoutCountdown !== undefined &&
    inputs.remoteTimeoutCountdown > 0 &&
    inputs.remoteActivePowerRaw !== undefined
  ) {
    const activePower = toSignedInt16(inputs.remoteActivePowerRaw);
    if (activePower < 0) {
      return WORK_MODE_FORCE_CHARGE;
    }
    if (activePower > 0) {
      return WORK_MODE_FORCE_DISCHARGE;
    }
  }

  return configuredWorkMode;
}

export function foxWorkModeSettingToCode(
  value: string | number | null | undefined
): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const str = String(value);
  const numeric = Number(str);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return numeric;
  }

  return FOX_SETTING_TO_CODE[str];
}

export function workModeCodeToLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) {
    return 'Unknown';
  }
  return WORK_MODE_LABELS[code] ?? String(code);
}
