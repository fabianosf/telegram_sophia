import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { login as loginRequest, register as registerRequest } from "../api/auth";
import {
  clearRememberedUsername,
  getRememberedUsername,
  setRememberedUsername,
} from "../userMemory";
import { AUTH_LOGOUT_EVENT, clearTokens, getAccessToken, setTokens } from "./tokens";

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAccessToken()));
  const [username, setUsername] = useState(() => getRememberedUsername());

  useEffect(() => {
    const onLogout = () => {
      setIsAuthenticated(false);
      setUsername("");
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      username,
      async login(name, password) {
        const tokens = await loginRequest(name, password);
        setTokens(tokens);
        setRememberedUsername(name);
        setUsername(name.trim());
        setIsAuthenticated(true);
      },
      async register(name, password, inviteCode) {
        const tokens = await registerRequest(name, password, inviteCode);
        setTokens(tokens);
        setRememberedUsername(name);
        setUsername(name.trim());
        setIsAuthenticated(true);
      },
      logout() {
        clearTokens();
        clearRememberedUsername();
        setUsername("");
        setIsAuthenticated(false);
      },
    }),
    [isAuthenticated, username]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
