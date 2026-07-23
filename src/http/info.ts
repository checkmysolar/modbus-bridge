import type { DetectedInverter } from '../modbus/profiles/types.js';

export interface BridgeInverterInfo {
  inverterModel: string;
  modelId: string;
  profileId: string;
  connectionType: string;
  managerVersion?: string;
  firmwareVariant: string;
}

export interface BridgeInfoResponse {
  bridgeVersion: string;
  inverter: BridgeInverterInfo | null;
}

export function buildBridgeInverterInfo(detected: DetectedInverter): BridgeInverterInfo {
  return {
    inverterModel: detected.modelName,
    modelId: detected.modelId,
    profileId: detected.profileId,
    connectionType: detected.connectionType,
    ...(detected.managerVersion ? { managerVersion: detected.managerVersion } : {}),
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
