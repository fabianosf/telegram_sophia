import type { TelegramAppConfig } from "../types";
import { client } from "./client";

export async function getTelegramApp(): Promise<TelegramAppConfig> {
  const { data } = await client.get<TelegramAppConfig>("/telegram-app/");
  return data;
}

export async function saveTelegramApp(payload: {
  api_id: number;
  api_hash: string;
}): Promise<TelegramAppConfig> {
  const { data } = await client.put<TelegramAppConfig>("/telegram-app/", payload);
  return data;
}
