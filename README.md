# TelegramSophia

Aplicação para **conectar contas Telegram** (Telethon) e **agendar envios de mensagem** com janela curta de tentativas, pensada para disparos no horário certo (fuso de Brasília).

O usuário entra no painel, vincula o Telegram com telefone + código (e 2FA se houver), cria um agendamento (chat, texto, data/hora) e um worker em background tenta enviar exatamente a partir de `run_at`, repetindo a cada `retry_interval_ms` até conseguir ou acabar a janela.

---

## O que foi construído

### Visão geral

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| Frontend | Vite + React 19 + TypeScript + React Router + axios | Login, contas, agendamentos |
| API | Django + DRF + SimpleJWT | Auth, CRUD, login Telegram |
| Worker | `manage.py run_worker` (asyncio) | Claim atômico + envio Telethon |
| Banco | PostgreSQL 16 | Contas, agendas, logs |
| Infra | Docker Compose + Makefile | `db`, `api`, `worker`, `frontend` |

Sessões do Telegram **nunca** voltam na API: a `StringSession` é criptografada com **Fernet** (`FERNET_KEY`) e fica só no banco.

Horários na UI são sempre **America/Sao_Paulo**.

### Fluxo principal

1. Cadastro (`POST /api/auth/register/`) ou login JWT.
2. Vincular conta: `start` (envia código) → `confirm` (código / senha 2FA) → status `connected`. Retry em `error`/`pending` reusa a mesma linha.
3. Criar `Schedule` com chat, mensagem, `run_at`, antecedência (`lead_seconds`), janela e intervalo.
4. O worker, a cada 1s, pega agendas `pending` com `run_at - lead_seconds <= agora`, marca `running` (sem duplicar), resolve o chat antes da hora e no `run_at` chama `send_message`.
5. Cada tentativa vira `SendLog` (hora + latência em ms). Sucesso → `sent`. Flood → `failed`. Sessão inválida → conta `error`. Fim da janela sem sucesso → `failed`.

---

## Estrutura do repositório

```
TelegramSophia/
├── backend/                 # Django
│   ├── config/              # settings, urls, JWT, CORS, env
│   ├── core/                # models, API, crypto, login Telethon
│   ├── worker/              # engine asyncio + command run_worker
│   └── scripts/poc_telegram.py
├── frontend/                # Vite React TS
│   └── src/pages/           # Login, Contas, Agendamentos
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── Makefile                 # up, test, logs, down
└── .env.example
```

---

## Modelos (app `core`)

**TelegramAccount**  
Dono (User), rótulo, telefone, `session_encrypted`, `phone_code_hash` (login em andamento), status `pending | connected | error`.

**Schedule**  
Conta, `chat_ref` (`@user`, link ou id), mensagem, `run_at`, `lead_seconds` (0–30, default 5), `max_window_seconds` (1–60, default 15), `retry_interval_ms` (≥ 100, default 200), status `pending | running | sent | failed | cancelled`.

**SendLog**  
Agendamento, `attempt_at`, `success`, `error`, `latency_ms`.

---

## API (JWT)

Auth: `POST /api/auth/register/`, `POST /api/auth/login/` e `POST /api/auth/refresh/` (`username` / `password`). Login e `accounts/start` têm throttle.

Rotas autenticadas (sempre filtradas pelo `owner`):

| Método | Caminho | Ação |
| --- | --- | --- |
| POST | `/api/accounts/start/` | Cria conta `pending` (reusa `error`/`pending` do mesmo telefone) |
| POST | `/api/accounts/{id}/retry/` | Reenvia código em `pending` ou `error` |
| POST | `/api/accounts/{id}/confirm/` | `sign_in` (2FA e código inválido), sessão final, `connected` |
| GET | `/api/accounts/` | Lista (sem sessão) |
| DELETE | `/api/accounts/{id}/` | Logout Telethon + remove |
| GET/POST | `/api/schedules/` | Listar / criar (só conta `connected`) |
| PATCH/PUT/DELETE | `/api/schedules/{id}/` | Só se `pending` |
| POST | `/api/schedules/{id}/cancel/` | Só se `pending` |
| GET | `/api/send-logs/?schedule=` | Tentativas do agendamento |
| GET | `/api/health/` | Saúde da API + Postgres (público) |

Validações de agenda: `run_at` no futuro; lead 0–30; janela 1–60; intervalo ≥ 100; conta do usuário e `connected`.

---

## Worker

Command: `python manage.py run_worker` (alias: `worker`).

- Poll a cada **1 segundo**.
- Reaper: `running` preso após crash vira `pending` se a janela ainda vale, senão `failed`.
- Claim atômico: `select_for_update(skip_locked=True)` + update `pending` → `running`.
- Reusa clientes Telethon por conta; desconecta ociosos (`--idle-seconds`, default 30).
- No horário: `send_message` a cada `retry_interval_ms` até sucesso ou `max_window_seconds`.
- Erro de **permissão de escrita**: tenta de novo na janela.
- **FloodWaitError**: para e marca `failed`.
- **Sessão inválida**: conta `error` e agenda `failed`.
- `--once` processa um ciclo e sai.

---

## Frontend

Rotas: `/login`, `/contas`, `/agendamentos` (protegidas).

- JWT no `localStorage`; axios com refresh automático no interceptor; “Sessão expirada” no login após 401.
- Cadastro na mesma tela de login.
- **Contas:** lista com status em português; 2 passos (telefone → código/2FA); “Tentar novamente” em `error`; remover.
- **Agendamentos:** formulário (conta, chat, mensagem, data/hora Brasília, lead, janela, intervalo); editar `pending`; tabela com polling **3s** e loading; cancelar; detalhes fecham se a agenda sumir.
- Validação no cliente + erros da API no banner e por campo.
- Proxy Vite `/api` → `http://127.0.0.1:8000` (no Docker: `http://api:8000`).

---

## Variáveis de ambiente (`.env`)

```bash
cp .env.example .env
```

| Variável | Função |
| --- | --- |
| `SECRET_KEY` | Django / JWT (string longa, ≥ 32 caracteres) |
| `DEBUG` | `True` em desenvolvimento |
| `ALLOWED_HOSTS` | `localhost`, `127.0.0.1`, `api` (nome do serviço Docker) |
| `POSTGRES_DB/USER/PASSWORD` | Credenciais do banco |
| `POSTGRES_HOST` | Fora do Docker: `localhost`. No Compose a API usa `db` |
| `POSTGRES_PORT` | Host: `5433` (5432 local já costuma estar ocupada). Interno Docker: `5432` |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` |
| `TIME_ZONE` | `America/Sao_Paulo` |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | App Telethon |
| `FERNET_KEY` | Criptografa a sessão Telegram |

### `FERNET_KEY`

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Cole em `FERNET_KEY=`. Sem isso o vínculo de conta e os testes de conta quebram.

### `api_id` e `api_hash`

1. [my.telegram.org](https://my.telegram.org) com o número da conta.
2. **API development tools** → criar um app.
3. Copiar **App api_id** e **App api_hash**.

---

## Como subir

### Docker (recomendado)

```bash
make up      # db + api + worker + frontend
make logs
make test
make down
```

- App: http://localhost:5173  
- API: http://localhost:8000/api/health/  
- Postgres: `localhost:5433`

Crie o usuário na tela **Criar conta** (http://localhost:5173/login) ou:

```bash
docker compose exec api python manage.py createsuperuser
```

Ambiente local de desenvolvimento já pode ter o usuário **`admin` / `admin123`**.

A API sobe com **Gunicorn**; o frontend é o build do Vite servido pelo Nginx. Sem `FERNET_KEY` e `TELEGRAM_API_*` a API/worker recusam subir.

### Sem Docker na API (só o banco no Compose)

```bash
docker compose up -d db
cd backend && python3 -m venv ../.venv && source ../.venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
python manage.py run_worker    # outro terminal
cd ../frontend && npm install && npm run dev
```

---

## Testes

```bash
make test
# ou localmente:
cd backend && python manage.py test
```

Cobertura: JWT, cadastro, permissões, validações (conta `connected`, agenda `pending`), login Telegram mockado, retry sem duplicar conta, reaper de `running` preso, claim atômico do worker.

CI: GitHub Actions (`python manage.py test` com Postgres 16).

---

## Roteiro de teste manual

1. `make up` e login em http://localhost:5173/login.
2. **Contas:** nome + telefone com DDI (`+55…`) → enviar código → código (e 2FA) → status `connected`.
3. **Agendamentos:** conta conectada, chat, mensagem, horário **2 minutos à frente** (Brasília), lead 5, janela 15, intervalo 200 → Agendar.
4. A tabela deve ir `pending` → `running` → `sent` (atualiza sozinha a cada 3s).
5. **Detalhes:** tentativas com hora em Brasília e latência em ms.
6. `make logs` no serviço `worker` acompanha o envio.

---

## POC Telethon (opcional, sem Django)

```bash
source .venv/bin/activate
python backend/scripts/poc_telegram.py @usuario
```

Login interativo; persiste `StringSession` em `backend/scripts/.telegram_string_session` (gitignored); envia `"teste"` e imprime o tempo em ms. `FloodWaitError` só imprime o tempo de espera (sem retry).
