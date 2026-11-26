# Google Cloud — criar o projeto com alerta de orçamento

Tudo deste guia é **gratuito**: criar projeto, conta de faturamento e orçamento não cobra nada. Custo só aparece quando criamos recursos (Cloud Run, Cloud SQL, GPU), e isso começa na Fase 1. **Eu sempre vou perguntar antes de criar qualquer recurso que cobre.**

> ⚠️ **Orçamento ≠ teto.** O orçamento do Google Cloud **só manda e-mail**; ele não desliga nada sozinho. O que realmente segura o custo é: mínimo de instâncias 0, máximo baixo e, se você quiser, uma função de corte automático (proposta para a Fase 1, ver `DECISIONS.md` D-011).

## 1. Conta e projeto

1. Entre em https://console.cloud.google.com com sua conta Google.
2. No seletor de projetos (topo da tela), clique em **Novo projeto**.
   - **Nome:** `acaia`
   - **ID do projeto:** o console sugere algo como `acaia-123456`. Anote: ele é único no mundo e não muda depois.
   - **Organização:** "Sem organização".
3. Clique em **Criar** e selecione o projeto novo.

## 2. Conta de faturamento

O orçamento precisa de uma conta de faturamento, que pede um cartão.

1. Menu ☰ → **Faturamento** → **Vincular uma conta de faturamento** → **Criar conta de faturamento**.
2. Se for sua primeira vez no Google Cloud, você provavelmente verá a oferta de **avaliação gratuita** (créditos em dólar com prazo de validade). Leia as condições na tela antes de aceitar: elas mudam com o tempo.
3. Escolha **Brasil** e **BRL (Real)** como moeda, se for oferecido, para que o orçamento fique em reais.

> A chave do Gemini (RUNBOOK, seção 4) fica em **outro** projeto, **sem** faturamento. Não vincule faturamento ao projeto que o AI Studio criar.

## 3. Orçamento com alertas

1. Menu ☰ → **Faturamento** → **Orçamentos e alertas** → **Criar orçamento**.
2. **Escopo:**
   - **Nome:** `acaia-mensal`
   - **Intervalo:** Mensal
   - **Projetos:** só o `acaia`
3. **Valor:** **Valor especificado**, `150` (o `MONTHLY_BUDGET_BRL` do `.env`). Se a conta estiver em dólar, use cerca de US$ 25–30.
4. **Ações / limites de alerta:**
   - 50% do **real**
   - 90% do **real**
   - 100% do **real**
   - 100% da **previsão** (avisa antes de acontecer)
5. Marque **"Enviar alertas por e-mail para administradores e usuários do faturamento"**.
6. **Concluir.**

## 4. Ainda não faça (na Fase 0)

- **Não ative APIs** (Cloud Run, Cloud SQL, Artifact Registry...): vamos ativar juntos na Fase 1, uma por uma, com explicação.
- **Não crie chaves de conta de serviço (JSON).** O deploy vai usar *Workload Identity Federation*, sem chave guardada no GitHub (Fase 1).

## 5. Quando terminar, me passe

- O **ID do projeto** (ex.: `acaia-123456`). Não é segredo.
- Se a conta de faturamento ficou em **BRL** ou **USD**.
- Se você entrou na **avaliação gratuita** e até quando ela vale. Isso muda o plano de custos da Fase 1 (ver `PROGRESS.md`).

---

# Fase 1 — Colocar a AçaIA no ar (custo zero)

Resultado: o chat em `https://<PROJECT_ID>.web.app` (Firebase Hosting), a API no **Cloud Run** em São Paulo, o banco no **Neon** e o login pelo **Firebase Auth**. Todo push na `main` publica sozinho pelo GitHub Actions.

**Custos:** tudo cabe nos planos gratuitos no tamanho do teste fechado:
- Cloud Run com mínimo de 0 instâncias e máximo de 2;
- Artifact Registry até 0,5 GB (o script guarda só as imagens recentes);
- Secret Manager com 2 segredos;
- Firebase Hosting e Auth no plano gratuito;
- Neon no plano gratuito.

O orçamento do passo 3, lá em cima, continua avisando se algo passar disso.

## A. Firebase (login e hospedagem do chat)

1. Entre em https://console.firebase.google.com → **Adicionar projeto** → escolha o **projeto do Google Cloud que você já criou** (`acaia-…`). Pode desligar o Google Analytics.
2. **Authentication → Começar → Método de login:** ative **Google** e **E-mail/senha**.
3. **Configurações do projeto (engrenagem) → Geral → Seus apps → `</>` (Web):**
   - apelido `acaia-web`, **sem** marcar o Firebase Hosting nessa tela;
   - copie dois valores: `apiKey` e `appId`. Eles são públicos por natureza; a segurança está no login e na API.
4. Em **Authentication → Configurações → Domínios autorizados**, confira se `<PROJECT_ID>.web.app` e `<PROJECT_ID>.firebaseapp.com` estão na lista. O Firebase costuma adicioná-los sozinho.

## B. Neon (banco PostgreSQL gratuito)

1. Crie uma conta em https://neon.tech → **New project**:
   - nome `acaia`;
   - região **AWS São Paulo (sa-east-1)**;
   - PostgreSQL **17**.
2. Em **Connection details**, **desligue "Connection pooling"** e copie a connection string. Ela começa com `postgresql://` e termina com `?sslmode=require`.
   > Precisa ser a conexão **direta** (sem `-pooler` no endereço). As migrações usam uma trava de sessão do PostgreSQL que não funciona através do pooler.
3. Não precisa criar tabelas nem a extensão `vector`: o deploy roda as migrações sozinho.

## C. Script do Google Cloud (uma vez só)

1. Abra o **Cloud Shell**: ícone `>_` no topo do console do Google Cloud.
2. Coloque o arquivo `infra/gcp/setup.sh` lá:
   - com o repositório público: `git clone https://github.com/eduardovicentinilevy/a-aia.git && cd a-aia`;
   - com o repositório privado: abra o arquivo no GitHub, copie o conteúdo, crie `setup.sh` no editor do Cloud Shell e cole.
3. Rode:

   ```bash
   bash infra/gcp/setup.sh SEU_PROJECT_ID
   ```

   O script pede, **sem mostrar na tela**, a connection string do Neon e a chave do Gemini, e guarda as duas no Secret Manager. No fim, ele imprime três valores para o GitHub. Pode rodar de novo sem problema: ele pula o que já existe.

## D. GitHub (variáveis do deploy)

No repositório: **Settings → Secrets and variables → Actions**.

**Aba "Variables"** (nada aqui é segredo):

| Nome | Valor |
| --- | --- |
| `GCP_PROJECT_ID` | o ID do projeto (impresso pelo script) |
| `GCP_WIF_PROVIDER` | impresso pelo script (`projects/…/providers/github-oidc`) |
| `GCP_DEPLOY_SA` | impresso pelo script (`acaia-deployer@…`) |
| `VITE_FIREBASE_API_KEY` | `apiKey` do passo A.3 |
| `VITE_FIREBASE_APP_ID` | `appId` do passo A.3 |
| `PRO_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `PRO_MODEL` | `gemini-3.5-flash-lite` |

**Aba "Secrets"** (e-mails são dados pessoais, então ficam escondidos nos logs):

| Nome | Valor |
| --- | --- |
| `ADMIN_EMAILS` | o seu e-mail (o mesmo da sua conta Google) |
| `ALLOWED_EMAILS` | e-mails convidados, separados por vírgula (pode ficar vazio no começo) |

Por fim, em **Settings → General → Default branch**, troque para **`main`**.

## E. Primeiro deploy

1. Em **Actions → Deploy → Run workflow** (branch `main`), ou faça qualquer push na `main`.
2. O deploy segue esta ordem: testes → migrações no Neon → imagem → Cloud Run → build do chat → Firebase Hosting. Leva uns 5 minutos.
3. Abra `https://<PROJECT_ID>.web.app`, entre com sua conta Google e converse. Recarregue a página: o histórico continua lá. Esse é o critério de pronto da Fase 1.

Se algum passo falhar, a mensagem do Actions diz qual. Veja também "Problemas no deploy" no RUNBOOK.
