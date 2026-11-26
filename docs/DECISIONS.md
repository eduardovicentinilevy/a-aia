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

---

# Fase 1

## D-015 — Banco em produção: Neon (plano gratuito) em vez de Cloud SQL
**Fase 1 · aceita (substitui "Cloud SQL em produção" do CLAUDE.md §5.1/§5.2)**

- **Contexto:** o Cloud SQL não tem plano gratuito. A menor instância (db-f1-micro) em São Paulo custa cerca de US$ 12–20/mês só de CPU, mesmo parada, e o Eduardo pediu custo zero.
- **Escolha (Eduardo, 25/11/2026):** **Neon, plano gratuito**, região AWS São Paulo (`aws-sa-east-1`). Tem PostgreSQL com pgvector, 1 GB por projeto, 100 CU-hora/mês e escala até zero depois de 5 minutos parado.
- **Portabilidade:** o código só usa PostgreSQL padrão (SQL puro nas migrações e `pg` na API). Voltar para o Cloud SQL é trocar a `DATABASE_URL` e rodar `npm run db:migrate`.
- **Riscos aceitos:**
  - a primeira consulta depois do banco "dormir" leva cerca de meio segundo a mais;
  - o banco fica fora do Google Cloud (Cloud Run em `southamerica-east1` → AWS `sa-east-1`, ambos em São Paulo), com conexão sempre por TLS;
  - os limites do plano gratuito podem mudar.
- **Desenvolvimento:** continua o PostgreSQL 17 + pgvector do `docker compose`.

## D-016 — Migrações com executor próprio em SQL puro (não `node-pg-migrate`)
**Fase 1 · aceita**

- **Contexto:** o `node-pg-migrate` 9 traz `glob` e `minimatch` em versões com alertas de segurança moderados (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249). A única correção sugerida pelo `npm audit` é voltar para a versão 7. No nosso uso o risco é baixo, porque os padrões de arquivo são nossos, mas o audit ficaria sempre vermelho.
- **Escolha:** `apps/api/src/db/migrate.js`, com ≈ 130 linhas e zero dependências:
  - arquivos `migrations/NNNN_descricao.sql` com as seções `-- migrate:up` e `-- migrate:down`;
  - tabela `schema_migrations` registra o que foi aplicado;
  - **cada migração roda numa transação** (ou entra inteira, ou nada);
  - **trava** (`pg_advisory_lock`) contra dois deploys migrando ao mesmo tempo;
  - recusa migrações fora de ordem ou arquivos aplicados que sumiram.
- **Comandos:** `npm run db:migrate` e `npm run db:rollback [-- N]`. Em produção, o deploy roda `db:migrate` antes de publicar a nova versão (F1.6).
- **Regra:** uma migração já aplicada em produção **nunca** é editada. Para corrigir, cria-se uma nova.
- **Testes:** cada arquivo de teste cria o próprio banco `acaia_test_*` no PostgreSQL do compose. Sem banco, esses testes são pulados com aviso; com `REQUIRE_TEST_DB=1` (no CI), eles falham.

## D-017 — Validar o token do Firebase com `jose` (não `firebase-admin`)
**Fase 1 · aceita**

- **Contexto:** a API precisa verificar o ID token do Firebase em cada requisição.
- **Escolha:** `jose` 6, sem dependências. `middleware/auth.js` aplica as verificações que a documentação do Firebase manda fazer:
  - assinatura RS256 com uma das chaves públicas do Google (JWKS, em cache);
  - `iss = https://securetoken.google.com/<projeto>` e `aud = <projeto>`;
  - `exp` no futuro, `iat` e `auth_time` no passado, e `sub` (o UID) preenchido.
- **Por que não `firebase-admin`:** ele traz dezenas de dependências (gRPC, google-auth-library...) para usarmos só `verifyIdToken`. A única coisa que perdemos é a checagem de token revogado (`checkRevoked`), que exige credencial de administrador. No MVP, um token roubado vale no máximo 1 hora.
- **Desempenho:** a linha do usuário é criada no primeiro acesso (`upsertUser`) e fica em cache por 10 minutos. Não há uma escrita no banco por requisição.
- **Desenvolvimento:** com `FIREBASE_PROJECT_ID` vazio, todos são o usuário "Dev local", sem precisar do Firebase. Em produção, a configuração **exige** o projeto Firebase.

## D-018 — Lista de convidados (`ALLOWED_EMAILS`) antes da lista de espera
**Fase 1 · aceita**

- **Contexto:** a URL da Fase 1 é pública. Sem restrição, qualquer pessoa criaria conta e gastaria a cota gratuita do Gemini, cujos termos também não servem para dados de terceiros (D-004).
- **Escolha:** variável nova `ALLOWED_EMAILS` (admins de `ADMIN_EMAILS` entram sempre). Só passa quem tem **e-mail verificado** e está na lista. A verificação importa: no cadastro por e-mail e senha, qualquer um pode digitar o endereço de outra pessoa, mas só o dono confirma pelo link.
- **Produção** exige a lista preenchida. Vazia, ela libera todos, o que só é permitido em desenvolvimento.
- **Fase 6:** a lista de espera e os convites substituem a variável por uma tabela.

## D-019 — Limites de uso, custo e rate limit
**Fase 1 · aceita**

- **Contagem de tokens:** o adaptador pede `stream_options.include_usage` (Gemini e vLLM aceitam). Se o provedor não informar, por exemplo numa resposta interrompida, estimamos ≈ 4 caracteres por token.
- **Custo:** `PRO_COST_INPUT_BRL_PER_1M` e `PRO_COST_OUTPUT_BRL_PER_1M`. Com 0, que é o plano gratuito, o custo registrado fica zero.
- **Onde a checagem acontece:** os limites são verificados **antes** de abrir o streaming, então voltam como um erro JSON normal:
  - limite diário por usuário (`DAILY_TOKEN_LIMIT_PER_USER`, dia de São Paulo) → **429** `daily_limit_reached`;
  - orçamento do mês para todos (`MONTHLY_BUDGET_BRL`) → **503** `monthly_budget_reached`;
  - 0 desliga o limite correspondente.
- **Rate limit** (`express-rate-limit` 8, 2 dependências pequenas):
  - 120 requisições/min por IP em todas as rotas, menos `/health`;
  - 15 mensagens/min por usuário logado, porque cada mensagem custa uma chamada ao modelo.
  - Os contadores ficam na memória de cada instância. Com no máximo 2 instâncias, o limite real é até o dobro. Em produção, `trust proxy = 1` faz `req.ip` ser o IP real do cliente atrás do front-end do Google.
- **Quando o orçamento acabar, a Fase 4 muda o comportamento:** o §5.7 manda forçar o Copinho. Por enquanto, como só existe o Pro, a API recusa.

## D-020 — Moderação básica por lista de padrões em PT-BR
**Fase 1 · aceita (provisória até a Fase 5)**

- **Escolha:** `ModerationProvider` com duas implementações, `keyword` (padrão) e `mock`, escolhidas por `MODERATION_PROVIDER`.
  - A lista é **curta e de alta precisão**: abuso sexual infantil, fabricação de armas ou explosivos e síntese de drogas pesadas. O texto é normalizado (minúsculas, sem acentos).
  - Contextos de proteção ("como denunciar", "como proteger") e usos comuns ("bomba de chocolate", "bomba d'água") passam.
- **Autolesão não é bloqueada de propósito:** a mensagem vai para o modelo, que responde com acolhimento e indica o CVV (188), como manda o system prompt.
- **Entrada bloqueada:**
  - recusa educada salva como resposta (`route_reason = moderation_blocked`);
  - evento em `moderation_events`;
  - nenhuma chamada ao modelo e nenhum custo.
- **Saída reprovada:** checada no fim (MVP). O evento `done` leva `replacement`, o chat troca o texto exibido, e **só o aviso é salvo** no banco.
- **Limite conhecido:** uma lista de padrões é fácil de contornar. Ela não é a defesa principal: o system prompt e a segurança do próprio modelo fazem a maior parte. A Fase 5 traz um classificador de verdade e as baterias de jailbreak e prompt injection.

## D-021 — Frontend da Fase 1: login, Markdown seguro e dependências
**Fase 1 · aceita**

| Pacote | Versão | Motivo |
| --- | --- | --- |
| `@firebase/app` + `@firebase/auth` | 0.16 / 1.13 | Login com Google e com e-mail e senha. Usamos os **pacotes de login separados**, não o `firebase` completo, porque ele traz o Firestore e o `@grpc/grpc-js`, com 4 alertas **altos** no `npm audit`. O SDK só é baixado quando o login está ligado (import dinâmico, ≈ 47 KB com gzip) |
| `marked` | 18 | Markdown → HTML nas respostas |
| `dompurify` | 3.5 | **Sanitiza** esse HTML antes de entrar na página (defesa contra XSS vindo do modelo). Remove `script`, eventos `on*`, links `javascript:`, `iframe`, `style` e `img` (imagens externas poderiam vazar dados pela URL). Links abrem em nova aba com `rel="noopener noreferrer nofollow"` |
| `jsdom` | 31 (dev) | Só para testar o sanitizador num DOM de verdade (`test/markdown.test.js`) |

- **Script de instalação recusado:** o `@firebase/util` traz um `postinstall` que lê a configuração automática do Firebase App Hosting, que não usamos. Ele está negado em `allowScripts` no `package.json`, e por isso o npm 11 não avisa mais.
- **Telas:**
  - **login**: Google, entrar ou criar conta com e-mail e senha, recuperar senha, e-mails do Firebase em PT-BR;
  - **aviso de acesso**: quando a API responde 403, mostra "Confirme seu e-mail" (com "Já confirmei" e "Reenviar") ou "Teste fechado";
  - **barra lateral**: abrir, renomear e apagar conversas, e medidor de uso do dia. No celular, ela vira gaveta;
  - um 401 (sessão expirada) desloga e volta para o login.
- **Testes:** reducer (histórico, troca feita pela moderação), cliente da API (token Bearer, 401/403), formatação e sanitização de Markdown, mais o teste no navegador (desktop claro, celular escuro, Postgres e Gemini reais).

## D-022 — Deploy: Cloud Run + Firebase Hosting via GitHub Actions com Workload Identity Federation
**Fase 1 · aceita**

- **API → Cloud Run** (`acaia-api`, `southamerica-east1`):
  - mínimo 0 e máximo 2 instâncias, 1 vCPU, 512 MiB, 40 requisições simultâneas por instância;
  - timeout de 300 s (o SSE precisa de conexões longas);
  - imagem `node:26-slim` em dois estágios, só com as dependências da API, rodando como o usuário `node` e com `--ignore-scripts` no `npm ci`;
  - segredos (`DATABASE_URL`, `PRO_API_KEY`) vêm do **Secret Manager** com `--set-secrets` e nunca passam pelo GitHub.
- **Chat → Firebase Hosting**: plano gratuito, HTTPS, CDN e o mesmo projeto do login. Por isso não usamos Cloud Storage + Load Balancer: o balanceador custa por hora.
- **Migrações no pipeline:** o job roda `migrate.js up` direto no Neon **antes** de publicar a imagem nova. A trava de migração protege contra dois deploys ao mesmo tempo, e o workflow também usa `concurrency`.
- **Sem chave JSON:** o GitHub prova "sou um workflow deste repositório, na `main`" com um token OIDC de curta duração. O provedor WIF só aceita `assertion.repository == eduardovicentinilevy/a-aia && assertion.ref == refs/heads/main`.
- **Duas contas de serviço com o mínimo de permissões:**
  - `acaia-api` só lê os dois segredos;
  - `acaia-deployer` tem Cloud Run admin, Artifact Registry writer, Firebase Hosting admin, Service Usage consumer, `serviceAccountUser` só em `acaia-api` e leitura do segredo do banco (para as migrações).
- **Artifact Registry** guarda as 5 imagens mais recentes e apaga o resto depois de 7 dias, para ficar no 0,5 GB gratuito.
- **Ainda não verificado:**
  - não pude testar a publicação no Firebase Hosting com credencial WIF (`firebase-tools` 15 via `npx`), porque não tenho acesso ao projeto. A imagem e o servidor em modo produção foram testados localmente;
  - o `actionlint` não rodou aqui; os workflows foram revisados à mão e validados como YAML.
- **Fase 5:** cabeçalho **CSP** completo no Hosting. Ele depende da URL final da API e dos domínios do login do Google, e é melhor ajustá-lo com o site no ar. Hoje já vão `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` e HSTS.

---

# Fase 2

## D-023 — Quem pode escrever dados e julgar o Copinho
**Fase 2 · aceita (padrão adotado; o Eduardo pode mudar)**

- **Regra do projeto:** CLAUDE.md §5.8 diz *"Não use saídas de provedores cujos termos proíbam treinar outros modelos com elas."*
- **O que isso implica:** os termos do **Claude** (Anthropic) e do **Gemini API** (*"you may not use the Services to develop models that compete with the Services"*) proíbem usar as respostas deles para desenvolver ou treinar modelos concorrentes, e o Copinho é um deles. Portanto:
  - **dados de treino** (os ≥ 300 exemplos autorais e qualquer outro): escritos pelo Eduardo, ou rascunhados por um modelo aberto **Apache-2.0/MIT** e revisados por ele. Nunca por Claude ou Gemini;
  - **perguntas dos conjuntos de avaliação** (`instrucoes`, `seguranca`): escritas pelo Eduardo, a partir do guia em `ml/eval/sets/README.md`. O guia, as categorias e o código são meus;
  - **juiz** (rubrica e segurança): só modelos com `judge_allowed = true` no `models.toml`, que são modelos abertos de licença permissiva. O `judge.py` recusa os outros. Um teste garante que nenhum modelo Gemini ou Claude tenha essa marca;
  - **medir o Pro** (Gemini) como linha de base é permitido: isso é avaliar o serviço, não desenvolver um modelo com ele.
- **Não é orientação jurídica.** É a leitura cautelosa dos termos, aplicando a regra que o próprio projeto já tinha.

## D-024 — Conjunto do ENEM: ENEM 2024 do projeto GPT-4-ENEM (MIT)
**Fase 2 · aceita**

- **Contexto:** o `huggingface.co` é bloqueado pela rede do ambiente de desenvolvimento em nuvem. O repositório do GPT-4-ENEM (Maritaca/Unicamp, **licença MIT**) está no GitHub e tem o **ENEM 2024 completo**, com as **descrições textuais das imagens** do caderno acessível. Hoje o repositório só tem o 2024 nesse formato.
- **Escolha:** 179 questões (180 menos 1 anulada), distribuídas em linguagens 45, humanas 45, natureza 44 e matemática 45. O commit da origem fica fixado no código. A conversão é reprodutível (`python ml/eval/build_sets.py enem`), e a cópia convertida é versionada com a atribuição em `ml/eval/sets/LICENSES.md`.
- **Precisão:** com cerca de 180 questões, o intervalo de confiança de 95% da acurácia é de **±7 pontos**. Uma diferença de 10 pontos é distinguível; uma de 3 não é.
- **Limite conhecido:** o ENEM 2024 pode ter entrado nos dados de treino de modelos lançados em 2025–2026 (contaminação), o que infla a nota absoluta. A comparação **Copinho × modelo base**, que é o critério da Fase 3, usa o mesmo conjunto nos dois modelos, então continua justa.
