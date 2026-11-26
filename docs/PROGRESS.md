# Progresso

## Fase 0 — Fundação · ✅ pronta (falta só a validação no Windows do Eduardo)

**Critério de pronto:** `docker compose up` + `npm run dev` → conversa com streaming funcionando localmente; testes passando.

### Entregue
- **Monorepo** com npm workspaces (`apps/api`, `apps/web`) e scripts multiplataforma (`scripts/dev.mjs`, `scripts/env-init.mjs`).
- **Banco local**: `infra/docker-compose.yml` com PostgreSQL 17 + pgvector 0.8.7 (`npm run db:up`).
- **API** (Express 5):
  - `GET /health`: processo, versão, banco e disponibilidade do pgvector.
  - Conversas com as rotas finais do CLAUDE.md (`POST/GET /conversations`, `GET /conversations/:id/messages`), gravando em memória por enquanto (D-005).
  - `POST /conversations/:id/messages` responde em **SSE** com `meta → token* → done | error`. Se o cliente desconectar, a chamada ao modelo é cancelada e a resposta parcial fica salva.
  - Mede `latency_ms` e `first_token_ms` e grava `route_reason` em cada resposta.
  - `config.js` valida o `.env` com zod; logs em JSON com mascaramento de e-mail, CPF, telefone, tokens e chaves; helmet, CORS restrito e limite de 16 KB no corpo.
  - Trava de segurança: a API não sobe com `NODE_ENV=production` enquanto não houver login.
- **Providers de modelo**: `MockProvider`, adaptador compatível com OpenAI (base do Pro agora e do Copinho na Fase 3) e `ProProvider` configurável por `.env`. `npm run pro:models` lista os modelos da sua chave.
- **System prompt v1** versionado em `apps/api/src/prompts/system.v1.md`, com persona, honestidade, segurança e a regra de "dados não confiáveis" pronta para o RAG.
- **Chat web em React + CSS puro** (Vite), com o **açaí como cor principal** (D-013):
  - paleta `--acai-50…950` em variáveis CSS, com modo claro e escuro;
  - tela inicial com sugestões clicáveis;
  - streaming com cursor e "frutinhas pulando" enquanto espera a primeira palavra;
  - botões "Parar" e "Nova conversa", tempo até a primeira palavra e layout de celular;
  - estado num reducer puro e testado (`useChat` + `chat-reducer.js`).
- **Docs**: README, RUNBOOK (focado em Windows 10), DECISIONS (D-001 a D-012) e GCP_SETUP.

### Verificado (no ambiente Linux de desenvolvimento)
- **86 testes** passando: 61 da API (vitest + supertest), no Node 26 e no 22, inclusive contra o Postgres real do compose, e 25 do web (reducer, formatação e cliente da API).
- `npm run build -w apps/web` gera o bundle de produção (≈ 72 KB com gzip). Corrigi um problema em que o `.env` da raiz fazia o build sair em modo de desenvolvimento (D-014).
- `npm run db:up` → `/health` com `"status":"ok"` e `"pgvector":true`.
- Navegador real (Chromium headless) em http://localhost:5173, nos modos claro e escuro e na tela de celular (Pixel 7):
  - sugestão clicável, streaming, Enter e Shift+Enter, "Parar" e "Nova conversa";
  - nenhum erro no console e nenhuma rolagem horizontal no celular.
- Caminho do Pro testado de ponta a ponta contra um servidor falso compatível com OpenAI:
  - streaming, `usage` e tempo até a primeira palavra;
  - erro 401 vira mensagem amigável no chat e log detalhado no servidor;
  - o texto das mensagens não aparece nos logs.
- **Gemini de verdade verificado** (25/11), com a sua chave e `gemini-3.5-flash-lite`:
  - streaming no navegador, persona da AçaIA e memória da conversa funcionando;
  - os modelos Flash não enviaram nada em streaming neste ambiente, e o timeout mostrou a mensagem amigável como previsto (RUNBOOK §4).
- **Não verificado:** a execução no Windows 10.

### O que **você** precisa fazer
1. [ ] Instalar WSL 2, Docker Desktop, Node 26 (ou 24) e Git (RUNBOOK §1).
2. [ ] Rodar `npm install`, `npm run env:init`, `npm run db:up`, `npm run dev` e `npm test` no Windows e me contar se algo falhar.
3. [ ] Criar a chave gratuita do Gemini **num projeto sem faturamento** e configurar o `.env` (RUNBOOK §4).
4. [ ] Criar o projeto no Google Cloud com o orçamento de R$ 150 e alertas (GCP_SETUP) e me passar o ID do projeto.
5. [ ] Pesquisar "AçaIA" no INPI (https://busca.inpi.gov.br), em domínios (.com.br) e nas redes, como no roteiro. É melhor saber agora se o nome está livre.

### Decisões que precisam de você antes da Fase 1
- **Custo do banco em produção.** O CLAUDE.md fixa o **Cloud SQL**, que **não tem camada gratuita**: a menor instância cobra por mês, mesmo parada. Opções:
  - (a) Cloud SQL usando os créditos da avaliação gratuita, se você tiver;
  - (b) Cloud SQL só quando for publicar de verdade, deixando a URL pública da Fase 1 para depois;
  - (c) trocar por um PostgreSQL gerenciado com plano gratuito e pgvector.

  Como (c) muda uma decisão fixa, vou detalhar custos e trocas no início da Fase 1 para você escolher.
- **Corte automático de gastos** (D-011): quer uma função que desliga o faturamento quando o orçamento estoura?
- **Aviso para mais adiante:** servir o Copinho em GPU L4 (Fase 3) é pago por tempo ligado. Contas em avaliação gratuita em geral não têm cota de GPU (vou confirmar na Fase 3). O treino com QLoRA pode ser feito em notebooks gratuitos.

---

## Fase 1 — Chat e backend · 🟡 código pronto, falta o primeiro deploy (depende de você)

**Critério de pronto:** URL pública: faço login, converso, recarrego a página e o histórico continua lá.

### Entregue
- **Migrações em SQL puro** com executor próprio (D-016): `users`, `conversations`, `messages`, `usage_daily` e `moderation_events`, com apagamento em cascata (LGPD). Comandos: `npm run db:migrate` e `npm run db:rollback`.
- **Store PostgreSQL** com a mesma interface do store em memória. Uma suíte de contrato roda nos dois. O histórico sobrevive a reinícios.
- **CRUD de conversas:** `PATCH` (renomear) e `DELETE` (apagar, com as mensagens).
- **Login:**
  - o middleware valida o ID token do Firebase com `jose` (D-017);
  - lista de convidados com e-mail **verificado** (D-018);
  - rotas `GET /me` e `GET /me/usage`;
  - em desenvolvimento, sem Firebase, todos são o usuário "Dev local".
- **Limites e custo** (D-019):
  - contagem de tokens no streaming e custo estimado;
  - limite diário por usuário (429) e orçamento do mês (503), checados antes do streaming;
  - rate limit por IP (120/min) e por usuário (15 mensagens/min).
- **Moderação básica** (D-020): lista curta de padrões em PT-BR, com contextos de proteção liberados. Recusa educada na entrada, troca da resposta na saída e registro em `moderation_events`.
- **Frontend** (D-021):
  - tela de login (Google, e-mail e senha, recuperar senha) e avisos de "confirme seu e-mail" e "teste fechado";
  - barra lateral com as conversas (abrir, renomear, apagar) e medidor de uso;
  - **Markdown sanitizado com DOMPurify**;
  - gaveta no celular.
- **Deploy** (D-022):
  - `apps/api/Dockerfile`;
  - CI (`ci.yml`, com PostgreSQL real) e Deploy (`deploy.yml`: testes → migrações → Cloud Run → Firebase Hosting);
  - Workload Identity Federation, sem chave JSON;
  - script `infra/gcp/setup.sh`.
- **Docs:** GCP_SETUP (Firebase, Neon, script, variáveis do GitHub), RUNBOOK (deploy, rollback, problemas) e DECISIONS D-015 a D-022.

### Verificado (ambiente Linux de desenvolvimento)
- **181 testes** passando: 136 da API (incluindo contrato do store, migrações e autenticação contra PostgreSQL real) e 45 do web (incluindo sanitização de Markdown contra XSS). `npm audit`: 0 vulnerabilidades.
- **Teste no navegador com PostgreSQL e Gemini reais:**
  - Markdown com negrito, listas e código;
  - barra lateral, renomear e apagar;
  - histórico depois de recarregar a página;
  - medidor de uso, gaveta no celular e modo escuro.
- **Servidor real:**
  - login ligado → 401 sem token;
  - pedido perigoso → recusa e evento gravado;
  - consumo gravado em `usage_daily`.
- **Imagem Docker** compilada e rodando em modo produção: só dependências da API, usuário `node`, `/health` com o banco no ar e configuração de produção validada.
- **Não verificado:** login com um projeto Firebase de verdade, publicação no Firebase Hosting via WIF e o primeiro deploy no Cloud Run. Tudo isso depende dos passos abaixo.

### O que **você** precisa fazer (passo a passo em `docs/GCP_SETUP.md`, seção "Fase 1")
1. [ ] **Rodar o projeto no seu Windows** com a `main` atualizada (`git pull`, `npm install`, `npm run db:up`, `npm run db:migrate`, `npm run dev`).
2. [ ] **Firebase:** adicionar ao seu projeto do Google Cloud, ligar Google e E-mail/senha e criar o app Web (copiar `apiKey` e `appId`).
3. [ ] **Neon:** criar o projeto em São Paulo e copiar a connection string **direta**.
4. [ ] **Rodar `infra/gcp/setup.sh`** no Cloud Shell (pede a connection string e a chave do Gemini sem mostrar na tela).
5. [ ] **GitHub:** criar as variáveis e os secrets da tabela e trocar a **branch padrão para `main`**.
6. [ ] **Trocar a chave do Gemini** que foi colada no chat: crie uma nova no AI Studio, apague a antiga e use a nova no passo 4.
7. [ ] Rodar **Actions → Deploy**, abrir `https://<PROJECT_ID>.web.app`, entrar, conversar, recarregar e me contar o resultado. Se algo falhar, me mande o log do passo que falhou.

### Pendências para fases seguintes
- CSP completo no Firebase Hosting e moderação de verdade (Fase 5).
- Botões gostei/não gostei, tabela `feedback`, `DELETE /me` e `GET /me/export` (Fase 5).
- Orçamento estourado deve **forçar o Copinho**, em vez de recusar (Fase 4, quando o router existir).

---

## Fase 2 — Dados e avaliação · ⏳ não iniciada
## Fase 3 — AçaIA Copinho · ⏳ não iniciada
## Fase 4 — Orquestrador e RAG · ⏳ não iniciada
## Fase 5 — Segurança e polimento · ⏳ não iniciada
## Fase 6 — Beta fechado · ⏳ não iniciada
