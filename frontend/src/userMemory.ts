/** Lembra preferências do usuário logado (não substitui o banco). */

const USER_KEY = "ts_username";

export function setRememberedUsername(username: string): void {
  localStorage.setItem(USER_KEY, username.trim());
}

export function getRememberedUsername(): string {
  return localStorage.getItem(USER_KEY) || "";
}

export function clearRememberedUsername(): void {
  localStorage.removeItem(USER_KEY);
}

function key(suffix: string): string {
  const user = getRememberedUsername() || "_";
  return `ts_mem:${user}:${suffix}`;
}

export interface ScheduleMemory {
  account?: string;
  chat_ref?: string;
  chat_title?: string;
  lead_seconds?: string;
  max_window_seconds?: string;
  retry_interval_ms?: string;
  manual_dest?: boolean;
}

export interface AccountMemory {
  label?: string;
  phone?: string;
}

function readJson<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadScheduleMemory(): ScheduleMemory {
  return readJson<ScheduleMemory>(key("schedule")) || {};
}

export function saveScheduleMemory(partial: ScheduleMemory): void {
  const next = { ...loadScheduleMemory(), ...partial };
  localStorage.setItem(key("schedule"), JSON.stringify(next));
}

export function loadAccountMemory(): AccountMemory {
  return readJson<AccountMemory>(key("account")) || {};
}

export function saveAccountMemory(partial: AccountMemory): void {
  const next = { ...loadAccountMemory(), ...partial };
  localStorage.setItem(key("account"), JSON.stringify(next));
}
