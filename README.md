# AçaIA 🫐

**AçaIA** = açaí + IA: um assistente de IA conversacional em português do Brasil, rápido, barato e brasileiro.

Dois níveis de modelo, escolhidos por um orquestrador:

- **AçaIA Copinho**: modelo aberto pequeno, ajustado por nós com LoRA (a partir da Fase 3).
- **AçaIA Pro**: modelo de fronteira via API, só para perguntas difíceis.

> **Status:** Fase 1 — Chat e backend. Login (Firebase), histórico no PostgreSQL, limites de uso, moderação básica, chat em React e deploy automático (Cloud Run + Firebase Hosting) prontos; falta o primeiro deploy com as suas contas. Veja [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Rodando localmente (Windows, macOS ou Linux)

Pré-requisitos: **Node.js 24 ou 26**, **Docker** (Docker Desktop no Windows) e **Git**. O passo a passo detalhado para Windows 10 está no [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

```powershell
git clone https://github.com/eduardovicentinilevy/a-aia.git
cd a-aia
npm install
npm run env:init
npm run db:up
npm run db:migrate
npm run dev
```

Abra **http://localhost:5173** e converse. Sem configurar nada:
- quem responde é o `MockProvider` (respostas de teste, sem internet e sem custo);
- o login fica desligado e todos são o usuário "Dev local".

Para usar um modelo real de graça, siga "Configurar o Pro" no RUNBOOK. Para publicar na internet, veja `docs/GCP_SETUP.md` (Fase 1).

**Também tem:** a tela **Humanizar texto** (deixa um texto mais natural, com o mesmo conteúdo) e a **AçaIA para Windows**, um programa que roda no seu computador com o Gemini. Veja o RUNBOOK §11.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run env:init` | Cria o `.env` a partir do `.env.example` (só se ainda não existir) |
| `npm run db:up` / `npm run db:down` | Sobe / derruba o PostgreSQL 17 + pgvector no Docker |
| `npm run db:migrate` / `npm run db:rollback` | Aplica as migrações pendentes / desfaz a última |
| `npm run dev` | Sobe a API (http://localhost:8080) e o chat web (http://localhost:5173) |
| `npm test` | Roda todos os testes (API e web) |
| `npm run build -w apps/web` | Gera o site de produção do chat em `apps/web/dist/` |
| `npm run pro:models` | Lista os modelos disponíveis para a sua chave do Pro |
| `npm run desktop:install` | Instala o que o app para Windows precisa (Electron), uma vez só |
| `npm run desktop:start` | Abre a AçaIA como programa do Windows, sem instalar |
| `npm run desktop:dist` | Gera o instalador `apps/desktop/release/AcaIA-Setup-<versão>.exe` |

## Estrutura

```
apps/api/      API Node.js/Express: rotas, orquestrador, providers, prompts
apps/web/      Chat web em React + CSS puro (Vite), com o açaí como cor principal
apps/desktop/  App para Windows (Electron): a mesma API e o mesmo chat, rodando no seu PC
infra/         docker-compose do banco local e script de setup do Google Cloud
.github/       CI (testes) e deploy automático (Cloud Run + Firebase Hosting)
scripts/       utilitários de desenvolvimento (multiplataforma)
docs/          PROGRESS, DECISIONS, RUNBOOK e guia do Google Cloud
CLAUDE.md      prompt mestre do projeto (escopo, arquitetura e fases)
```

## Documentação

- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — instalar, subir, testar, resolver problemas
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decisões de arquitetura e dependências, com o motivo
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — o que foi feito em cada fase e o que falta
- [`docs/GCP_SETUP.md`](docs/GCP_SETUP.md) — criar o projeto no Google Cloud com alerta de orçamento
