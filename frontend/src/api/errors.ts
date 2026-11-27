export type ApiErrorBody = Record<string, unknown>;

const FIELD_LABELS: Record<string, string> = {
  username: "Usuário",
  password: "Senha",
  label: "Nome",
  phone: "Telefone",
  code: "Código",
  account: "Conta",
  chat_ref: "Chat",
  message: "Mensagem",
  run_at: "Data/hora",
  lead_seconds: "Começar antes",
  max_window_seconds: "Continuar tentando por",
  retry_interval_ms: "Pausa entre tentativas",
  fire_early_ms: "Adiantar envio",
  api_id: "App api_id",
  api_hash: "App api_hash",
  detail: "Erro",
  non_field_errors: "Erro",
};

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(stringifyValue).join(" ");
  if (value && typeof value === "object") return formatApiError(value as ApiErrorBody);
  return String(value ?? "");
}

export function formatApiError(data: unknown): string {
  if (!data) return "Erro inesperado.";
  if (typeof data === "string") return data;
  if (typeof data !== "object") return "Erro inesperado.";
  const body = data as ApiErrorBody;
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) return body.detail.map(stringifyValue).join(" ");
  const parts = Object.entries(body).map(([key, value]) => {
    const label = FIELD_LABELS[key] || key;
    return `${label}: ${stringifyValue(value)}`;
  });
  return parts.join("\n") || "Erro inesperado.";
}

export class ApiError extends Error {
  status: number;
  data: ApiErrorBody;

  constructor(status: number, data: unknown) {
    super(formatApiError(data));
    this.name = "ApiError";
    this.status = status;
    this.data = (data && typeof data === "object" ? data : {}) as ApiErrorBody;
  }

  field(name: string): string {
    return stringifyValue(this.data[name]);
  }
}
