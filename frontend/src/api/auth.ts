import type { TokenPair } from "../types";
import { client } from "./client";

export interface AuthConfig {
  registration_enabled: boolean;
  invite_required: boolean;
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const { data } = await client.get<AuthConfig>("/auth/config/");
  return data;
}

export async function login(username: string, password: string): Promise<TokenPair> {
  const { data } = await client.post<TokenPair>("/auth/login/", { username, password });
  return data;
}

export async function register(
  username: string,
  password: string,
  inviteCode?: string
): Promise<TokenPair> {
  const body: Record<string, string> = { username, password };
  if (inviteCode) {
    body.invite_code = inviteCode;
  }
  const { data } = await client.post<TokenPair>("/auth/register/", body);
  return data;
}