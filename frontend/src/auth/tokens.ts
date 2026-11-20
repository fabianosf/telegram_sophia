const ACCESS_KEY = "ts_access";
const REFRESH_KEY = "ts_refresh";

export const AUTH_LOGOUT_EVENT = "ts:logout";
export const SESSION_EXPIRED_KEY = "ts_session_expired";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: { access?: string; refresh?: string }): void {
  if (tokens.access) localStorage.setItem(ACCESS_KEY, tokens.access);
  if (tokens.refresh) localStorage.setItem(REFRESH_KEY, tokens.refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function emitLogout(): void {
  clearTokens();
  sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
  window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
}
