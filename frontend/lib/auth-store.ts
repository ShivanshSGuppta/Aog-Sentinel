export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
}

let volatileSession: StoredSession | null = null;

export function getStoredSession(): StoredSession | null {
  return volatileSession;
}

export function setStoredSession(session: StoredSession | null) {
  volatileSession = session;

  if (typeof window === "undefined") return;
  if (!session) {
    window.dispatchEvent(new CustomEvent("aog-auth-change", { detail: null }));
    return;
  }
  window.dispatchEvent(new CustomEvent("aog-auth-change", { detail: session }));
}

export function clearStoredSession() {
  setStoredSession(null);
}
