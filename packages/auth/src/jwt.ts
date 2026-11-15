/**
 * Extract Bearer token from Authorization header string or array
 */
export function extractBearerToken(headerValue?: string | string[]): string | null {
  if (!headerValue) {
    return null;
  }
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!raw) {
    return null;
  }
  const parts = raw.trim().split(" ");
  if (parts.length === 2 && parts[0]?.toLowerCase() === "bearer" && parts[1]) {
    return parts[1];
  }
  return null;
}

export interface JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  exp?: number;
  iat?: number;
  aud?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Decode payload from JWT without verifying signature (signature verified by Supabase Auth server/SDK)
 */
export function decodeJWTPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) {
      return null;
    }
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(jsonPayload) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Returns true if the token is expired or will expire within thresholdSeconds (default 0)
 */
export function isTokenExpired(token: string, thresholdSeconds = 0): boolean {
  const payload = decodeJWTPayload(token);
  if (!payload || !payload.exp) {
    return true;
  }
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowInSeconds + thresholdSeconds;
}
