# AçaIA — Prompt mestre de desenvolvimento

> **Como usar:** salve este arquivo como `CLAUDE.md` (ou `AGENTS.md`) na raiz do repositório `acaia` e, a cada sessão, diga ao agente: *"Leia o CLAUDE.md. Estamos na Fase N. Proponha o plano da fase antes de escrever código."* Os prompts de arranque de cada fase estão na seção 10.

---

## 1. Seu papel

Você é um engenheiro de software sênior e mentor. Vai construir comigo, do zero até um beta fechado, a **AçaIA**: um assistente de IA conversacional em português do Brasil, no estilo de Gemini, Claude e Copilot. Você escreve o código, os testes, a infraestrutura e a documentação, e me explica cada conceito novo enquanto trabalha.

## 2. Quem sou eu

- Eduardo, estudante de Engenharia de Software na FIAP (São Paulo).
- Já domino: JavaScript, Node.js, Express, APIs REST, CRUD, SQL (joins, views, transações), MySQL, PostgreSQL, Python básico, HTML/CSS (Flexbox), Git/GitHub, Google Cloud (VMs, Load Balancing, serverless).
- **Ainda não domino:** machine learning, transformers, ajuste fino (LoRA/QLoRA), servir modelos em GPU, RAG/embeddings, streaming (SSE), Docker avançado, CI/CD, segurança de aplicações com LLM.
- Trabalho em meio período no projeto (cerca de 10 a 12 horas por semana). Prefiro passos pequenos, que eu consiga revisar e entender.

## 3. O produto

**AçaIA** = açaí + IA. Um assistente rápido, barato e brasileiro.

Dois níveis de modelo, escolhidos por um orquestrador:

| Nome | O que é | Quando responde |
| --- | --- | --- |
| **AçaIA Copinho** | Modelo **próprio**: um modelo aberto pequeno (1 a 8 bilhões de parâmetros, licença que permita uso comercial) ajustado por nós com LoRA para português do Brasil e para a personalidade da AçaIA. Roda em GPU NVIDIA L4 (24 GB) no Cloud Run. | Por padrão: na maior parte das conversas |
| **AçaIA Pro** | Um modelo de fronteira de terceiros, chamado via API e trocável por configuração. | Só em perguntas difíceis (código longo, raciocínio complexo, contexto grande) ou quando o Copinho falhar |

**Personalidade:** brasileira, simpática, direta e sem enrolação. Responde em PT-BR por padrão e no idioma do usuário quando ele escrever em outro. Admite quando não sabe, cita fontes quando busca na web e recusa pedidos perigosos com educação, oferecendo uma alternativa segura.

**Não vamos treinar um LLM do zero.** O caminho é especializar um modelo aberto, como fazem empresas brasileiras do setor, em escala de estudante.

## 4. Escopo

### Dentro do MVP
1. Chat web com respostas em streaming, histórico de conversas e login.
2. AçaIA Copinho ajustado com LoRA e servido em GPU.
3. AçaIA Pro via API, atrás de uma abstração de provedor.
4. Orquestrador que escolhe o modelo pelo tipo e pela dificuldade da pergunta, com limite de custo por usuário.
5. Upload de PDF com busca semântica nos trechos (RAG com pgvector).
6. Busca na web com as fontes citadas na resposta.
7. Moderação de entrada e de saída, limites de uso e rate limiting.
8. Botões gostei/não gostei em cada resposta, com consentimento opcional para treino.
9. Endpoints de privacidade (LGPD): exportar e apagar todos os meus dados.

### Fora do escopo (não implemente, mesmo se parecer fácil)
- Treinar um modelo do zero; gerar imagem, vídeo, música ou voz.
- App mobile nativo, memória entre conversas, ferramentas externas (agenda, e-mail, execução de código), plano pago, API pública e extensão para VS Code. Tudo isso fica para a Versão 2.
- Usar conversas de usuários para treino sem consentimento explícito.

## 5. Decisões de arquitetura

Estas decisões são fixas. Se alguma estiver desatualizada (biblioteca abandonada, licença mudou, recurso indisponível na região), **pare, explique e proponha uma alternativa** em `docs/DECISIONS.md` antes de seguir.

### 5.1 Visão geral

```
[Chat web] ⇄ [API AçaIA — Node.js/Express no Cloud Run] ⇄ [PostgreSQL + pgvector — Cloud SQL]
                         │
                   [Orquestrador]
          ┌──────────────┼──────────────┐
   [Busca na web]  [AçaIA Copinho]  [AçaIA Pro]
                   vLLM em GPU L4     API de terceiros
                   no Cloud Run

Ciclo de melhoria (assíncrono): avaliações com consentimento → dataset → ajuste fino LoRA → nova versão do Copinho
```

### 5.2 Stack
- **API:** Node.js (LTS atual), Express, JavaScript com ES Modules e JSDoc. Validação com `zod`, segurança com `helmet`, CORS restrito e rate limit.
- **Web:** HTML, CSS e JavaScript puro (ES Modules), sem framework no MVP. Streaming via `fetch` + `ReadableStream` lendo SSE (não use `EventSource`, que não aceita POST). Markdown renderizado com sanitização (`DOMPurify` ou equivalente).
- **Banco:** PostgreSQL com a extensão `pgvector` (Cloud SQL em produção, Docker em desenvolvimento). Migrações versionadas, por exemplo com `node-pg-migrate`.
- **Login:** Firebase Authentication / Identity Platform (Google + e-mail). **Não implemente senha do zero.** A API valida o ID token.
- **Arquivos:** Cloud Storage para os PDFs.
- **Modelo próprio:** Python, PyTorch, Hugging Face (`transformers`, `peft`, `trl`, `datasets`), QLoRA para treinar e **vLLM** para servir com API compatível com OpenAI.
- **Infra:** Docker, `docker compose` local, Cloud Run (API e inferência com GPU), Secret Manager e GitHub Actions com Workload Identity Federation (sem chave JSON).
- **Testes:** `vitest` + `supertest` (Node) e `pytest` (Python).
- **Regiões:** API e banco em `southamerica-east1` (São Paulo). A inferência com GPU vai numa região que tenha L4 no Cloud Run; **verifique a lista atual** na documentação antes de criar.

### 5.3 Estrutura do repositório
```
acaia/
├─ apps/
│  ├─ api/                 # Node.js/Express: rotas, orquestrador, providers, migrações
│  │  ├─ src/
│  │  │  ├─ routes/
│  │  │  ├─ orchestrator/  # pipeline, router, montagem de contexto
│  │  │  ├─ providers/     # model, embedding, search, moderation (interfaces + implementações + mocks)
│  │  │  ├─ db/            # acesso a dados e migrações
│  │  │  ├─ middleware/    # auth, rate limit, erros, logs com mascaramento de PII
│  │  │  └─ prompts/       # system prompt versionado (system.v1.md, ...)
│  │  └─ test/
│  └─ web/                 # chat estático
├─ services/
│  └─ inference/           # Dockerfile do vLLM + config para Cloud Run GPU
├─ ml/
│  ├─ data/                # scripts de montagem de dataset (nunca os dados brutos de usuários)
│  ├─ train/               # QLoRA: configs e scripts
│  ├─ eval/                # harness de avaliação e conjuntos de teste
│  └─ runs/                # config + métricas de cada treino (sem pesos)
├─ infra/                  # docker-compose, scripts de deploy, workflows
├─ docs/
│  ├─ PROGRESS.md          # o que foi feito em cada fase e o que falta
│  ├─ DECISIONS.md         # decisões e trocas, com motivo
│  └─ RUNBOOK.md           # como subir, testar, fazer deploy e reverter
├─ .env.example
└─ CLAUDE.md               # este arquivo
```

### 5.4 Abstrações obrigatórias
Todo serviço externo fica atrás de uma interface, com uma implementação real e um **mock** para testes e desenvolvimento offline:

```js
// ModelProvider
stream({ messages, maxTokens, temperature, signal }) // → AsyncIterable<{ type: 'token'|'done', text?, usage? }>
// EmbeddingProvider
embed(texts) // → number[][]  (dimensão vinda de EMBEDDINGS_DIM)
// SearchProvider
search(query, { limit }) // → [{ title, url, snippet }]
// ModerationProvider
check(text, { direction: 'in'|'out' }) // → { allowed, category, reason }
```

Implementações do `ModelProvider`: `CopinhoProvider` (endpoint compatível com OpenAI do vLLM), `ProProvider` (provedor e modelo definidos por variáveis de ambiente, sem fornecedor fixo no código) e `MockProvider`.

### 5.5 Modelo de dados (ponto de partida)
```sql
users(id uuid pk, auth_uid text unique not null, email text, display_name text,
      created_at timestamptz default now(), deleted_at timestamptz)
conversations(id uuid pk, user_id uuid fk, title text, created_at, updated_at)
messages(id uuid pk, conversation_id uuid fk, role text check (role in ('user','assistant','system')),
         content text, model text, route_reason text, tokens_in int, tokens_out int,
         latency_ms int, first_token_ms int, created_at)
documents(id uuid pk, user_id uuid fk, conversation_id uuid fk null, filename text, mime text,
          size_bytes int, storage_path text, status text, created_at)
chunks(id uuid pk, document_id uuid fk on delete cascade, ord int, content text,
       embedding vector(<EMBEDDINGS_DIM>), created_at)   -- índice HNSW
feedback(id uuid pk, message_id uuid fk, user_id uuid fk, rating smallint check (rating in (-1,1)),
         comment text, consent_training boolean default false, created_at)
usage_daily(user_id uuid, day date, tokens_in int, tokens_out int, cost_cents numeric,
            primary key (user_id, day))
moderation_events(id uuid pk, user_id uuid, message_id uuid null, direction text,
                  category text, action text, created_at)
```
Apagar um usuário apaga em cascata as conversas, as mensagens, os documentos (inclusive no Cloud Storage), os trechos e o feedback.

### 5.6 API HTTP
| Método e rota | Função |
| --- | --- |
| `GET /health` | Saúde do serviço |
| `GET /me` · `DELETE /me` · `GET /me/export` | Perfil, apagar tudo e exportar tudo (LGPD) |
| `GET /me/usage` | Consumo do dia e limite |
| `GET/POST /conversations` · `PATCH/DELETE /conversations/:id` | CRUD de conversas |
| `GET /conversations/:id/messages` | Histórico |
| `POST /conversations/:id/messages` | Envia mensagem e devolve **SSE** com os eventos `meta` (modelo e motivo da rota), `token`, `sources`, `done` e `error` |
| `POST /documents` · `GET /documents` · `DELETE /documents/:id` | Upload de PDF (MVP: até 20 MB e 100 páginas), lista e remoção |
| `POST /messages/:id/feedback` | Gostei/não gostei, com consentimento opcional |
| `GET /admin/metrics` | Métricas agregadas (só para o administrador) |

### 5.7 Orquestrador: pipeline de cada mensagem
1. **Autenticar** e checar o limite diário do usuário (`usage_daily`) e o orçamento mensal global.
2. **Moderação de entrada.** Se bloquear, responda com uma recusa educada, registre em `moderation_events` e encerre.
3. **Montar o contexto:** system prompt versionado, últimas N mensagens (com resumo se ficar longo), top-k trechos dos PDFs da conversa (pgvector) e busca na web quando a pergunta pedir informação atual.
4. **Rotear (regras v1, explicáveis):** vai para o **Pro** se houver código longo, pedido explícito de raciocínio passo a passo, contexto maior que o limite do Copinho ou Copinho indisponível/lento; caso contrário, vai para o **Copinho**. Salve sempre `route_reason`. Se o orçamento do usuário estiver no fim, force o Copinho.
5. **Gerar com streaming.** Todo conteúdo recuperado (PDF ou web) entra **entre delimitadores, marcado como dado não confiável**, e o system prompt instrui o modelo a nunca seguir instruções vindas dele (defesa contra prompt injection).
6. **Moderação de saída.** No MVP, checar ao final e, se reprovar, substituir a resposta por um aviso e registrar.
7. **Persistir** a mensagem, os tokens, o custo estimado, a latência e o tempo até o primeiro token, e enviar `sources` quando houver.
8. **Fallback:** se o Copinho falhar ou estourar o timeout, refazer no Pro e registrar.

### 5.8 Segurança, privacidade e custos
- Segredos só em `.env` local (no `.gitignore`) e no Secret Manager. Nunca no código, em logs ou em commits.
- Logs estruturados **com mascaramento** de e-mail, CPF, telefone, tokens e chaves.
- Rate limit por IP e por usuário, limite de tamanho de corpo e validação de toda entrada com `zod`.
- Todo recurso do Cloud Run com **mínimo de instâncias 0** e máximo baixo; alerta de orçamento no projeto do Google Cloud. **Pergunte antes de criar qualquer recurso que cobre.**
- Páginas de termos de uso (com idade mínima) e de política de privacidade antes do beta.
- Dados de usuário só entram em treino com `consent_training = true`. Não use saídas de provedores cujos termos proíbam treinar outros modelos com elas.

## 6. Regras de trabalho

1. **Uma fase por vez.** No início de cada fase, apresente um plano curto (tarefas, arquivos, dependências novas, riscos) e **espere meu OK**.
2. **Passos pequenos:** commits pequenos no padrão Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
3. **Testes junto com o código:** testes unitários para o router e o orquestrador, de integração para cada rota e `pytest` para avaliação e inferência. Rode os testes antes de dizer que terminou.
4. **Explique o que for novo para mim.** Ao introduzir um conceito (LoRA, vLLM, embeddings, SSE, HNSW, Workload Identity...), escreva 3 a 5 linhas em PT-BR dizendo o que é e por que estamos usando.
5. **Idiomas:** identificadores e comentários de código em inglês; interface, documentação e mensagens para mim em PT-BR.
6. **Poucas dependências.** Justifique cada nova em `docs/DECISIONS.md`.
7. **Ao fim de cada fase:** atualize `docs/PROGRESS.md` e liste o que **eu** preciso fazer manualmente (criar chaves, configurar o console do Google Cloud, convidar testadores).
8. **Na dúvida, pergunte.** Não invente requisitos. Se algo neste arquivo for impossível ou estiver errado, diga.

## 7. Roteiro por fases

| Fase | Entregáveis | Critério de pronto |
| --- | --- | --- |
| **0. Fundação** | Monorepo; `docker compose` com Postgres + pgvector; API com `/health`; página de chat mínima falando com o `ProProvider` em streaming; `MockProvider`; system prompt v1; `.env.example`; README e RUNBOOK iniciais; passo a passo para eu criar o projeto no Google Cloud com alerta de orçamento | `docker compose up` + `npm run dev` → conversa com streaming funcionando localmente; testes passando |
| **1. Chat e backend** | Login (Firebase Auth), CRUD de conversas, histórico persistido, limites de uso, rate limit, moderação básica, migrações, deploy da API no Cloud Run + Cloud SQL + web estática via GitHub Actions | URL pública: faço login, converso, recarrego a página e o histórico continua lá |
| **2. Dados e avaliação** | `ml/eval` com: (a) múltipla escolha no estilo ENEM (acurácia), (b) cerca de 100 instruções em PT-BR julgadas por rubrica (LLM-juiz + amostra humana), (c) conjunto de segurança (recusa correta e recusa indevida); montagem do dataset de ajuste fino (instruções públicas em PT-BR com licença permissiva + pelo menos 300 exemplos autorais da persona e de recusas); linha de base do Pro e de 3 modelos abertos candidatos | `python ml/eval/run.py --model <x>` gera relatório; linha de base registrada em `PROGRESS.md`; licença de cada candidato verificada e anotada |
| **3. AçaIA Copinho** | Treino QLoRA (config em `ml/runs/`), avaliação contra o modelo base, mesclagem do adapter, quantização se preciso para caber na L4, container vLLM no Cloud Run com GPU (mín. 0), `CopinhoProvider` | Copinho supera o modelo base em **≥ 10 pontos** no conjunto de avaliação; primeira palavra em **< 1,5 s** com a instância aquecida |
| **4. Orquestrador e RAG** | Router v1 com `route_reason`, fallback, upload de PDF → extração → chunking → embeddings → pgvector, busca na web com o evento `sources` | **≥ 70%** das respostas no Copinho num conjunto de conversas de teste, sem queda na preferência; toda resposta com busca traz links |
| **5. Segurança e polimento** | Moderação de entrada e saída, bateria de jailbreak e de prompt injection, `DELETE /me` e `GET /me/export`, páginas de termos e privacidade, botões de feedback, `/admin/metrics` | **≥ 95%** de recusa correta no conjunto perigoso e **≤ 5%** de recusa indevida; LGPD testada de ponta a ponta |
| **6. Beta fechado** | Lista de espera e convites, 20 a 30 testadores, painel de métricas, correções, roteiro do vídeo de demo, README final | Metas da seção 8 atingidas ou com o desvio explicado em `PROGRESS.md` |

## 8. Métricas de aceite do MVP

| Métrica | Meta |
| --- | --- |
| Qualidade do Copinho contra o modelo base | +10 pontos |
| Preferência no beta (gostei ÷ total) | ≥ 80% |
| Respostas servidas pelo Copinho | ≥ 70% |
| Tempo até a primeira palavra (Copinho aquecido) | < 1,5 s |
| Custo por conversa (GPU + API) | < R$ 0,10 |
| Recusa correta de pedidos perigosos | ≥ 95% |
| Respostas com busca que trazem link verificável | 100% |
| Testadores que voltam na semana seguinte | ≥ 40% |

## 9. Variáveis de ambiente (`.env.example`)
```
NODE_ENV=development
PORT=8080
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://acaia:acaia@localhost:5432/acaia
FIREBASE_PROJECT_ID=
GCS_BUCKET=
COPINHO_BASE_URL=http://localhost:8000/v1
COPINHO_MODEL=acaia-copinho
COPINHO_TIMEOUT_MS=20000
PRO_PROVIDER=
PRO_API_KEY=
PRO_MODEL=
EMBEDDINGS_PROVIDER=
EMBEDDINGS_MODEL=
EMBEDDINGS_DIM=
SEARCH_PROVIDER=
SEARCH_API_KEY=
MODERATION_PROVIDER=
DAILY_TOKEN_LIMIT_PER_USER=50000
MONTHLY_BUDGET_BRL=150
ADMIN_EMAILS=
```

## 10. Prompts de arranque por fase

Cole um destes no início de cada sessão:

- **Fase 0:** "Leia o CLAUDE.md. Estamos na Fase 0. Proponha o plano, a estrutura de pastas e as dependências antes de escrever código."
- **Fase 1:** "Leia o CLAUDE.md e o docs/PROGRESS.md. Estamos na Fase 1. Comece pelas migrações e pelo middleware de autenticação; explique como o Firebase Auth valida o token."
- **Fase 2:** "Leia o CLAUDE.md e o docs/PROGRESS.md. Estamos na Fase 2. Monte primeiro o harness de avaliação e me explique as métricas antes de montar o dataset."
- **Fase 3:** "Leia o CLAUDE.md e o docs/PROGRESS.md. Estamos na Fase 3. Me explique LoRA e QLoRA, estime o custo de GPU do treino e da inferência e só então escreva os scripts."
- **Fase 4:** "Leia o CLAUDE.md e o docs/PROGRESS.md. Estamos na Fase 4. Comece pelo router v1 com testes; depois, o pipeline de PDF."
- **Fase 5:** "Leia o CLAUDE.md e o docs/PROGRESS.md. Estamos na Fase 5. Monte primeiro as baterias de jailbreak e de prompt injection e rode contra o sistema atual."
- **Fase 6:** "Leia o CLAUDE.md e o docs/PROGRESS.md. Estamos na Fase 6. Prepare a lista de espera, o fluxo de convite e o painel de métricas do beta."
