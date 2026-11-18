import type { TelegramAccount } from "../types";
import { client } from "./client";

export async function listAccounts(): Promise<TelegramAccount[]> {
  const { data } = await client.get<TelegramAccount[]>("/accounts/");
  return data;
}

export async function startAccount(payload: {
  label: string;
  phone: string;
}): Promise<TelegramAccount> {
  const { data } = await client.post<TelegramAccount>("/accounts/start/", payload);
  return data;
}

export async function confirmAccount(
  id: number,
  payload: { code: string; password?: string }
): Promise<TelegramAccount> {
  const { data } = await client.post<TelegramAccount>(`/accounts/${id}/confirm/`, payload);
  return data;
}

export async function deleteAccount(id: number): Promise<void> {
  await client.delete(`/accounts/${id}/`);
}
