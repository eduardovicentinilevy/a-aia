# Decisões de arquitetura

Cada decisão tem contexto, escolha e motivo. Quando uma decisão mudar, não apague: marque como **substituída** e aponte para a nova.

---

## D-001 — Node.js 26 LTS (mínimo 24) e o mínimo de ferramentas
**Fase 0 · aceita**

- A LTS atual do Node.js é a **26** (conferido em nodejs.org em 25/11/2026). O `engines` pede `>=24`, que também é LTS. Os testes foram rodados no Node 26 e no Node 22.
- Recursos nativos do Node usados no lugar de dependências:

| Em vez de | Usamos | Por quê |
| --- | --- | --- |
| `dotenv` | `node --env-file-if-exists=../../.env` | Nativo desde o Node 22 |
| `nodemon` | `node --watch` | Nativo |
| `concurrently` | `scripts/dev.mjs` (≈80 linhas) | Sobe API e web juntas em Windows/macOS/Linux e encerra a árvore de processos inteira |
| `axios` / SDK do provedor | `fetch` nativo + `parseSSE` próprio | Ver D-003 |
| `dotenv` no web | `util.parseEnv` nativo no `vite.config.js` | Ver D-014 |

## D-002 — Dependências da Fase 0
**Fase 0 · aceita**

| Pacote | Versão | Onde | Motivo |
| --- | --- | --- | --- |
| `express` | 5.3 | API | Framework HTTP da stack. A versão 5 trata erros de rotas `async` sozinha |
| `helmet` | 8.3 | API | Cabeçalhos de segurança HTTP (nosniff, HSTS, frame-ancestors...) |
| `cors` | 2.8 | API | Só as origens de `CORS_ORIGIN` podem chamar a API pelo navegador |
| `zod` | 4.6 | API | Valida `.env` e todo corpo de requisição. Mensagens de erro em PT-BR |
| `pg` | 8.23 | API | Cliente PostgreSQL. Na Fase 0 só serve ao `/health`; na Fase 1, a migrações e queries |
| `vitest` | 5.1 | API (dev) | Testes, definido na stack |
| `supertest` | 7.3 | API (dev) | Testes de integração das rotas sem abrir porta |
| `react`, `react-dom` | 19.3 | Web | Interface em componentes (D-013) |
| `vite` | 8.3 | Web (dev) | Servidor de desenvolvimento com recarga instantânea e build de produção (D-013) |
| `@vitejs/plugin-react` | 6.3 | Web (dev) | JSX e *Fast Refresh* (edita o componente sem perder o estado da tela) |
| `vitest` | 5.1 | Web (dev) | O mesmo executor de testes da API; ele lê o `vite.config.js` |

## D-003 — Pro via adaptador "compatível com OpenAI"
**Fase 0 · aceita**

- **Contexto:** o CLAUDE.md pede um `ProProvider` sem fornecedor fixo no código, e o Copinho (vLLM, Fase 3) expõe uma API compatível com OpenAI.
- **Escolha:** um único adaptador, `providers/model/openai-compatible.js`, que fala `POST {PRO_BASE_URL}/chat/completions` com `stream: true`. O `ProProvider` (`pro.js`) escolhe o adaptador por `PRO_PROVIDER` (`mock` ou `openai-compatible`). A variável **`PRO_BASE_URL`** é nova em relação ao CLAUDE.md, e `PRO_TIMEOUT_MS` e `MAX_OUTPUT_TOKENS` também foram adicionadas.
- **Motivo:** o mesmo código serve vários provedores e, na Fase 3, o Copinho. O parser de SSE próprio (`lib/sse-parser.js`) evita SDKs e ensina como o streaming funciona.
- **Timeout:** `PRO_TIMEOUT_MS` limita a espera **até o primeiro pedaço** da resposta. Depois disso, a geração pode levar o tempo que precisar, dentro de `MAX_OUTPUT_TOKENS`.

## D-004 — Provedor do Pro na Fase 0: Gemini API no plano gratuito
**Fase 0 · aceita, com revisão obrigatória antes do beta (Fase 6)**

- **Contexto:** pedido do Eduardo: "qualquer um, desde que não me gere custos".
- **Escolha:** Gemini API pelo endpoint compatível com OpenAI (`https://generativelanguage.googleapis.com/v1beta/openai`), com a chave num projeto **sem faturamento ativado**. Sem billing não existe como haver cobrança: ao passar do limite, a API só responde 429.
- **Modelo em uso:** `gemini-3.5-flash-lite`, uma versão fixa (não um apelido `-latest`), para os resultados serem comparáveis na Fase 2. Os modelos Flash travaram em streaming no teste de 25/11 (RUNBOOK §4).
- **Alternativas também compatíveis e com plano gratuito:** Groq e modelos gratuitos do OpenRouter. Basta trocar `PRO_BASE_URL`, `PRO_API_KEY` e `PRO_MODEL`.
- **Riscos aceitos:**
  1. **Cota baixa e variável:** o mock continua o padrão do dia a dia, e o erro 429 vira uma mensagem amigável no chat.
  2. **Privacidade:** nos serviços gratuitos, o Google pode usar o conteúdo para melhorar os produtos. Isso serve para os testes do Eduardo, mas **não para conversas de usuários reais** (LGPD). Antes do beta, trocar por um plano pago com termos de não-retenção ou por outro provedor, e registrar aqui.
  3. **Termos de treino:** não usar respostas do Pro para treinar o Copinho sem antes ler os termos do provedor (CLAUDE.md §5.8).

## D-005 — Sem rota temporária: rotas finais com armazenamento em memória
**Fase 0 · aceita**

- **Contexto:** a primeira proposta tinha um `POST /chat` temporário. O Eduardo recusou.
- **Escolha:** usar desde já as rotas definitivas do CLAUDE.md §5.6: `POST /conversations`, `GET /conversations`, `GET /conversations/:id/messages` e `POST /conversations/:id/messages` (SSE). Elas gravam num **store em memória** (`db/memory-store.js`) com a mesma interface assíncrona que o store PostgreSQL da Fase 1 terá.
- **Motivo:** nada é jogado fora. Na Fase 1 trocamos o store e o middleware `devUser` (usuário fixo `local-dev`) pelo de autenticação Firebase, e rotas, orquestrador e web não mudam.
- **Proteção:** sem login, a API **se recusa a subir com `NODE_ENV=production`**. Essa trava sai na Fase 1, junto com a autenticação.

## D-006 — Servidor estático próprio na porta 5173
**Fase 0 · substituída por D-013** (o Vite assumiu a porta 5173)

- **Contexto:** o `.env.example` usa `CORS_ORIGIN=http://localhost:5173`, a porta padrão do Vite, mas o MVP não usa bundler.
- **Escolha:** `apps/web/dev-server.js` com `node:http`, na porta 5173, servindo só `apps/web/public`, com proteção contra *path traversal*.
- **Motivo:** web e API em origens diferentes, como em produção. Assim, erros de CORS aparecem já no desenvolvimento.

## D-007 — Resposta como texto puro na Fase 0; Markdown e DOMPurify na Fase 1
**Fase 0 · aceita**

- A resposta do modelo é renderizada como texto: no React, `{texto}` no JSX sempre é escapado e nunca vira HTML. Assim não há XSS, mesmo sem sanitizador. **Nunca** use `dangerouslySetInnerHTML` sem DOMPurify.
- Markdown renderizado com DOMPurify entra na Fase 1. O MockProvider não usa Markdown, para não mostrar `**` soltos.

## D-008 — PostgreSQL 17 + pgvector em desenvolvimento
**Fase 0 · aceita, versão a confirmar na Fase 1**

- Imagem `pgvector/pgvector:pg17`, que veio com o pgvector 0.8.7. A porta é ligada só a `127.0.0.1`.
- A extensão `vector` **não** é criada agora: ela vai na primeira migração da Fase 1. O `/health` só verifica se ela está *disponível*.
- **A confirmar na Fase 1:** a versão do PostgreSQL no Cloud SQL tem que ser igual à local.

## D-009 — `/health` responde 200 mesmo com o banco fora
**Fase 0 · aceita**

- O `/health` diz se o processo está vivo e mostra `status: "degraded"` quando o banco não responde. Assim o Cloud Run não reinicia a API à toa quando o problema está no banco.

## D-010 — Parser de SSE duplicado na web, com teste de paridade
**Fase 0 · aceita**

- `apps/web/src/lib/sse-parser.js` é **cópia idêntica** de `apps/api/src/lib/sse-parser.js`: os dois apps são empacotados e publicados separadamente, e um pacote compartilhado só para um arquivo seria exagero agora. Um teste (`sse-parser.test.js`) falha se as cópias divergirem, e os testes do parser cobrem as duas.

## D-011 — Alerta de orçamento não é teto de gasto
**Fase 0 · aceita**

- O roteiro em PDF fala em "teto de gasto", mas o **orçamento do Google Cloud só envia alertas e não corta cobranças**.
- **Fase 0:** alertas em 50%, 90% e 100% de R$ 150 (ver `GCP_SETUP.md`). Nenhum recurso pago é criado.
- **Fase 1 (proposta, depende do OK do Eduardo):** máximo de instâncias baixo no Cloud Run e, se ele quiser um teto de verdade, uma função que **desliga o faturamento do projeto** quando o orçamento estoura (isso derruba tudo, e é esse o objetivo).

## D-012 — Desenvolvimento no Windows 10
**Fase 0 · aceita**

- Scripts multiplataforma (`scripts/*.mjs`), sem `&&`, `rm` ou `VAR=x cmd` no `package.json`. `.gitattributes` força LF.
- O Windows 10 saiu do suporte da Microsoft, e o Docker Desktop só garante suporte a versões do Windows ainda atendidas. Plano B documentado no RUNBOOK: PostgreSQL + pgvector direto no WSL 2.
- O código só foi testado em Linux, com Node 22 e 26. A primeira execução no Windows do Eduardo é o teste real; qualquer problema vira um `fix:`.

## D-013 — Frontend em React + CSS puro, com o açaí como cor principal
**Fase 0 · aceita (substitui "HTML, CSS e JS puro, sem framework" do CLAUDE.md §5.2 e a D-006)**

- **Contexto:** pedido do Eduardo: "faz em React e CSS puro, utilizando o açaí como cor principal". Combina com a lacuna "Front-end moderno (React ou Vue)" do roteiro em PDF.
- **Escolha:**
  - **React 19 + Vite 8**, em **JavaScript com JSX** (sem TypeScript, como no resto da stack).
  - **CSS puro:** um arquivo `.css` por componente (`Header.css`, `Message.css`...) com nomes no padrão BEM (`bloco__elemento--modificador`). Nada de Tailwind, CSS-in-JS ou biblioteca de componentes.
  - **Tema:** todas as cores, raios e sombras são variáveis CSS em `src/styles/tokens.css`. A paleta `--acai-50…950` é a base; os componentes só usam os nomes semânticos (`--color-primary`, `--color-surface`...), e o modo escuro troca só esses nomes.
  - **Estado:** um reducer **puro** (`lib/chat-reducer.js`) dentro do hook `useChat`, que concentra os efeitos colaterais (API, streaming, cancelamento). Os componentes só recebem dados e callbacks.
- **Testes:** unitários do reducer, da formatação e do cliente da API (vitest, ambiente Node). Não há testes de componente, porque exigiriam `jsdom` + Testing Library (mais 2–3 dependências). A interface foi verificada no Chromium nos modos claro e escuro e no celular. Se a interface crescer (Fase 4–5), reavaliar.
- **Custos:**
  - mais 4 dependências e um passo de build;
  - o bundle de produção tem ≈ 72 KB com gzip (≈ 229 KB sem compressão), quase tudo do React.
- **Produção (Fase 1):** `npm run build -w apps/web` gera `apps/web/dist/`, um site estático para publicar.

## D-014 — O web lê só `WEB_PORT` e `VITE_*` do `.env` da raiz
**Fase 0 · aceita**

- **Problema encontrado:** deixando o Vite ler o `.env` da raiz (via `envDir` ou `loadEnv`), ele pega o `NODE_ENV=development` da API e o `vite build` gera o React **de desenvolvimento**: 441 KB em vez de 229 KB, mais lento e com avisos internos.
- **Escolha:** `envDir: false` no Vite. O `vite.config.js` lê o `.env` com `util.parseEnv` do Node, que não tem efeitos colaterais, e usa só `WEB_PORT` e `VITE_API_BASE_URL`. Variáveis de ambiente reais, como as do CI, têm prioridade sobre o arquivo.
- **Regra de segurança:** tudo que começa com `VITE_` vai parar no JavaScript público do navegador. **Nunca** dê esse prefixo a um segredo.
