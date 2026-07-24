/** Telemetry fields read from H1 G2 Modbus and served by the local bridge container. */
export interface ModbusRealtimeTelemetry {
  loadsPower: number;
  pvPower: number;
  pv1Power: number;
  pv2Power: number;
  pvStringCount: number;
  pvStringPowers: Record<string, number>;
  feedinPower: number;
  gridConsumptionPower: number;
  batChargePower: number;
  batDischargePower: number;
  SoC: number;
  ResidualEnergy: number;
  batVoltage: number;
  batCurrent: number;
  batTemperature: number;
  gridVoltage: number;
  gridCurrent: number;
  gridFrequency: number;
  meterPower2: number;
  ambientTemperature: number;
  deviceTemperature: number;
  runningState?: number;
  isOffGrid?: boolean;
  epsPower: number;
  epsPowerR: number;
  epsVoltR: number;
  epsCurrentR: number;
  /** Resolved work mode code (0–5); see @checkmysolar/modbus-telemetry/workMode. */
  workMode?: number;
  /** Raw holding register 41000 when read successfully. */
  workModeRegister?: number;
  /** Raw holding register 44000 (1 = remote control active). */
  remoteEnable?: number;
  /** Raw signed active power setpoint from register 44002 (watts). */
  remoteActivePowerW?: number;
  /** Input register 44004 remote timeout countdown (seconds remaining). */
  remoteTimeoutCountdown?: number;
  /** BMS state of health (%) from holding 37624 on h1g2_144+. */
  batSoh?: number;
  /** BMS max cell temperature (°C) from holding 37617 on h1g2_144+. */
  bmsCellTempHigh?: number;
  /** BMS min cell temperature (°C) from holding 37618 on h1g2_144+. */
  bmsCellTempLow?: number;
  /** BMS max cell voltage (mV) from holding 37619 on h1g2_144+. */
  bmsCellMvHigh?: number;
  /** BMS min cell voltage (mV) from holding 37620 on h1g2_144+. */
  bmsCellMvLow?: number;
  /** Alarm bitmap holding 39067 on h1g2_144+. */
  alarmRegister1?: number;
  /** Alarm bitmap holding 39068 on h1g2_144+. */
  alarmRegister2?: number;
  /** Alarm bitmap holding 39069 on h1g2_144+. */
  alarmRegister3?: number;
  sampledAt: string;
}
