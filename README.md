# AçaIA 🫐

**AçaIA** = açaí + IA: um assistente de IA conversacional em português do Brasil, rápido, barato e brasileiro.

Dois níveis de modelo, escolhidos por um orquestrador:

- **AçaIA Copinho**: modelo aberto pequeno, ajustado por nós com LoRA (a partir da Fase 3).
- **AçaIA Pro**: modelo de fronteira via API, só para perguntas difíceis.

> **Status:** Fase 0 — Fundação. Chat local com respostas em streaming; conversas ficam em memória (somem ao reiniciar a API). Login, banco de verdade e deploy chegam na Fase 1. Veja [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Rodando localmente (Windows, macOS ou Linux)

Pré-requisitos: **Node.js 24 ou 26**, **Docker** (Docker Desktop no Windows) e **Git**. O passo a passo detalhado para Windows 10 está no [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

```powershell
git clone https://github.com/eduardovicentinilevy/a-aia.git
cd a-aia
npm install
npm run env:init
npm run db:up
npm run dev
```

Abra **http://localhost:5173** e converse. Sem configurar nada, quem responde é o `MockProvider` (respostas de teste, sem internet e sem custo). Para usar um modelo real de graça, siga "Configurar o Pro" no RUNBOOK.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run env:init` | Cria o `.env` a partir do `.env.example` (só se ainda não existir) |
| `npm run db:up` / `npm run db:down` | Sobe / derruba o PostgreSQL 17 + pgvector no Docker |
| `npm run dev` | Sobe a API (http://localhost:8080) e o chat web (http://localhost:5173) |
| `npm test` | Roda todos os testes (API e web) |
| `npm run build -w apps/web` | Gera o site de produção do chat em `apps/web/dist/` |
| `npm run pro:models` | Lista os modelos disponíveis para a sua chave do Pro |

## Estrutura

```
apps/api/      API Node.js/Express: rotas, orquestrador, providers, prompts
apps/web/      Chat web em React + CSS puro (Vite), com o açaí como cor principal
infra/         docker-compose do banco local
scripts/       utilitários de desenvolvimento (multiplataforma)
docs/          PROGRESS, DECISIONS, RUNBOOK e guia do Google Cloud
CLAUDE.md      prompt mestre do projeto (escopo, arquitetura e fases)
```

## Documentação

- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — instalar, subir, testar, resolver problemas
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decisões de arquitetura e dependências, com o motivo
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — o que foi feito em cada fase e o que falta
- [`docs/GCP_SETUP.md`](docs/GCP_SETUP.md) — criar o projeto no Google Cloud com alerta de orçamento
