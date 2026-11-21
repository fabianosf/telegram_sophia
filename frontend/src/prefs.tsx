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
    nav_settings: "Configuração",
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
    advanced: "Avançado",
    lead: "Antecedência (s)",
    window: "Janela (s)",
    retry: "Retry (ms)",
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
    nav_settings: "Settings",
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
    advanced: "Advanced",
    lead: "Lead (s)",
    window: "Window (s)",
    retry: "Retry (ms)",
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
