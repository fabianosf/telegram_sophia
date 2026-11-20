import { type FormEvent, useEffect, useState } from "react";
import { getTelegramApp, saveTelegramApp } from "../api/telegramApp";
import type { TelegramAppConfig } from "../types";

export default function Settings() {
  const [config, setConfig] = useState<TelegramAppConfig | null>(null);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getTelegramApp();
        if (cancelled) return;
        setConfig(data);
        if (data.api_id) setApiId(String(data.api_id));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBanner("");
    const id = Number(apiId.trim());
    if (!Number.isInteger(id) || id < 1) {
      setError("Informe o App api_id (só números).");
      return;
    }
    if (apiHash.trim().length < 8) {
      setError("Informe o App api_hash completo.");
      return;
    }
    setBusy(true);
    try {
      const saved = await saveTelegramApp({ api_id: id, api_hash: apiHash.trim() });
      setConfig(saved);
      setApiHash("");
      setBanner("App Telegram salvo. Agora você pode vincular o telefone em Contas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Seu app Telegram</h2>
      <p className="muted">
        Cada pessoa usa o <strong>próprio</strong> api_id e api_hash. Não copie o de outra
        conta — o Telegram associa esse par ao seu número.
      </p>
      {loading ? <p className="empty">Carregando…</p> : null}
      {banner ? <div className="banner ok">{banner}</div> : null}
      {error ? <div className="banner">{error}</div> : null}
      {config?.has_own_app ? (
        <p className="when-preview">
          Configurado: api_id {config.api_id} · hash {config.api_hash_masked}
        </p>
      ) : config?.using_server_fallback ? (
        <p className="muted">
          O servidor tem um app padrão. Você ainda pode colar o seu para não depender dele.
        </p>
      ) : (
        <div className="banner">Falta configurar o app antes de vincular o telefone.</div>
      )}

      <ol className="manual">
        <li>
          Abra{" "}
          <a href="https://my.telegram.org" target="_blank" rel="noreferrer">
            my.telegram.org
          </a>{" "}
          e entre com o <strong>mesmo número</strong> que vai usar aqui.
        </li>
        <li>
          Clique em <strong>API development tools</strong>.
        </li>
        <li>
          Crie um app (Title e Short name podem ser qualquer coisa, ex.: Sophia).
        </li>
        <li>
          Copie <strong>App api_id</strong> (número) e <strong>App api_hash</strong> (texto).
        </li>
        <li>Cole os dois abaixo e salve. Depois vá em Contas e envie o código.</li>
      </ol>

      <form className="grid" onSubmit={submit}>
        <div className="grid two">
          <label>
            App api_id
            <input
              value={apiId}
              onChange={(e) => setApiId(e.target.value)}
              placeholder="12345678"
              inputMode="numeric"
            />
          </label>
          <label>
            App api_hash
            <input
              value={apiHash}
              onChange={(e) => setApiHash(e.target.value)}
              placeholder={config?.api_hash_masked || "cole o hash completo"}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="row-actions">
          <button className="primary" disabled={busy || loading}>
            {busy ? "Salvando…" : "Salvar app Telegram"}
          </button>
        </div>
      </form>
    </section>
  );
}
