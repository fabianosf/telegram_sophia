import type { TokenPair } from "../types";
import { client } from "./client";

export async function login(username: string, password: string): Promise<TokenPair> {
  const { data } = await client.post<TokenPair>("/auth/login/", { username, password });
  return data;
}
