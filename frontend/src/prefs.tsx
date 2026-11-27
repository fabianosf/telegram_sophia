import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";
export type Lang = "pt" | "en";

type Dict = Record<string, string>;

const messages: Record<Lang, Dict> = {
  pt: {
    brand: "TelegramSophia",
    nav_accounts: "Contas",
    nav_schedules: "Agendamentos",
    nav_reports: "Relatórios",
    nav_settings: "Configuração",
    report_hint: "Veja como andam seus envios. Escolha o período (dia/mês/ano) e a conta.",
    report_period: "Período",
    report_from: "De",
    report_to: "Até",
    report_until: "até",
    report_days_7: "7 dias",
    report_days_30: "30 dias",
    report_days_90: "90 dias",
    report_all_accounts: "Todas as contas",
    report_sent: "Enviadas",
    report_failed: "Não enviadas",
    report_success: "Taxa de acerto",
    report_latency: "Tempo médio",
    report_by_day: "Por dia",
    report_by_account: "Por conta",
    report_by_dest: "Destinos mais usados",
    report_empty: "Nada neste período.",
    report_error: "Não foi possível carregar o relatório.",
    logout: "Sair",
    theme_light: "Claro",
    theme_dark: "Escuro",
    lang_pt: "PT",
    lang_en: "EN",
    login_title: "Entrar",
    login_register: "Criar conta",
    login_hint: "Use seu login para acessar a API.",
    register_hint: "Cadastre um usuário para acessar o painel.",
    username: "Usuário",
    password: "Senha",
    confirm_password: "Confirmar senha",
    invite_code: "Código de convite",
    submit_login: "Entrar",
    submit_register: "Cadastrar",
    submitting_login: "Entrando…",
    submitting_register: "Cadastrando…",
    have_account: "Já tenho login",
    create_account: "Criar conta",
    session_expired: "Sessão expirada. Entre novamente.",
    new_schedule: "Novo agendamento",
    edit_schedule: "Editar",
    account: "Conta",
    using_account: "Enviando com",
    select: "Selecione",
    group: "Grupo / canal",
    select_group: "Selecione o grupo",
    loading: "Carregando…",
    loading_accounts: "Carregando contas…",
    connect_first: "Conecte uma conta Telegram antes de agendar.",
    send_to: "Enviar para",
    saved_messages: "Mensagens Salvas",
    other_dest: "Outro destino",
    hide_other_dest: "Ocultar outro destino",
    message: "Mensagem",
    when: "Quando (Brasília)",
    advanced: "Opções extras (opcional)",
    lead: "Começar antes (segundos)",
    lead_hint: "Quantos segundos antes da hora o app já prepara o envio. Ex.: 12.",
    window: "Continuar tentando por (segundos)",
    window_hint: "Se não der certo na hora, ainda tenta durante esses segundos. Ex.: 15.",
    retry: "Pausa entre tentativas (ms)",
    retry_hint: "Tempo de espera antes de tentar de novo. Ex.: 100.",
    fire_early: "Adiantar envio (ms)",
    fire_early_hint: "Compensa o atraso da internet para chegar mais cedo no grupo. Ex.: 150.",
    skew: "Adianto",
    schedule: "Agendar",
    save: "Salvar",
    saving: "Salvando…",
    cancel_edit: "Cancelar edição",
    queue: "Na fila",
    queue_empty: "Nada na fila — enviadas vão para o histórico.",
    failures: "Falhas",
    history: "Histórico (enviadas)",
    history_hint: "Mensagens já enviadas. Abra só se precisar.",
    details: "Detalhes",
    edit: "Editar",
    cancel: "Cancelar",
    delete: "Excluir",
    close: "Fechar",
    no_attempts: "Nenhuma tentativa ainda.",
    attempt: "Tentativa",
    latency: "Latência",
    result: "Resultado",
    sent_at: "Enviado",
    arrives: "Chega em",
    status: "Status",
    created: "Agendamento criado.",
    updated: "Agendamento atualizado.",
    status_pending: "Pendente",
    status_running: "Enviando…",
    status_sent: "Enviada",
    status_failed: "Falhou",
    status_cancelled: "Cancelada",
    account_pending: "Pendente",
    account_connected: "Conectada",
    account_error: "Erro",
  },
  en: {
    brand: "TelegramSophia",
    nav_accounts: "Accounts",
    nav_schedules: "Schedules",
    nav_reports: "Reports",
    nav_settings: "Settings",
    report_hint: "See how your sends are doing. Pick a date range and account.",
    report_period: "Period",
    report_from: "From",
    report_to: "To",
    report_until: "to",
    report_days_7: "7 days",
    report_days_30: "30 days",
    report_days_90: "90 days",
    report_all_accounts: "All accounts",
    report_sent: "Sent",
    report_failed: "Not sent",
    report_success: "Success rate",
    report_latency: "Avg. time",
    report_by_day: "By day",
    report_by_account: "By account",
    report_by_dest: "Top destinations",
    report_empty: "Nothing in this period.",
    report_error: "Could not load the report.",
    logout: "Log out",
    theme_light: "Light",
    theme_dark: "Dark",
    lang_pt: "PT",
    lang_en: "EN",
    login_title: "Sign in",
    login_register: "Create account",
    login_hint: "Use your login to access the API.",
    register_hint: "Create a user to access the panel.",
    username: "Username",
    password: "Password",
    confirm_password: "Confirm password",
    invite_code: "Invite code",
    submit_login: "Sign in",
    submit_register: "Register",
    submitting_login: "Signing in…",
    submitting_register: "Registering…",
    have_account: "I already have an account",
    create_account: "Create account",
    session_expired: "Session expired. Sign in again.",
    new_schedule: "New schedule",
    edit_schedule: "Edit",
    account: "Account",
    using_account: "Sending with",
    select: "Select",
    group: "Group / channel",
    select_group: "Select a group",
    loading: "Loading…",
    loading_accounts: "Loading accounts…",
    connect_first: "Connect a Telegram account before scheduling.",
    send_to: "Send to",
    saved_messages: "Saved Messages",
    other_dest: "Other destination",
    hide_other_dest: "Hide other destination",
    message: "Message",
    when: "When (Brasília)",
    advanced: "Extra options (optional)",
    lead: "Start early (seconds)",
    lead_hint: "How many seconds before the scheduled time the app starts preparing. e.g. 12.",
    window: "Keep trying for (seconds)",
    window_hint: "If it misses the exact second, it still retries for this many seconds. e.g. 15.",
    retry: "Pause between tries (ms)",
    retry_hint: "Wait time before another try. e.g. 100.",
    fire_early: "Fire early (ms)",
    fire_early_hint: "Offsets internet delay so the message lands closer to the target time. e.g. 150.",
    skew: "Skew",
    schedule: "Schedule",
    save: "Save",
    saving: "Saving…",
    cancel_edit: "Cancel edit",
    queue: "Queue",
    queue_empty: "Queue is empty — sent items move to history.",
    failures: "Failures",
    history: "History (sent)",
    history_hint: "Already sent messages. Open only if needed.",
    details: "Details",
    edit: "Edit",
    cancel: "Cancel",
    delete: "Delete",
    close: "Close",
    no_attempts: "No attempts yet.",
    attempt: "Attempt",
    latency: "Latency",
    result: "Result",
    sent_at: "Sent",
    arrives: "Arrives",
    status: "Status",
    created: "Schedule created.",
    updated: "Schedule updated.",
    status_pending: "Pending",
    status_running: "Sending…",
    status_sent: "Sent",
    status_failed: "Failed",
    status_cancelled: "Cancelled",
    account_pending: "Pending",
    account_connected: "Connected",
    account_error: "Error",
  },
};

interface PrefsContextValue {
  theme: Theme;
  lang: Lang;
  setTheme: (theme: Theme) => void;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

function readStored<T extends string>(key: string, fallback: T, allowed: T[]): T {
  const raw = localStorage.getItem(key);
  if (raw && (allowed as string[]).includes(raw)) return raw as T;
  return fallback;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    readStored("ts_theme", "light", ["dark", "light"])
  );
  const [lang, setLangState] = useState<Lang>(() =>
    readStored("ts_lang", "pt", ["pt", "en"])
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ts_theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang === "pt" ? "pt-BR" : "en");
    localStorage.setItem("ts_lang", lang);
  }, [lang]);

  const value = useMemo<PrefsContextValue>(
    () => ({
      theme,
      lang,
      setTheme: setThemeState,
      setLang: setLangState,
      t: (key: string) => messages[lang][key] ?? messages.pt[key] ?? key,
    }),
    [theme, lang]
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PrefsProvider");
  return ctx;
}
