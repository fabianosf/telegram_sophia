import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  confirmAccount,
  deleteAccount,
  listAccounts,
  retryAccount,
  startAccount,
} from "../api/accounts";
import { ApiError } from "../api/errors";
import { formatBrasilia } from "../datetime";
import { usePolling } from "../hooks/usePolling";
import { getTelegramApp } from "../api/telegramApp";
import { ACCOUNT_STATUS_LABEL } from "../status";
import type { TelegramAccount, TelegramAppConfig } from "../types";
import { loadAccountMemory, saveAccountMemory } from "../userMemory";

interface FormState {
  label: string;
  phone: string;
  code: string;
  password: string;
}

function initialForm(): FormState {
  const mem = loadAccountMemory();
  return {
    label: mem.label || "",
    phone: mem.phone || "",
    code: "",
    password: "",
  };
}

export default function Accounts() {
  const { data: accounts, error, loading, reload } = usePolling(listAccounts, 3000);
  const connected = accounts.filter((a) => a.status === "connected");
  const [step, setStep] = useState<1 | 2>(1);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<FormState>>({});
  const [banner, setBanner] = useState("");
  const [need2fa, setNeed2fa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [telegramApp, setTelegramApp] = useState<TelegramAppConfig | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTelegramApp()
      .then((data) => {
        if (!cancelled) setTelegramApp(data);
      })
      .catch(() => {
        if (!cancelled) setTelegramApp(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const appReady = Boolean(telegramApp?.configured);

  function setField(name: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  }

  function validateStart(): boolean {
    const next: Partial<FormState> = {};
    if (!form.label.trim()) next.label = "Informe um nome para a conta.";
    if (!form.phone.trim()) next.phone = "Informe o telefone com DDI, ex: +5511…";
    else if (!/^\+?\d{8,15}$/.test(form.phone.replace(/\s/g, ""))) {
      next.phone = "Telefone inválido. Use DDI, só números.";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateConfirm(): boolean {
    const next: Partial<FormState> = {};
    if (!form.code.trim()) next.code = "Informe o código recebido no Telegram.";
    if (need2fa && !form.password) next.password = "Informe a senha 2FA.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function applyApiError(err: unknown) {
    if (err instanceof ApiError) {
      setFieldErrors({
        label: err.field("label"),
        phone: err.field("phone"),
        code: err.field("code"),
        password: err.field("password"),
      });
    }
    setBanner(err instanceof Error ? err.message : "Falha na operação.");
  }

  async function submitStart(event: FormEvent) {
    event.preventDefault();
    setBanner("");
    if (!appReady) {
      setBanner("Configure seu app Telegram em Configuração.");
      return;
    }
    if (!validateStart()) return;
    setBusy(true);
    try {
      const phone = form.phone.replace(/\s/g, "");
      const label = form.label.trim();
      const account = await startAccount({ label, phone });
      saveAccountMemory({ label, phone });
      setPendingId(account.id);
      setStep(2);
      setNeed2fa(false);
      await reload();
    } catch (err) {
      applyApiError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submitConfirm(event: FormEvent) {
    event.preventDefault();
    setBanner("");
    if (!pendingId || !validateConfirm()) return;
    setBusy(true);
    try {
      await confirmAccount(pendingId, {
        code: form.code.trim(),
        password: form.password,
      });
      setBanner("Conta conectada. Ela fica salva — não precisa vincular de novo ao entrar.");
      setStep(1);
      setPendingId(null);
      setForm(initialForm());
      setNeed2fa(false);
      setShowAdd(false);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && /two-factor|2fa|password required/i.test(err.message)) {
        setNeed2fa(true);
        setFieldErrors((current) => ({
          ...current,
          password: "Esta conta exige senha 2FA.",
        }));
      }
      applyApiError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(account: TelegramAccount) {
    if (!window.confirm(`Remover a conta ${account.label}?`)) return;
    setBanner("");
    try {
      await deleteAccount(account.id);
      if (pendingId === account.id) {
        setStep(1);
        setPendingId(null);
      }
      await reload();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Falha ao remover.");
    }
  }

  function continuePending(account: TelegramAccount) {
    setPendingId(account.id);
    setStep(2);
    setForm((current) => ({
      ...current,
      label: account.label,
      phone: account.phone,
      code: "",
      password: "",
    }));
    setNeed2fa(false);
    setBanner("");
  }

  async function retry(account: TelegramAccount) {
    setBanner("");
    setBusy(true);
    try {
      const updated = await retryAccount(account.id);
      continuePending(updated);
      setBanner("Código reenviado. Confirme no Telegram.");
      await reload();
    } catch (err) {
      applyApiError(err);
    } finally {
      setBusy(false);
    }
  }

  // Só abre o fluxo telefone→código na 1ª vez, se houver pendência, ou se pedir "Adicionar".
  const hasPending = accounts.some((a) => a.status === "pending");
  const needsLinkForm =
    showAdd || step === 2 || (connected.length === 0 && !loading) || hasPending;

  return (
    <>
      <section className="card">
        <h2>Contas Telegram</h2>
        <p className="muted">
          Conecte o telefone uma vez. Depois disso, ao entrar de novo, a conta já aparece pronta —
          sem repetir código.
        </p>
        {error ? <div className="banner">{error}</div> : null}
        {banner ? (
          <div className={`banner ${banner.includes("conectada") ? "ok" : ""}`}>{banner}</div>
        ) : null}
        {!loading && connected.length > 0 && !needsLinkForm ? (
          <div className="banner ok">
            Telegram conectado. Pode ir em Agendamentos — não precisa vincular de novo.
          </div>
        ) : null}
        {loading ? (
          <p className="empty">Carregando contas…</p>
        ) : accounts.length === 0 ? (
          <p className="empty">Nenhuma conta ainda — vincule o telefone abaixo (só na primeira vez).</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Criada (Brasília)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.label}</td>
                    <td>{account.phone}</td>
                    <td>
                      <span className={`badge ${account.status}`}>
                        {ACCOUNT_STATUS_LABEL[account.status]}
                      </span>
                    </td>
                    <td>{formatBrasilia(account.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        {account.status === "pending" ? (
                          <>
                            <button className="ghost" onClick={() => continuePending(account)}>
                              Continuar
                            </button>
                            <button
                              className="ghost"
                              disabled={busy}
                              onClick={() => void retry(account)}
                            >
                              Reenviar código
                            </button>
                          </>
                        ) : null}
                        {account.status === "error" ? (
                          <button
                            className="ghost"
                            disabled={busy}
                            onClick={() => void retry(account)}
                          >
                            Tentar novamente
                          </button>
                        ) : null}
                        <button className="danger" onClick={() => remove(account)}>
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {connected.length > 0 && !needsLinkForm ? (
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button type="button" className="ghost" onClick={() => setShowAdd(true)}>
              Adicionar outra conta
            </button>
          </div>
        ) : null}
      </section>

      {needsLinkForm ? (
        <section className="card">
          <h2>{connected.length ? "Adicionar conta" : "Vincular telefone"}</h2>
          <div className="steps">
            <b className={step === 1 ? "active" : ""}>1. Telefone</b>
            <span>→</span>
            <b className={step === 2 ? "active" : ""}>2. Código / 2FA</b>
          </div>
          {telegramApp && !appReady ? (
            <div className="banner">
              Configure seu app Telegram (api_id e api_hash) antes de vincular o telefone.{" "}
              <Link to="/configuracao">Abrir Configuração</Link>
            </div>
          ) : null}
          {step === 1 ? (
            <form className="grid two" onSubmit={submitStart}>
              <label>
                Nome
                <input
                  className={fieldErrors.label ? "invalid" : ""}
                  value={form.label}
                  onChange={(e) => setField("label", e.target.value)}
                  placeholder="Pessoal"
                />
                {fieldErrors.label ? <span className="field-error">{fieldErrors.label}</span> : null}
              </label>
              <label>
                Telefone
                <input
                  className={fieldErrors.phone ? "invalid" : ""}
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="+5511999999999"
                />
                {fieldErrors.phone ? <span className="field-error">{fieldErrors.phone}</span> : null}
              </label>
              <div className="row-actions">
                <button className="primary" disabled={busy || !appReady}>
                  {busy ? "Enviando código…" : "Enviar código"}
                </button>
                {connected.length > 0 ? (
                  <button type="button" className="ghost" onClick={() => setShowAdd(false)}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <form className="grid two" onSubmit={submitConfirm}>
              <label>
                Código
                <input
                  className={fieldErrors.code ? "invalid" : ""}
                  value={form.code}
                  onChange={(e) => setField("code", e.target.value)}
                  placeholder="12345"
                />
                {fieldErrors.code ? <span className="field-error">{fieldErrors.code}</span> : null}
              </label>
              <label>
                Senha 2FA {need2fa ? "(obrigatória)" : "(se houver)"}
                <input
                  type="password"
                  className={fieldErrors.password ? "invalid" : ""}
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                />
                {fieldErrors.password ? (
                  <span className="field-error">{fieldErrors.password}</span>
                ) : null}
              </label>
              <div className="row-actions">
                <button className="primary" disabled={busy}>
                  {busy ? "Confirmando…" : "Confirmar"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setStep(1);
                    setPendingId(null);
                  }}
                >
                  Voltar
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}
    </>
  );
}
