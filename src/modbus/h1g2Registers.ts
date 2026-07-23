export {
  H1_G2_BLOCK_START,
  H1_G2_BLOCK_LENGTH,
  H1_G2_RESIDUAL_ENERGY_REGISTER,
  H1_G2_PV1_POWER_REGISTER,
  H1_G2_PV2_POWER_REGISTER,
  H1_G2_STATE_STATUS1_REGISTER,
  H1_G2_STATE_STATUS3_REGISTER,
  H1_G2_WORK_MODE_REGISTER,
  H1_G2_REMOTE_ENABLE_REGISTER,
  H1_G2_REMOTE_ACTIVE_POWER_REGISTER,
  H1_G2_REMOTE_TIMEOUT_COUNTDOWN_REGISTER,
  H1_G2_LOAD_POWER_REGISTER,
  parseH1G2RealtimeSnapshot,
  parseLoadsPowerRegister,
  type H1G2RegisterInputs,
} from './profiles/h1g2.js';

export {
  RUNNING_STATE_ON_GRID,
  RUNNING_STATE_OFF_GRID,
  RUNNING_STATE_FAULT,
  RUNNING_STATE_STANDBY,
  parseG2RunningState,
  isOffGridRunningState,
} from './profiles/runningState.js';

export {
  scaleSignedPowerKw,
  scaleUnsigned,
  scaleSigned,
  parseGridCtPowerKw,
  parseBatteryPowerKw,
  parseEpsPowerKw,
} from './core/scaling.js';
