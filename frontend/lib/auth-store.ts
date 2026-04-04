export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
}

const STORAGE_KEY = "aog-sentinel:session";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function getStoredSession(): StoredSession | null {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function setStoredSession(session: StoredSession | null) {
  if (!canUseStorage()) return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("aog-auth-change", { detail: null }));
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("aog-auth-change", { detail: session }));
}

export function clearStoredSession() {
  setStoredSession(null);
}
