import { type FormEvent, useEffect, useMemo, useState } from "react";
import { listAccounts } from "../api/accounts";
import { ApiError } from "../api/errors";
import { cancelSchedule, createSchedule, listSchedules, listSendLogs } from "../api/schedules";
import { brasiliaLocalToISO, formatBrasilia, toBrasiliaDateTimeLocal } from "../datetime";
import { usePolling } from "../hooks/usePolling";
import type { Schedule, SendLog } from "../types";

interface FormState {
  account: string;
  chat_ref: string;
  message: string;
  run_at: string;
  lead_seconds: string;
  max_window_seconds: string;
  retry_interval_ms: string;
}

function emptyForm(): FormState {
  return {
    account: "",
    chat_ref: "",
    message: "",
    run_at: toBrasiliaDateTimeLocal(new Date(), 10 * 60 * 1000),
    lead_seconds: "5",
    max_window_seconds: "15",
    retry_interval_ms: "200",
  };
}

export default function Schedules() {
  const { data: schedules, error, reload } = usePolling(listSchedules, 3000);
  const { data: accounts } = usePolling(listAccounts, 3000);
  const connected = accounts.filter((item) => item.status === "connected");
  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map((item) => [item.id, item])),
    [accounts]
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<FormState>>({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function setField(name: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  }

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.account) next.account = "Escolha uma conta conectada.";
    if (!form.chat_ref.trim()) next.chat_ref = "Informe @username, link ou id.";
    if (!form.message.trim()) next.message = "Escreva a mensagem.";
    if (!form.run_at) next.run_at = "Informe data e hora (Brasília).";
    else if (new Date(brasiliaLocalToISO(form.run_at)).getTime() <= Date.now()) {
      next.run_at = "A data/hora precisa ser no futuro (Brasília).";
    }
    const lead = Number(form.lead_seconds);
    if (!Number.isInteger(lead) || lead < 0 || lead > 30) {
      next.lead_seconds = "Use um valor entre 0 e 30.";
    }
    const windowSec = Number(form.max_window_seconds);
    if (!Number.isInteger(windowSec) || windowSec < 1 || windowSec > 60) {
      next.max_window_seconds = "Use um valor entre 1 e 60.";
    }
    const interval = Number(form.retry_interval_ms);
    if (!Number.isInteger(interval) || interval < 100) {
      next.retry_interval_ms = "Mínimo 100 ms.";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBanner("");
    if (!validate()) return;
    setBusy(true);
    try {
      await createSchedule({
        account: Number(form.account),
        chat_ref: form.chat_ref.trim(),
        message: form.message,
        run_at: brasiliaLocalToISO(form.run_at),
        lead_seconds: Number(form.lead_seconds),
        max_window_seconds: Number(form.max_window_seconds),
        retry_interval_ms: Number(form.retry_interval_ms),
      });
      setBanner("Agendamento criado.");
      setForm({ ...emptyForm(), account: form.account });
      await reload();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors({
          account: err.field("account"),
          chat_ref: err.field("chat_ref"),
          message: err.field("message"),
          run_at: err.field("run_at"),
          lead_seconds: err.field("lead_seconds"),
          max_window_seconds: err.field("max_window_seconds"),
          retry_interval_ms: err.field("retry_interval_ms"),
        });
      }
      setBanner(err instanceof Error ? err.message : "Não foi possível criar o agendamento.");
    } finally {
      setBusy(false);
    }
  }

  async function onCancel(schedule: Schedule) {
    setBanner("");
    try {
      await cancelSchedule(schedule.id);
      await reload();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Falha ao cancelar.");
    }
  }

  return (
    <>
      <section className="card">
        <h2>Novo agendamento</h2>
        {banner ? (
          <div className={`banner ${banner.includes("criado") ? "ok" : ""}`}>{banner}</div>
        ) : null}
        {connected.length === 0 ? (
          <p className="empty">Conecte uma conta Telegram antes de agendar.</p>
        ) : null}
        <form className="grid" onSubmit={submit}>
          <div className="grid two">
            <label>
              Conta
              <select
                className={fieldErrors.account ? "invalid" : ""}
                value={form.account}
                onChange={(e) => setField("account", e.target.value)}
              >
                <option value="">Selecione</option>
                {connected.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label} ({account.phone})
                  </option>
                ))}
              </select>
              {fieldErrors.account ? (
                <span className="field-error">{fieldErrors.account}</span>
              ) : null}
            </label>
            <label>
              Chat (@username, link ou id)
              <input
                className={fieldErrors.chat_ref ? "invalid" : ""}
                value={form.chat_ref}
                onChange={(e) => setField("chat_ref", e.target.value)}
                placeholder="@canal ou -100…"
              />
              {fieldErrors.chat_ref ? (
                <span className="field-error">{fieldErrors.chat_ref}</span>
              ) : null}
            </label>
          </div>
          <label>
            Mensagem
            <textarea
              className={fieldErrors.message ? "invalid" : ""}
              value={form.message}
              onChange={(e) => setField("message", e.target.value)}
            />
            {fieldErrors.message ? <span className="field-error">{fieldErrors.message}</span> : null}
          </label>
          <div className="grid two">
            <label>
              Data/hora (Brasília)
              <input
                type="datetime-local"
                className={fieldErrors.run_at ? "invalid" : ""}
                value={form.run_at}
                onChange={(e) => setField("run_at", e.target.value)}
              />
              {fieldErrors.run_at ? <span className="field-error">{fieldErrors.run_at}</span> : null}
            </label>
            <div className="grid three">
              <label>
                Antecedência (s)
                <input
                  type="number"
                  min="0"
                  max="30"
                  className={fieldErrors.lead_seconds ? "invalid" : ""}
                  value={form.lead_seconds}
                  onChange={(e) => setField("lead_seconds", e.target.value)}
                />
                {fieldErrors.lead_seconds ? (
                  <span className="field-error">{fieldErrors.lead_seconds}</span>
                ) : null}
              </label>
              <label>
                Janela (s)
                <input
                  type="number"
                  min="1"
                  max="60"
                  className={fieldErrors.max_window_seconds ? "invalid" : ""}
                  value={form.max_window_seconds}
                  onChange={(e) => setField("max_window_seconds", e.target.value)}
                />
                {fieldErrors.max_window_seconds ? (
                  <span className="field-error">{fieldErrors.max_window_seconds}</span>
                ) : null}
              </label>
              <label>
                Intervalo (ms)
                <input
                  type="number"
                  min="100"
                  className={fieldErrors.retry_interval_ms ? "invalid" : ""}
                  value={form.retry_interval_ms}
                  onChange={(e) => setField("retry_interval_ms", e.target.value)}
                />
                {fieldErrors.retry_interval_ms ? (
                  <span className="field-error">{fieldErrors.retry_interval_ms}</span>
                ) : null}
              </label>
            </div>
          </div>
          <div className="row-actions">
            <button className="primary" disabled={busy || connected.length === 0}>
              {busy ? "Salvando…" : "Agendar"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Agendamentos</h2>
        <p className="muted">Status atualizado a cada 3 segundos. Horários em Brasília.</p>
        {error ? <div className="banner">{error}</div> : null}
        {schedules.length === 0 ? (
          <p className="empty">Nenhum agendamento.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando (Brasília)</th>
                  <th>Conta</th>
                  <th>Chat</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => {
                  const account = accountMap[schedule.account];
                  return (
                    <tr
                      key={schedule.id}
                      className="clickable"
                      onClick={() => setSelectedId(schedule.id)}
                    >
                      <td>{formatBrasilia(schedule.run_at)}</td>
                      <td>{account ? account.label : `#${schedule.account}`}</td>
                      <td>{schedule.chat_ref}</td>
                      <td>
                        <span className={`badge ${schedule.status}`}>{schedule.status}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(schedule.id);
                            }}
                          >
                            Detalhes
                          </button>
                          {schedule.status === "pending" ? (
                            <button
                              className="danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                void onCancel(schedule);
                              }}
                            >
                              Cancelar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {selectedId ? (
          <ScheduleDetail
            schedule={schedules.find((item) => item.id === selectedId) ?? null}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </section>
    </>
  );
}

function ScheduleDetail({
  schedule,
  onClose,
}: {
  schedule: Schedule | null;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [error, setError] = useState("");

  const scheduleId = schedule?.id;

  useEffect(() => {
    if (!scheduleId) return undefined;
    const logScheduleId = scheduleId;
    let cancelled = false;
    async function load() {
      try {
        const data = await listSendLogs(logScheduleId);
        if (!cancelled) {
          setLogs(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar logs.");
      }
    }
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [scheduleId]);

  if (!schedule) return null;

  return (
    <div className="detail">
      <h2>Tentativas · {schedule.chat_ref}</h2>
      <p className="muted">
        {schedule.message} · {formatBrasilia(schedule.run_at)} · janela {schedule.max_window_seconds}
        s · intervalo {schedule.retry_interval_ms}ms
      </p>
      {error ? <div className="banner">{error}</div> : null}
      {logs.length === 0 ? (
        <p className="empty">Nenhuma tentativa ainda.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hora da tentativa (Brasília)</th>
                <th>Latência</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatBrasilia(log.attempt_at)}</td>
                  <td>{log.latency_ms == null ? "—" : `${log.latency_ms} ms`}</td>
                  <td>
                    <span className={`badge ${log.success ? "ok" : "failed"}`}>
                      {log.success ? "ok" : "falhou"}
                    </span>
                    {log.error ? <div className="muted">{log.error}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row-actions" style={{ marginTop: 12 }}>
        <button className="ghost" onClick={onClose}>
          Fechar detalhes
        </button>
      </div>
    </div>
  );
}
