import type { DetectedInverter } from '../modbus/profiles/types.js';

export interface BridgeInverterInfo {
  inverterModel: string;
  modelId: string;
  profileId: string;
  connectionType: string;
  managerVersion?: string;
  masterVersion?: string;
  slaveVersion?: string;
  firmwareVariant: string;
}

export interface BridgeInfoResponse {
  bridgeVersion: string;
  inverter: BridgeInverterInfo | null;
}

function optionalVersionFields(detected: DetectedInverter): Pick<
  BridgeInverterInfo,
  'managerVersion' | 'masterVersion' | 'slaveVersion'
> {
  return {
    ...(detected.managerVersion ? { managerVersion: detected.managerVersion } : {}),
    ...(detected.masterVersion ? { masterVersion: detected.masterVersion } : {}),
    ...(detected.slaveVersion ? { slaveVersion: detected.slaveVersion } : {}),
  };
}

export function buildBridgeInverterInfo(detected: DetectedInverter): BridgeInverterInfo {
  return {
    inverterModel: detected.modelName,
    modelId: detected.modelId,
    profileId: detected.profileId,
    connectionType: detected.connectionType,
    ...optionalVersionFields(detected),
    firmwareVariant: detected.firmwareVariant,
  };
}

export function buildBridgeInfoResponse(
  bridgeVersion: string,
  detected: DetectedInverter | null
): BridgeInfoResponse {
  return {
    bridgeVersion,
    inverter: detected ? buildBridgeInverterInfo(detected) : null,
  };
}

export function formatBridgeInfoLines(info: BridgeInfoResponse): string[] {
  const lines = [`bridgeVersion: ${info.bridgeVersion}`];
  if (!info.inverter) {
    lines.push('inverter: null');
    return lines;
  }

  lines.push(`inverterModel: ${info.inverter.inverterModel}`);
  lines.push(`modelId: ${info.inverter.modelId}`);
  lines.push(`profileId: ${info.inverter.profileId}`);
  lines.push(`connectionType: ${info.inverter.connectionType}`);
  if (info.inverter.masterVersion) {
    lines.push(`masterVersion: ${info.inverter.masterVersion}`);
  }
  if (info.inverter.slaveVersion) {
    lines.push(`slaveVersion: ${info.inverter.slaveVersion}`);
  }
  if (info.inverter.managerVersion) {
    lines.push(`managerVersion: ${info.inverter.managerVersion}`);
  }
  lines.push(`firmwareVariant: ${info.inverter.firmwareVariant}`);
  return lines;
}
