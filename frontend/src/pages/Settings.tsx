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
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getTelegramApp();
        if (cancelled) return;
        setConfig(data);
        if (data.api_id) setApiId(String(data.api_id));
        setEditing(!data.has_own_app);
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
    const hash = apiHash.trim();
    if (!config?.has_own_app && hash.length < 8) {
      setError("Informe o App api_hash completo.");
      return;
    }
    if (hash && hash.length < 8) {
      setError("Informe o App api_hash completo.");
      return;
    }
    setBusy(true);
    try {
      const saved = await saveTelegramApp({ api_id: id, api_hash: hash });
      setConfig(saved);
      setApiHash("");
      setEditing(false);
      setBanner("App Telegram salvo. Você não precisa digitar isso de novo ao entrar.");
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
        Configura uma vez. Nas próximas vezes que entrar, isso já fica guardado na sua conta.
      </p>
      {loading ? <p className="empty">Carregando…</p> : null}
      {banner ? <div className="banner ok">{banner}</div> : null}
      {error ? <div className="banner">{error}</div> : null}

      {!loading && config?.has_own_app && !editing ? (
        <div className="saved-block">
          <p className="when-preview">
            Já configurado ✓ — api_id {config.api_id} · hash {config.api_hash_masked}
          </p>
          <p className="muted tiny">
            Não precisa colar de novo. Só altere se trocar o app no Telegram.
          </p>
          <div className="row-actions">
            <button type="button" className="ghost" onClick={() => setEditing(true)}>
              Alterar app
            </button>
          </div>
        </div>
      ) : null}

      {!loading && (!config?.has_own_app || editing) ? (
        <>
          {config?.using_server_fallback && !config.has_own_app ? (
            <p className="muted">
              O servidor tem um app padrão. Você ainda pode colar o seu para não depender dele.
            </p>
          ) : null}
          {!config?.has_own_app && !config?.using_server_fallback ? (
            <div className="banner">Falta configurar o app antes de vincular o telefone.</div>
          ) : null}

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
              Crie um app e copie <strong>api_id</strong> e <strong>api_hash</strong>.
            </li>
            <li>Cole abaixo e salve. Depois vá em Contas.</li>
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
                  placeholder={
                    config?.has_own_app
                      ? `Já salvo (${config.api_hash_masked}) — deixe em branco para manter`
                      : "cole o hash completo"
                  }
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="row-actions">
              <button className="primary" disabled={busy || loading}>
                {busy ? "Salvando…" : "Salvar app Telegram"}
              </button>
              {config?.has_own_app ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setEditing(false);
                    setApiHash("");
                    setError("");
                  }}
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}
