export interface RegisterRange {
  start: number;
  end: number;
}

export interface SpecialRegisterConfig {
  invalidRanges: RegisterRange[];
  individualReadRanges: RegisterRange[];
}

export const H1_G2_SPECIAL_REGISTERS: SpecialRegisterConfig = {
  invalidRanges: [],
  individualReadRanges: [{ start: 41000, end: 41999 }],
};

export const H1_SERIES_SPECIAL_REGISTERS: SpecialRegisterConfig = {
  invalidRanges: [{ start: 11096, end: 39999 }],
  individualReadRanges: [],
};

export const H3_LEGACY_SPECIAL_REGISTERS: SpecialRegisterConfig = {
  invalidRanges: [
    { start: 41001, end: 41006 },
    { start: 41012, end: 41013 },
    { start: 41015, end: 41015 },
  ],
  individualReadRanges: [{ start: 41000, end: 41999 }],
};

export const H3_MODERN_SPECIAL_REGISTERS: SpecialRegisterConfig = {
  invalidRanges: [
    { start: 37633, end: 37699 },
    { start: 41001, end: 41006 },
    { start: 41012, end: 41013 },
    { start: 41015, end: 41015 },
  ],
  individualReadRanges: [{ start: 41000, end: 41999 }],
};

export const H3_SMART_SPECIAL_REGISTERS: SpecialRegisterConfig = {
  invalidRanges: [
    { start: 41001, end: 41006 },
    { start: 41012, end: 41013 },
    { start: 41015, end: 41015 },
  ],
  individualReadRanges: [
    { start: 37609, end: 37620 },
    { start: 37632, end: 37636 },
    { start: 41000, end: 41999 },
  ],
};

export const KH_SPECIAL_REGISTERS: SpecialRegisterConfig = {
  invalidRanges: [
    { start: 41001, end: 41006 },
    { start: 41012, end: 41012 },
    { start: 41019, end: 43999 },
    { start: 31055, end: 31999 },
  ],
  individualReadRanges: [{ start: 41000, end: 41999 }],
};

function inRange(address: number, range: RegisterRange): boolean {
  return address >= range.start && address <= range.end;
}

export function overlapsInvalidRange(
  config: SpecialRegisterConfig,
  startAddress: number,
  endAddress: number
): boolean {
  return config.invalidRanges.some(
    (range) => range.start <= endAddress && startAddress <= range.end
  );
}

export function requiresIndividualRead(config: SpecialRegisterConfig, address: number): boolean {
  return config.individualReadRanges.some((range) => inRange(address, range));
}

export function getSpecialRegistersForProfile(profileId: string): SpecialRegisterConfig {
  switch (profileId) {
    case 'h1g2':
      return H1_G2_SPECIAL_REGISTERS;
    case 'h1Series':
      return H1_SERIES_SPECIAL_REGISTERS;
    case 'kh':
      return KH_SPECIAL_REGISTERS;
    case 'h3Legacy':
      return H3_LEGACY_SPECIAL_REGISTERS;
    case 'h3Modern':
      return H3_MODERN_SPECIAL_REGISTERS;
    default:
      return { invalidRanges: [], individualReadRanges: [] };
  }
}
