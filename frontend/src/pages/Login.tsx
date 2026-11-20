import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { SESSION_EXPIRED_KEY } from "../auth/tokens";
import Clock from "../components/Clock";

function readExpiredMessage(): string {
  if (typeof window === "undefined") return "";
  if (!sessionStorage.getItem(SESSION_EXPIRED_KEY)) return "";
  sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  return "Sessão expirada. Entre novamente.";
}

export default function Login() {
  const { isAuthenticated, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/contas";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(readExpiredMessage);
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Informe usuário e senha.");
      return;
    }
    if (mode === "register") {
      if (password.length < 8) {
        setError("A senha precisa ter pelo menos 8 caracteres.");
        return;
      }
      if (password !== confirm) {
        setError("As senhas não coincidem.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password);
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
      <form className="card login" onSubmit={submit}>
        <h1>{mode === "register" ? "Criar conta" : "Entrar"}</h1>
        <p className="muted">
          {mode === "register"
            ? "Cadastre um usuário para acessar o painel."
            : "Use seu login para acessar a API."}
        </p>
        <Clock />
        {error ? <div className="banner">{error}</div> : null}
        <div className="grid">
          <label>
            Usuário
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>
          {mode === "register" ? (
            <label>
              Confirmar senha
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          ) : null}
          <button className="primary" disabled={busy}>
            {busy
              ? mode === "register"
                ? "Cadastrando…"
                : "Entrando…"
              : mode === "register"
                ? "Cadastrar"
                : "Entrar"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Criar conta" : "Já tenho login"}
          </button>
        </div>
      </form>
    </div>
  );
}
