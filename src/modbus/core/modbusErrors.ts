export function isIllegalDataAddressError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /illegal data address/i.test(message) || /modbus exception 2/i.test(message);
}
