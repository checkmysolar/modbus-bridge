export function extractBearerToken(
  request: { headers: { authorization?: string | string[] | null; get?: (name: string) => string | null } }
): string | null {
  const header =
    typeof request.headers.get === 'function'
      ? request.headers.get('authorization')
      : request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) {
    return null;
  }
  const token = value.slice('Bearer '.length).trim();
  return token || null;
}

export function isAuthorized(token: string | null, expectedToken: string): boolean {
  if (!token || !expectedToken) {
    return false;
  }
  return token === expectedToken;
}
