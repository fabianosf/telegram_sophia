import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { login as loginRequest, register as registerRequest } from "../api/auth";
import { AUTH_LOGOUT_EVENT, clearTokens, getAccessToken, setTokens } from "./tokens";

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAccessToken()));

  useEffect(() => {
    const onLogout = () => setIsAuthenticated(false);
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      async login(username, password) {
        const tokens = await loginRequest(username, password);
        setTokens(tokens);
        setIsAuthenticated(true);
      },
      async register(username, password, inviteCode) {
        const tokens = await registerRequest(username, password, inviteCode);
        setTokens(tokens);
        setIsAuthenticated(true);
      },
      logout() {
        clearTokens();
        setIsAuthenticated(false);
      },
    }),
    [isAuthenticated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
