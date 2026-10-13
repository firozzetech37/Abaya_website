/**
 * Bridge between Clerk (React) and the plain-TS API client. The AuthProvider registers
 * Clerk's `getToken`; the API client asks for a FRESH token on every request (Clerk
 * session tokens live ~60 s and getToken() refreshes/caches them itself).
 */
type TokenGetter = () => Promise<string | null>;

let getter: TokenGetter | null = null;

export function setTokenGetter(next: TokenGetter | null): void {
  getter = next;
}

export async function getAccessToken(): Promise<string | null> {
  if (!getter) return null;
  try {
    return await getter();
  } catch {
    // Offline or the session was revoked: send the request without a token (the API answers 401).
    return null;
  }
}
