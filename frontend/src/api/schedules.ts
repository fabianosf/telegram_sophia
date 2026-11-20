import type { Schedule, SendLog } from "../types";
import { client } from "./client";

export async function listSchedules(): Promise<Schedule[]> {
  const { data } = await client.get<Schedule[]>("/schedules/");
  return data;
}

export async function createSchedule(payload: {
  account: number;
  chat_ref: string;
  message: string;
  run_at: string;
  lead_seconds: number;
  max_window_seconds: number;
  retry_interval_ms: number;
}): Promise<Schedule> {
  const { data } = await client.post<Schedule>("/schedules/", payload);
  return data;
}

export async function updateSchedule(
  id: number,
  payload: {
    account: number;
    chat_ref: string;
    message: string;
    run_at: string;
    lead_seconds: number;
    max_window_seconds: number;
    retry_interval_ms: number;
  }
): Promise<Schedule> {
  const { data } = await client.patch<Schedule>(`/schedules/${id}/`, payload);
  return data;
}

export async function cancelSchedule(id: number): Promise<Schedule> {
  const { data } = await client.post<Schedule>(`/schedules/${id}/cancel/`);
  return data;
}

export async function listSendLogs(scheduleId: number): Promise<SendLog[]> {
  const { data } = await client.get<SendLog[]>("/send-logs/", {
    params: { schedule: scheduleId },
  });
  return data;
}
