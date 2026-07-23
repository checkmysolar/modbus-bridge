/** Fox runningState codes (docs/fox-api.md). */
export const RUNNING_STATE_ON_GRID = 163;
export const RUNNING_STATE_OFF_GRID = 164;
export const RUNNING_STATE_FAULT = 165;
export const RUNNING_STATE_STANDBY = 167;

/** Map G2 status registers to Fox Cloud runningState (foxess_modbus G2 inverter state). */
export function parseG2RunningState(status1: number, status3: number): number | undefined {
  if ((status1 & 0x40) > 0) return RUNNING_STATE_FAULT;
  if ((status3 & 0x01) > 0) return RUNNING_STATE_OFF_GRID;
  if ((status1 & 0x04) > 0) return RUNNING_STATE_ON_GRID;
  if ((status1 & 0x01) > 0) return RUNNING_STATE_STANDBY;
  return undefined;
}

/** Map H1 G1/KH inverter state index to Fox runningState. */
export function parseH1RunningState(stateIndex: number): number | undefined {
  switch (stateIndex) {
    case 2:
      return RUNNING_STATE_ON_GRID;
    case 3:
      return RUNNING_STATE_OFF_GRID;
    case 4:
    case 5:
      return RUNNING_STATE_FAULT;
    case 0:
    case 1:
      return RUNNING_STATE_STANDBY;
    default:
      return undefined;
  }
}

export function isOffGridRunningState(runningState?: number): boolean {
  return runningState === RUNNING_STATE_OFF_GRID;
}
