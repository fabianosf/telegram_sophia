import { useEffect, useState } from "react";
import { listAccounts } from "../api/accounts";
import { fetchReport, type ReportResponse } from "../api/reports";
import { usePrefs } from "../prefs";
import type { TelegramAccount } from "../types";

type Preset = "7" | "30" | "90" | "custom";

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** AAAA-MM-DD → DD/MM/AAAA */
function brDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** AAAA-MM-DD → DD/MM */
function brDay(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

function BarChart({
  rows,
  labelKey,
}: {
  rows: Array<{ label: string; sent: number; failed: number }>;
  labelKey?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.sent + r.failed));
  if (!rows.length) return <p className="empty muted">{labelKey || "—"}</p>;
  return (
    <div className="report-bars" role="img">
      {rows.map((row) => (
        <div className="report-bar-row" key={row.label}>
          <div className="report-bar-label" title={row.label}>
            {row.label}
          </div>
          <div className="report-bar-track">
            <div
              className="report-bar-sent"
              style={{ width: `${(row.sent / max) * 100}%` }}
              title={`${row.sent}`}
            />
            <div
              className="report-bar-failed"
              style={{ width: `${(row.failed / max) * 100}%` }}
              title={`${row.failed}`}
            />
          </div>
          <div className="report-bar-nums muted tiny">
            {row.sent}/{row.failed}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { t } = usePrefs();
  const [preset, setPreset] = useState<Preset>("7");
  const [fromDate, setFromDate] = useState(() => isoDaysAgo(7));
  const [toDate, setToDate] = useState(() => isoToday());
  const [account, setAccount] = useState("");
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void listAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void fetchReport({
      from: fromDate,
      to: toDate,
      account: account || undefined,
    })
      .then((report) => {
        if (!cancelled) setData(report);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("report_error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, account, t]);

  function applyPreset(p: Preset) {
    if (p === "custom") {
      setPreset("custom");
      return;
    }
    setPreset(p);
    setFromDate(isoDaysAgo(Number(p)));
    setToDate(isoToday());
  }

  const totals = data?.totals;
  const dayRows =
    data?.by_day.map((d) => ({
      label: brDay(d.date),
      sent: d.sent,
      failed: d.failed,
    })) ?? [];

  return (
    <>
      <section className="card">
        <h2>{t("nav_reports")}</h2>
        <p className="muted">{t("report_hint")}</p>
        <div className="report-filters">
          <div className="quick-times">
            {(["7", "30", "90"] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                className={preset === p ? "active-toggle" : ""}
                onClick={() => applyPreset(p)}
              >
                {t(`report_days_${p}`)}
              </button>
            ))}
          </div>
          <div className="report-dates">
            <label>
              {t("report_from")}
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => {
                  setPreset("custom");
                  setFromDate(e.target.value);
                }}
              />
            </label>
            <span className="report-date-sep muted">{t("report_until")}</span>
            <label>
              {t("report_to")}
              <input
                type="date"
                value={toDate}
                min={fromDate}
                max={isoToday()}
                onChange={(e) => {
                  setPreset("custom");
                  setToDate(e.target.value);
                }}
              />
            </label>
          </div>
          <label className="report-account">
            {t("account")}
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">{t("report_all_accounts")}</option>
              {accounts.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? <div className="banner">{error}</div> : null}
        {loading ? <p className="empty">{t("loading")}</p> : null}
        {!loading && totals ? (
          <>
            <p className="muted tiny">
              {t("report_period")}: {brDate(data?.from || fromDate)} {t("report_until")}{" "}
              {brDate(data?.to || toDate)}
            </p>
            <div className="report-kpis">
              <div className="report-kpi">
                <span className="muted tiny">{t("report_sent")}</span>
                <strong>{totals.sent}</strong>
              </div>
              <div className="report-kpi">
                <span className="muted tiny">{t("report_failed")}</span>
                <strong>{totals.failed}</strong>
              </div>
              <div className="report-kpi">
                <span className="muted tiny">{t("report_success")}</span>
                <strong>
                  {totals.success_rate == null ? "—" : `${totals.success_rate}%`}
                </strong>
              </div>
              <div className="report-kpi">
                <span className="muted tiny">{t("report_latency")}</span>
                <strong>
                  {totals.avg_latency_ms == null ? "—" : `${totals.avg_latency_ms} ms`}
                </strong>
              </div>
            </div>
            <div className="report-legend muted tiny">
              <span className="legend-sent" /> {t("report_sent")}
              <span className="legend-failed" /> {t("report_failed")}
            </div>
          </>
        ) : null}
      </section>

      {!loading && data ? (
        <div className="report-grid">
          <section className="card">
            <h3>{t("report_by_day")}</h3>
            <BarChart rows={dayRows} labelKey={t("report_empty")} />
          </section>
          <section className="card">
            <h3>{t("report_by_account")}</h3>
            <BarChart
              rows={data.by_account.map((r) => ({
                label: r.label,
                sent: r.sent,
                failed: r.failed,
              }))}
              labelKey={t("report_empty")}
            />
          </section>
          <section className="card report-wide">
            <h3>{t("report_by_dest")}</h3>
            <BarChart
              rows={data.by_destination.map((r) => ({
                label: r.label,
                sent: r.sent,
                failed: r.failed,
              }))}
              labelKey={t("report_empty")}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
