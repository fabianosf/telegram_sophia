export type AccountStatus = "pending" | "connected" | "error";
export type ScheduleStatus = "pending" | "running" | "sent" | "failed" | "cancelled";

export interface TelegramAccount {
  id: number;
  label: string;
  phone: string;
  status: AccountStatus;
  created_at: string;
}

export interface Schedule {
  id: number;
  account: number;
  chat_ref: string;
  message: string;
  run_at: string;
  lead_seconds: number;
  max_window_seconds: number;
  retry_interval_ms: number;
  status: ScheduleStatus;
  created_at: string;
}

export interface SendLog {
  id: number;
  schedule: number;
  attempt_at: string;
  success: boolean;
  error: string;
  latency_ms: number | null;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface TelegramAppConfig {
  configured: boolean;
  has_own_app: boolean;
  using_server_fallback: boolean;
  api_id: number | null;
  api_hash_masked: string;
}
