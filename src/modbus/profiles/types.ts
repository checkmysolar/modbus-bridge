export type ProfileId = 'h1g2' | 'h1Series' | 'kh' | 'h3Legacy' | 'h3Modern';

export type ConnectionType = 'aux' | 'lan';

export type FirmwareVariant =
  | 'default'
  | 'h1g2Pre144'
  | 'h1g2_144'
  | 'khPre133'
  | 'kh_133'
  | 'h3Pre180'
  | 'h3_180';

export interface DetectedInverter {
  modelId: string;
  modelName: string;
  profileId: ProfileId;
  connectionType: ConnectionType;
  firmwareVariant: FirmwareVariant;
  managerVersion?: string;
  masterVersion?: string;
  slaveVersion?: string;
}

export interface ProfileContext {
  connectionType: ConnectionType;
  firmwareVariant: FirmwareVariant;
  modelName?: string;
}
