import { type FormEvent, useState } from "react";
import { confirmAccount, deleteAccount, listAccounts, startAccount } from "../api/accounts";
import { ApiError } from "../api/errors";
import { formatBrasilia } from "../datetime";
import { usePolling } from "../hooks/usePolling";
import type { TelegramAccount } from "../types";

interface FormState {
  label: string;
  phone: string;
  code: string;
  password: string;
}

const EMPTY: FormState = { label: "", phone: "", code: "", password: "" };

export default function Accounts() {
  const { data: accounts, error, reload } = usePolling(listAccounts, 3000);
  const [step, setStep] = useState<1 | 2>(1);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Partial<FormState>>({});
  const [banner, setBanner] = useState("");
  const [need2fa, setNeed2fa] = useState(false);
  const [busy, setBusy] = useState(false);

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
    if (!validateStart()) return;
    setBusy(true);
    try {
      const account = await startAccount({
        label: form.label.trim(),
        phone: form.phone.replace(/\s/g, ""),
      });
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
      setBanner("Conta conectada.");
      setStep(1);
      setPendingId(null);
      setForm(EMPTY);
      setNeed2fa(false);
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

  return (
    <>
      <section className="card">
        <h2>Vincular conta Telegram</h2>
        <div className="steps">
          <b className={step === 1 ? "active" : ""}>1. Telefone</b>
          <span>→</span>
          <b className={step === 2 ? "active" : ""}>2. Código / 2FA</b>
        </div>
        {banner ? (
          <div className={`banner ${banner.includes("conectada") ? "ok" : ""}`}>{banner}</div>
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
              <button className="primary" disabled={busy}>
                {busy ? "Enviando código…" : "Enviar código"}
              </button>
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

      <section className="card">
        <h2>Contas</h2>
        {error ? <div className="banner">{error}</div> : null}
        {accounts.length === 0 ? (
          <p className="empty">Nenhuma conta ainda.</p>
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
                      <span className={`badge ${account.status}`}>{account.status}</span>
                    </td>
                    <td>{formatBrasilia(account.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        {account.status === "pending" ? (
                          <button className="ghost" onClick={() => continuePending(account)}>
                            Continuar
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
      </section>
    </>
  );
}
