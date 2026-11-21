import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { fetchAuthConfig, type AuthConfig } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { SESSION_EXPIRED_KEY } from "../auth/tokens";
import Clock from "../components/Clock";
import { usePrefs } from "../prefs";

function readExpiredFlag(): boolean {
  if (typeof window === "undefined") return false;
  if (!sessionStorage.getItem(SESSION_EXPIRED_KEY)) return false;
  sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  return true;
}

export default function Login() {
  const { isAuthenticated, login, register } = useAuth();
  const { t, theme, lang, setTheme, setLang } = usePrefs();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/contas";
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [expired, setExpired] = useState(readExpiredFlag);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAuthConfig()
      .then(setAuthConfig)
      .catch(() =>
        setAuthConfig({ registration_enabled: true, invite_required: false })
      );
  }, []);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const registrationEnabled = authConfig?.registration_enabled ?? true;
  const inviteRequired = authConfig?.invite_required ?? false;
  const displayError = error || (expired ? t("session_expired") : "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setExpired(false);
    if (!username.trim() || !password) {
      setError(lang === "en" ? "Enter username and password." : "Informe usuário e senha.");
      return;
    }
    if (mode === "register") {
      if (!registrationEnabled) {
        setError(lang === "en" ? "Public registration is disabled." : "Cadastro público desabilitado.");
        return;
      }
      if (password.length < 8) {
        setError(
          lang === "en"
            ? "Password must be at least 8 characters."
            : "A senha precisa ter pelo menos 8 caracteres."
        );
        return;
      }
      if (password !== confirm) {
        setError(lang === "en" ? "Passwords do not match." : "As senhas não coincidem.");
        return;
      }
      if (inviteRequired && !inviteCode.trim()) {
        setError(lang === "en" ? "Enter the invite code." : "Informe o código de convite.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password, inviteCode.trim() || undefined);
      } else {
        await login(username.trim(), password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="prefs-toggles" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
        <button
          type="button"
          className="ghost compact"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? t("theme_dark") : t("theme_light")}
        </button>
        <button
          type="button"
          className="ghost compact"
          onClick={() => setLang(lang === "pt" ? "en" : "pt")}
        >
          {lang === "pt" ? t("lang_en") : t("lang_pt")}
        </button>
      </div>
      <form className="card login" onSubmit={submit}>
        <h1>{mode === "register" ? t("login_register") : t("login_title")}</h1>
        <p className="muted">
          {mode === "register" ? t("register_hint") : t("login_hint")}
        </p>
        <Clock />
        {displayError ? <div className="banner">{displayError}</div> : null}
        <div className="grid">
          <label>
            {t("username")}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            {t("password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>
          {mode === "register" ? (
            <>
              <label>
                {t("confirm_password")}
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              {inviteRequired ? (
                <label>
                  {t("invite_code")}
                  <input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              ) : null}
            </>
          ) : null}
          <button className="primary" disabled={busy}>
            {busy
              ? mode === "register"
                ? t("submitting_register")
                : t("submitting_login")
              : mode === "register"
                ? t("submit_register")
                : t("submit_login")}
          </button>
          {registrationEnabled ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? t("create_account") : t("have_account")}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
