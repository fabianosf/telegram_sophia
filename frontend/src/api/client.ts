import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { clearTokens, emitLogout, getAccessToken, getRefreshToken, setTokens } from "../auth/tokens";
import { ApiError } from "./errors";

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

const refreshClient = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

let refreshPromise: Promise<string | null> | null = null;

function isAuthUrl(url?: string): boolean {
  return Boolean(
    url &&
      (url.includes("/auth/login") ||
        url.includes("/auth/refresh") ||
        url.includes("/auth/register"))
  );
}

async function refreshAccess(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) {
    emitLogout();
    return null;
  }
  try {
    const { data } = await refreshClient.post<{ access: string }>("/auth/refresh/", { refresh });
    setTokens({ access: data.access });
    return data.access;
  } catch {
    emitLogout();
    return null;
  }
}

client.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    if (!original || status !== 401 || original._retry || isAuthUrl(original.url)) {
      return Promise.reject(toApiError(error));
    }
    original._retry = true;
    if (!refreshPromise) {
      refreshPromise = refreshAccess().finally(() => {
        refreshPromise = null;
      });
    }
    const access = await refreshPromise;
    if (!access) {
      return Promise.reject(toApiError(error));
    }
    original.headers.Authorization = `Bearer ${access}`;
    return client(original);
  }
);

function toApiError(error: AxiosError): ApiError {
  const status = error.response?.status ?? 0;
  return new ApiError(status, error.response?.data ?? error.message);
}

export { client, clearTokens };
