function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Format errors from Error, modbus-serial, and other thrown values. */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.length > 0) {
    const parts = [error.message];
    if (typeof error.errno === 'string' && error.errno.length > 0) {
      parts.push(`(${error.errno})`);
    }
    return parts.join(' ');
  }

  if (isRecord(error)) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}
