import { type FormEvent, useEffect, useMemo, useState } from "react";
import { listAccountDialogs, listAccounts } from "../api/accounts";
import { ApiError } from "../api/errors";
import {
  cancelSchedule,
  createSchedule,
  deleteSchedule,
  listSchedules,
  listSendLogs,
  updateSchedule,
} from "../api/schedules";
import {
  brasiliaLocalToISO,
  formatBrasilia,
  toBrasiliaDateTimeLocal,
} from "../datetime";
import { usePolling } from "../hooks/usePolling";
import { usePrefs } from "../prefs";
import type { Schedule, ScheduleStatus, SendLog, TelegramDialog } from "../types";
import { loadScheduleMemory, saveScheduleMemory } from "../userMemory";

interface FormState {
  account: string;
  chat_ref: string;
  chat_title: string;
  message: string;
  run_at: string;
  lead_seconds: string;
  max_window_seconds: string;
  retry_interval_ms: string;
}

function emptyForm(): FormState {
  const mem = loadScheduleMemory();
  return {
    account: mem.account || "",
    chat_ref: mem.chat_ref || "",
    chat_title: mem.chat_title || "",
    message: "",
    run_at: toBrasiliaDateTimeLocal(new Date(), 2 * 60 * 1000),
    lead_seconds: mem.lead_seconds || "5",
    max_window_seconds: mem.max_window_seconds || "15",
    retry_interval_ms: mem.retry_interval_ms || "200",
  };
}

function destinationLabel(schedule: Schedule, savedLabel: string): string {
  const title = (schedule.chat_title || "").trim();
  if (title) return title;
  const ref = schedule.chat_ref.trim();
  if (ref === "me" || ref.toLowerCase() === "eu") return savedLabel;
  return ref;
}

function shortMessage(text: string, max = 64): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function statusKey(status: ScheduleStatus): string {
  return `status_${status}`;
}

export default function Schedules() {
  const { t } = usePrefs();
  const { data: schedules, error, loading, reload } = usePolling(listSchedules, 3000);
  const { data: accounts, loading: loadingAccounts } = usePolling(listAccounts, 3000);
  const connected = accounts.filter((item) => item.status === "connected");
  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map((item) => [item.id, item])),
    [accounts]
  );

  const active = useMemo(
    () => schedules.filter((s) => s.status === "pending" || s.status === "running"),
    [schedules]
  );
  const failed = useMemo(
    () => schedules.filter((s) => s.status === "failed" || s.status === "cancelled"),
    [schedules]
  );
  const history = useMemo(
    () =>
      [...schedules.filter((s) => s.status === "sent")].sort(
        (a, b) => new Date(b.run_at).getTime() - new Date(a.run_at).getTime()
      ),
    [schedules]
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<FormState>>({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogs, setDialogs] = useState<TelegramDialog[]>([]);
  const [dialogsBusy, setDialogsBusy] = useState(false);
  const [dialogsError, setDialogsError] = useState("");
  const [manualDest, setManualDest] = useState(() => Boolean(loadScheduleMemory().manual_dest));

  useEffect(() => {
    const first = accounts.find((a) => a.status === "connected");
    if (!first) return;
    setForm((current) => {
      const stillValid = accounts.some(
        (a) => a.status === "connected" && String(a.id) === current.account
      );
      return stillValid ? current : { ...current, account: String(first.id) };
    });
  }, [accounts]);

  useEffect(() => {
    if (!form.account) {
      setDialogs([]);
      setDialogsError("");
      return;
    }
    let cancelled = false;
    async function loadDialogs() {
      setDialogsBusy(true);
      setDialogsError("");
      try {
        const items = await listAccountDialogs(Number(form.account));
        if (!cancelled) setDialogs(items);
      } catch (err) {
        if (!cancelled) {
          setDialogs([]);
          setDialogsError(
            err instanceof Error ? err.message : "Não foi possível listar grupos."
          );
        }
      } finally {
        if (!cancelled) setDialogsBusy(false);
      }
    }
    void loadDialogs();
    return () => {
      cancelled = true;
    };
  }, [form.account]);

  useEffect(() => {
    if (loading) return;
    if (selectedId && !schedules.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
    if (editingId && !schedules.some((item) => item.id === editingId && item.status === "pending")) {
      setEditingId(null);
    }
  }, [schedules, selectedId, editingId, loading]);

  function setField(name: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  }

  function pickDialog(chatRef: string) {
    if (chatRef === "me") {
      setForm((current) => ({
        ...current,
        chat_ref: "me",
        chat_title: t("saved_messages"),
      }));
      setFieldErrors((current) => ({ ...current, chat_ref: "" }));
      return;
    }
    const dialog = dialogs.find((item) => item.chat_ref === chatRef);
    setForm((current) => ({
      ...current,
      chat_ref: chatRef,
      chat_title: dialog?.title || current.chat_title,
    }));
    setFieldErrors((current) => ({ ...current, chat_ref: "" }));
  }

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.account) next.account = t("select");
    if (!form.chat_ref.trim()) next.chat_ref = t("select_group");
    if (!form.message.trim()) next.message = t("message");
    if (!form.run_at) next.run_at = t("when");
    else if (new Date(brasiliaLocalToISO(form.run_at)).getTime() <= Date.now()) {
      next.run_at = t("when");
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
      const payload = {
        account: Number(form.account),
        chat_ref: form.chat_ref.trim(),
        chat_title: form.chat_title.trim(),
        message: form.message,
        run_at: brasiliaLocalToISO(form.run_at),
        lead_seconds: Number(form.lead_seconds),
        max_window_seconds: Number(form.max_window_seconds),
        retry_interval_ms: Number(form.retry_interval_ms),
      };
      if (editingId) {
        await updateSchedule(editingId, payload);
        setBanner(t("updated"));
        setEditingId(null);
      } else {
        await createSchedule(payload);
        setBanner(t("created"));
      }
      saveScheduleMemory({
        account: form.account,
        chat_ref: form.chat_ref.trim(),
        chat_title: form.chat_title.trim(),
        lead_seconds: form.lead_seconds,
        max_window_seconds: form.max_window_seconds,
        retry_interval_ms: form.retry_interval_ms,
        manual_dest: manualDest,
      });
      setForm({ ...emptyForm(), account: form.account, message: "" });
      await reload();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors({
          account: err.field("account"),
          chat_ref: err.field("chat_ref"),
          message: err.field("message"),
          run_at: err.field("run_at"),
        });
      }
      setBanner(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(schedule: Schedule) {
    setEditingId(schedule.id);
    setSelectedId(null);
    setBanner("");
    setManualDest(false);
    setForm({
      account: String(schedule.account),
      chat_ref: schedule.chat_ref,
      chat_title: schedule.chat_title || "",
      message: schedule.message,
      run_at: toBrasiliaDateTimeLocal(new Date(schedule.run_at)),
      lead_seconds: String(schedule.lead_seconds),
      max_window_seconds: String(schedule.max_window_seconds),
      retry_interval_ms: String(schedule.retry_interval_ms),
    });
  }

  async function onCancel(schedule: Schedule) {
    setBanner("");
    try {
      await cancelSchedule(schedule.id);
      await reload();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Error");
    }
  }

  async function onDelete(schedule: Schedule) {
    setBanner("");
    try {
      await deleteSchedule(schedule.id);
      if (selectedId === schedule.id) setSelectedId(null);
      await reload();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <>
      <section className="card">
        <h2>{editingId ? t("edit_schedule") : t("new_schedule")}</h2>
        {banner ? (
          <div
            className={`banner ${
              banner === t("created") || banner === t("updated") ? "ok" : ""
            }`}
          >
            {banner}
          </div>
        ) : null}
        {loadingAccounts ? (
          <p className="empty">{t("loading_accounts")}</p>
        ) : connected.length === 0 ? (
          <p className="empty">{t("connect_first")}</p>
        ) : null}
        <form className="grid" onSubmit={submit}>
          <div className="grid two">
            <label>
              {t("account")}
              <select
                className={fieldErrors.account ? "invalid" : ""}
                value={form.account}
                onChange={(e) => setField("account", e.target.value)}
              >
                <option value="">{t("select")}</option>
                {connected.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
              {fieldErrors.account ? (
                <span className="field-error">{fieldErrors.account}</span>
              ) : null}
            </label>
            <label>
              {t("group")}
              <select
                className={fieldErrors.chat_ref ? "invalid" : ""}
                value={
                  dialogs.some((d) => d.chat_ref === form.chat_ref) ? form.chat_ref : ""
                }
                disabled={!form.account || dialogsBusy}
                onChange={(e) => {
                  if (e.target.value) pickDialog(e.target.value);
                }}
              >
                <option value="">
                  {dialogsBusy ? t("loading") : t("select_group")}
                </option>
                {dialogs.map((dialog) => (
                  <option key={`${dialog.kind}-${dialog.chat_ref}`} value={dialog.chat_ref}>
                    {dialog.title}
                    {dialog.participants != null ? ` · ${dialog.participants}` : ""}
                  </option>
                ))}
              </select>
              {form.chat_title ? (
                <span className="dest-chip">
                  {t("send_to")}: {form.chat_title}
                </span>
              ) : null}
              {dialogsError ? <span className="field-error">{dialogsError}</span> : null}
              {fieldErrors.chat_ref ? (
                <span className="field-error">{fieldErrors.chat_ref}</span>
              ) : null}
              <div className="quick-times" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => pickDialog("me")}>
                  {t("saved_messages")}
                </button>
                <button type="button" onClick={() => setManualDest((v) => !v)}>
                  {manualDest ? t("hide_other_dest") : t("other_dest")}
                </button>
              </div>
              {manualDest ? (
                <input
                  value={form.chat_ref}
                  onChange={(e) => {
                    setField("chat_ref", e.target.value);
                    setField("chat_title", "");
                  }}
                  placeholder="@group / t.me/+… / id"
                  style={{ marginTop: 8 }}
                />
              ) : null}
            </label>
          </div>
          <label>
            {t("message")}
            <textarea
              className={fieldErrors.message ? "invalid" : ""}
              value={form.message}
              onChange={(e) => setField("message", e.target.value)}
              rows={3}
            />
            {fieldErrors.message ? <span className="field-error">{fieldErrors.message}</span> : null}
          </label>
          <div className="when-block">
            <label>
              {t("when")}
              <input
                type="datetime-local"
                step="1"
                className={fieldErrors.run_at ? "invalid" : ""}
                value={form.run_at}
                onChange={(e) => setField("run_at", e.target.value)}
              />
              {fieldErrors.run_at ? <span className="field-error">{fieldErrors.run_at}</span> : null}
            </label>
            <div className="quick-times">
              {[1, 2, 5, 10].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() =>
                    setField("run_at", toBrasiliaDateTimeLocal(new Date(), minutes * 60 * 1000))
                  }
                >
                  +{minutes} min
                </button>
              ))}
            </div>
            <details className="advanced">
              <summary>{t("advanced")}</summary>
              <div className="grid three">
                <label>
                  {t("lead")}
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={form.lead_seconds}
                    onChange={(e) => setField("lead_seconds", e.target.value)}
                  />
                  <span className="muted tiny">{t("lead_hint")}</span>
                </label>
                <label>
                  {t("window")}
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={form.max_window_seconds}
                    onChange={(e) => setField("max_window_seconds", e.target.value)}
                  />
                  <span className="muted tiny">{t("window_hint")}</span>
                </label>
                <label>
                  {t("retry")}
                  <input
                    type="number"
                    min="100"
                    value={form.retry_interval_ms}
                    onChange={(e) => setField("retry_interval_ms", e.target.value)}
                  />
                  <span className="muted tiny">{t("retry_hint")}</span>
                </label>
              </div>
            </details>
          </div>
          <div className="row-actions">
            <button className="primary" disabled={busy || connected.length === 0}>
              {busy ? t("saving") : editingId ? t("save") : t("schedule")}
            </button>
            {editingId ? (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setEditingId(null);
                  setForm({ ...emptyForm(), account: form.account });
                }}
              >
                {t("cancel_edit")}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <ScheduleSection
        title={t("queue")}
        empty={t("queue_empty")}
        loading={loading}
        error={error}
        items={active}
        accountMap={accountMap}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onEdit={startEdit}
        onCancel={onCancel}
        showEdit
        showCancel
        timeLabel={t("arrives")}
      />

      {failed.length > 0 ? (
        <ScheduleSection
          title={t("failures")}
          empty=""
          loading={false}
          items={failed}
          accountMap={accountMap}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDelete={onDelete}
          showDelete
          timeLabel={t("arrives")}
        />
      ) : null}

      {history.length > 0 ? (
        <section className="card history-card">
          <details className="history-fold">
            <summary>
              <span>
                {t("history")}
                <span className="count-pill">{history.length}</span>
              </span>
              <span className="muted tiny">{t("history_hint")}</span>
            </summary>
            <ScheduleTable
              items={history}
              accountMap={accountMap}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={onDelete}
              showDelete
              timeLabel={t("sent_at")}
            />
          </details>
        </section>
      ) : null}

      {selectedId ? (
        <ScheduleDetail
          schedule={schedules.find((item) => item.id === selectedId) ?? null}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}

function ScheduleSection({
  title,
  empty,
  loading,
  error,
  items,
  accountMap,
  selectedId,
  onSelect,
  onEdit,
  onCancel,
  onDelete,
  showEdit,
  showCancel,
  showDelete,
  timeLabel,
}: {
  title: string;
  empty: string;
  loading: boolean;
  error?: string;
  items: Schedule[];
  accountMap: Record<number, { label: string }>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onEdit?: (schedule: Schedule) => void;
  onCancel?: (schedule: Schedule) => void;
  onDelete?: (schedule: Schedule) => void;
  showEdit?: boolean;
  showCancel?: boolean;
  showDelete?: boolean;
  timeLabel: string;
}) {
  const { t } = usePrefs();
  return (
    <section className="card">
      <h2>
        {title}
        {items.length ? <span className="count-pill">{items.length}</span> : null}
      </h2>
      {error ? <div className="banner">{error}</div> : null}
      {loading ? (
        <p className="empty">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ScheduleTable
          items={items}
          accountMap={accountMap}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onCancel={onCancel}
          onDelete={onDelete}
          showEdit={showEdit}
          showCancel={showCancel}
          showDelete={showDelete}
          timeLabel={timeLabel}
        />
      )}
    </section>
  );
}

function ScheduleTable({
  items,
  accountMap,
  selectedId,
  onSelect,
  onEdit,
  onCancel,
  onDelete,
  showEdit,
  showCancel,
  showDelete,
  timeLabel,
}: {
  items: Schedule[];
  accountMap: Record<number, { label: string }>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onEdit?: (schedule: Schedule) => void;
  onCancel?: (schedule: Schedule) => void;
  onDelete?: (schedule: Schedule) => void;
  showEdit?: boolean;
  showCancel?: boolean;
  showDelete?: boolean;
  timeLabel: string;
}) {
  const { t } = usePrefs();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{timeLabel}</th>
            <th>{t("group")}</th>
            <th>{t("message")}</th>
            <th>{t("status")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((schedule) => {
            const account = accountMap[schedule.account];
            return (
              <tr
                key={schedule.id}
                className={`clickable ${selectedId === schedule.id ? "selected-row" : ""}`}
                onClick={() => onSelect(schedule.id)}
              >
                <td>{formatBrasilia(schedule.run_at)}</td>
                <td>
                  <div className="group-cell">
                    {destinationLabel(schedule, t("saved_messages"))}
                  </div>
                  <div className="muted tiny">
                    {account ? account.label : `#${schedule.account}`}
                  </div>
                </td>
                <td>{shortMessage(schedule.message)}</td>
                <td>
                  <span className={`badge ${schedule.status}`}>
                    {t(statusKey(schedule.status))}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(schedule.id);
                      }}
                    >
                      {t("details")}
                    </button>
                    {showEdit && schedule.status === "pending" && onEdit ? (
                      <button
                        className="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(schedule);
                        }}
                      >
                        {t("edit")}
                      </button>
                    ) : null}
                    {showCancel && schedule.status === "pending" && onCancel ? (
                      <button
                        className="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onCancel(schedule);
                        }}
                      >
                        {t("cancel")}
                      </button>
                    ) : null}
                    {showDelete && onDelete ? (
                      <button
                        className="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDelete(schedule);
                        }}
                      >
                        {t("delete")}
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
  );
}

function ScheduleDetail({
  schedule,
  onClose,
}: {
  schedule: Schedule | null;
  onClose: () => void;
}) {
  const { t } = usePrefs();
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
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
    <section className="card detail">
      <h2>
        {t("details")} · {destinationLabel(schedule, t("saved_messages"))}
      </h2>
      <p className="muted">
        {schedule.message} · {formatBrasilia(schedule.run_at)}
      </p>
      {error ? <div className="banner">{error}</div> : null}
      {logs.length === 0 ? (
        <p className="empty">{t("no_attempts")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("attempt")}</th>
                <th>{t("latency")}</th>
                <th>{t("result")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatBrasilia(log.attempt_at)}</td>
                  <td>{log.latency_ms == null ? "—" : `${log.latency_ms} ms`}</td>
                  <td>
                    <span className={`badge ${log.success ? "ok" : "failed"}`}>
                      {log.success ? t("status_sent") : t("status_failed")}
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
          {t("close")}
        </button>
      </div>
    </section>
  );
}
