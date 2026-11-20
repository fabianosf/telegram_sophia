import type { AccountStatus, ScheduleStatus } from "./types";

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  pending: "Pendente",
  connected: "Conectada",
  error: "Erro",
};

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  pending: "Pendente",
  running: "Em execução",
  sent: "Enviada",
  failed: "Falhou",
  cancelled: "Cancelada",
};
