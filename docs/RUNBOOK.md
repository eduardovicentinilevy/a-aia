# RUNBOOK — como instalar, subir e testar a AçaIA

Escrito para **Windows 10**, com notas para macOS/Linux. Os comandos são para o **PowerShell**.

## 1. Pré-requisitos (uma vez só)

### 1.1 Windows atualizado
O Docker Desktop exige **Windows 10 versão 22H2 (build 19045)** com **WSL 2**. Confira em *Configurações → Sistema → Sobre*.

> ⚠️ O Windows 10 saiu do suporte da Microsoft, e o Docker Desktop só garante suporte a versões do Windows ainda atendidas pela Microsoft. Hoje ele ainda instala no Windows 10 22H2, mas pode deixar de instalar em versões futuras. Se o Docker Desktop recusar a instalação, use o **plano B** da seção 6.

### 1.2 WSL 2
Abra o PowerShell **como administrador** e rode:

```powershell
wsl --install
```

Reinicie o computador quando pedir. Depois confira com `wsl --version`.

### 1.3 Docker Desktop
Baixe em https://www.docker.com/products/docker-desktop/, instale com a opção **"Use WSL 2"** marcada e abra o Docker Desktop. Ele precisa estar aberto (ícone da baleia na bandeja) sempre que você for usar o banco.

### 1.4 Node.js
Instale a versão **LTS** em https://nodejs.org (26 é a LTS atual; a 24 também funciona). Confira:

```powershell
node --version
npm --version
```

### 1.5 Git com fim de linha LF
Instale o Git em https://git-scm.com e rode uma vez:

```powershell
git config --global core.autocrlf false
```

O repositório já força LF pelo `.gitattributes`; isso evita avisos e problemas com scripts.

### 1.6 Permitir scripts do npm no PowerShell
Se aparecer o erro *"npm.ps1 não pode ser carregado porque a execução de scripts foi desabilitada"*, rode uma vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 2. Primeira vez no projeto

```powershell
git clone https://github.com/eduardovicentinilevy/a-aia.git
cd a-aia
npm install
npm run env:init
```

O `env:init` cria o arquivo `.env`, que **nunca** vai para o Git.

## 3. Dia a dia

```powershell
npm run db:up
npm run db:migrate
npm run dev
```

**Depois de todo `git pull`, rode `npm install`** (o pull pode trazer pacotes novos). Se você esquecer, o `npm run dev` avisa quais estão faltando.

O `db:migrate` aplica as migrações pendentes (é seguro rodar sempre; sem pendências, ele não faz nada). Para desfazer a última: `npm run db:rollback`.

- Chat: **http://localhost:5173** (React com Vite: ao salvar um `.jsx` ou `.css`, a tela atualiza na hora, sem perder a conversa)
- API: **http://localhost:8080/health** deve responder `"status":"ok"` e `"pgvector":true`.
- Para parar: `Ctrl+C` no terminal do `npm run dev`. O banco continua rodando; para desligar, use `npm run db:down`. Os dados do banco ficam guardados num volume do Docker.

> Na Fase 0 as conversas ficam **em memória**: reiniciar a API apaga o histórico. O banco já sobe para a Fase 1, que vai gravar nele.

## 4. Configurar o Pro (grátis, com o Gemini API)

Sem configurar nada, quem responde é o **MockProvider** (texto de teste). Para conversar com um modelo de verdade **sem custo**:

1. Entre em **https://aistudio.google.com** com sua conta Google.
2. Clique em **Get API key → Create API key**. Deixe o AI Studio criar um projeto novo para a chave. A chave pode começar com `AIza…` ou `AQ.…`; os dois formatos funcionam e são mascarados nos logs. **Trate a chave como senha:** só no `.env`, nunca em chat, print ou commit.
3. **Não ative faturamento (billing) nesse projeto.** Sem billing, a chave só usa o plano gratuito e não há como gerar cobrança. Se você estourar o limite, a API apenas recusa (erro 429) até o limite renovar.
4. No `.env`, troque o bloco do Pro por:

   ```
   PRO_PROVIDER=openai-compatible
   PRO_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
   PRO_API_KEY=<sua chave>
   ```

5. Descubra os modelos disponíveis para a sua chave:

   ```powershell
   npm run pro:models
   ```

6. Escolha um modelo da lista, coloque em `PRO_MODEL=` e reinicie o `npm run dev`. **Recomendado: `gemini-3.5-flash-lite`**, testado em 25/11/2026: streaming funcionando e limites maiores no plano gratuito. Nesse teste, os modelos **Flash** (`gemini-flash-latest`, `gemini-3.5-flash`) não enviaram nada em modo streaming, embora respondam normalmente sem streaming. Se o chat mostrar *"O modelo demorou demais para responder"*, troque por um modelo **lite**.
7. No chat, a linha abaixo da resposta passa a mostrar `AçaIA Pro · <modelo>`.

**Cuidados com o plano gratuito:**
- Os limites (requisições por minuto e por dia) são baixos e mudam com frequência; veja os seus no AI Studio. Para desenvolver no dia a dia, prefira o mock (`PRO_PROVIDER=mock`).
- Nos serviços gratuitos, o Google pode usar o conteúdo enviado para melhorar os produtos dele. **Não mande dados pessoais nem sensíveis.** Para testes seus, tudo bem; para usuários reais no beta, vamos rever essa escolha (veja `docs/DECISIONS.md`, D-004).
- O código não depende do Gemini: qualquer provedor com endpoint compatível com OpenAI funciona trocando `PRO_BASE_URL`, `PRO_API_KEY` e `PRO_MODEL`.

## 5. Testes

```powershell
npm test
```

Com o banco no ar (`npm run db:up`), os testes de banco rodam sozinhos: cada arquivo cria o seu próprio banco `acaia_test_*`, sem tocar nos seus dados. Com o banco desligado, esses testes são pulados e aparece um aviso.

Build de produção do chat (o que vai para o ar na Fase 1):

```powershell
npm run build -w apps/web
npm run preview -w apps/web
```

O `build` gera `apps/web/dist/` e o `preview` serve esse resultado em http://localhost:5173 para conferir.

## 6. Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `npm.ps1 não pode ser carregado` | Política de execução do PowerShell | Seção 1.6 |
| `Cannot find package '…'` ou *"Faltam dependências instaladas"* | `git pull` trouxe pacotes novos | `npm install` |
| `db:up` falha com *"cannot connect to the Docker daemon"* / *"pipe/dockerDesktopLinuxEngine"* | Docker Desktop fechado | Abra o Docker Desktop e espere ficar verde |
| API mostra `role "acaia" não existe` ou `password authentication failed` | O `DATABASE_URL` aponta para **outro** PostgreSQL, instalado no Windows | Use `DATABASE_URL=postgres://acaia:acaia@127.0.0.1:25432/acaia` (porta **25432**, endereço `127.0.0.1`) e rode `npm run db:up` |
| `db:up` falha com *"port is already allocated"* | Outro programa usa a porta 25432 (raro) | Veja quem usa com `netstat -ano \| findstr :25432`; ou troque a porta no `infra/docker-compose.yml` **e** no `DATABASE_URL` |
| `/health` mostra `"status":"degraded"` | Banco fora do ar | `npm run db:up` e confira o Docker Desktop |
| `npm run dev` diz *"Configuração inválida (.env ou variáveis de ambiente)"* | Variável faltando ou com valor inválido | A mensagem lista quais; confira o `.env` |
| O chat mostra *"Não consegui falar com a API"* | API parada ou em outra porta | Veja o terminal do `npm run dev` |
| O chat mostra *"O limite de uso do modelo foi atingido"* | Cota do plano gratuito do Pro | Espere renovar ou volte para `PRO_PROVIDER=mock` |
| `EADDRINUSE :8080` ou `:5173` | Outro programa ou um `npm run dev` antigo usando a porta | Feche o outro terminal, ou mude `PORT` / `WEB_PORT` no `.env`. Se mudar `PORT`, ajuste `VITE_API_BASE_URL`; se mudar `WEB_PORT`, ajuste `CORS_ORIGIN` |

**Plano B se o Docker Desktop não instalar no Windows 10:** rode o PostgreSQL dentro do WSL 2 (Ubuntu), sem Docker:

```powershell
wsl
```

```bash
sudo apt update && sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt install -y postgresql-17 postgresql-17-pgvector
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER acaia WITH PASSWORD 'acaia';" -c "CREATE DATABASE acaia OWNER acaia;"
sudo -u postgres psql -d acaia -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

(A última linha é necessária porque, fora do Docker, o usuário `acaia` não é superusuário e não pode criar a extensão sozinho.)

O WSL 2 encaminha a porta 5432 do Ubuntu para o Windows. Nesse caso, use `DATABASE_URL=postgresql://acaia:acaia@localhost:5432/acaia` no `.env` (porta 5432, que é a do PostgreSQL dentro do WSL) e pule o `npm run db:up`.

## 7. Deploy

O deploy é **automático**: todo push na `main` dispara o workflow **Deploy** (`.github/workflows/deploy.yml`):

1. testes, com um PostgreSQL de verdade no CI;
2. `db:migrate` no Neon;
3. imagem da API no Artifact Registry;
4. Cloud Run (`acaia-api`, `southamerica-east1`, mínimo 0 e máximo 2 instâncias);
5. build do chat;
6. Firebase Hosting.

Para publicar sem novo commit: **Actions → Deploy → Run workflow**. A configuração inicial, feita uma vez só, está em `docs/GCP_SETUP.md` (Fase 1).

- **Ver os logs da API:** console do Google Cloud → Cloud Run → `acaia-api` → **Registros**, ou no terminal:

  ```bash
  gcloud run services logs read acaia-api --region southamerica-east1 --limit 50
  ```

  Os logs são JSON e já vêm com e-mail, CPF, telefone e chaves mascarados.
- **Trocar a chave do Gemini ou a connection string do Neon:** rode de novo `infra/gcp/setup.sh` e responda "s" na pergunta do segredo. Depois rode o workflow **Deploy** de novo para a API pegar o valor novo.
- **Convidar alguém:** edite o segredo `ALLOWED_EMAILS` no GitHub e rode o **Deploy**. A pessoa precisa entrar com um e-mail **verificado** (Google já é; e-mail e senha pedem a confirmação pelo link).

## 8. Rollback (voltar uma versão)

- **API:** o Cloud Run guarda as versões anteriores (revisões). Liste e mande 100% do tráfego para a anterior:

  ```bash
  gcloud run revisions list --service acaia-api --region southamerica-east1
  ```

  ```bash
  gcloud run services update-traffic acaia-api --region southamerica-east1 --to-revisions NOME_DA_REVISAO=100
  ```

  O próximo deploy volta a mandar o tráfego para a versão nova.
- **Chat (web):** console do Firebase → **Hosting** → histórico de versões → **⋮ → Reverter** na versão boa.
- **Banco:** prefira **corrigir para a frente**, com uma nova migração. `db:rollback` em produção pode apagar dados. Se for mesmo necessário, use a connection string do Neon só no seu terminal:

  ```bash
  DATABASE_URL="postgresql://..." npm run db:rollback
  ```

  O Neon também restaura o banco para um momento anterior (*branch / restore*) dentro do período que o plano gratuito guarda.

## 9. Problemas no deploy

| Sintoma no Actions | Causa provável | Solução |
| --- | --- | --- |
| Jobs "API" e "Chat" aparecem como *skipped* | Variável `GCP_PROJECT_ID` não configurada | GCP_SETUP, passo D |
| `auth` falha com *"unable to impersonate"* ou *"permission denied"* | Workflow fora da `main`, repositório com outro nome ou script não rodado | Rode o deploy a partir da `main`; confira `GCP_WIF_PROVIDER` e `GCP_DEPLOY_SA`; rode o script de novo |
| `Aplicar migrações` falha com *"connection"* | Connection string errada ou com `-pooler` | Troque o segredo `acaia-database-url` (GCP_SETUP, passo B.2) |
| `Deploy no Cloud Run` falha com *"Configuração inválida"* nos logs | Falta variável (ex.: `ADMIN_EMAILS`, `PRO_MODEL`) | Os logs da revisão listam quais; ajuste no GitHub e rode de novo |
| `Publicar no Firebase Hosting` falha com *"permission"* ou *"not found"* | Firebase ainda não adicionado ao projeto | GCP_SETUP, passo A.1 |
| No site, o login abre e fecha com erro de domínio | Domínio não autorizado no Firebase Auth | GCP_SETUP, passo A.4 |
| No site, *"Não consegui falar com a API"* | `CORS_ORIGIN` ou URL da API diferentes | O deploy configura os dois sozinho; rode o **Deploy** de novo, completo |

## 10. Avaliação e dataset (Fase 2, Python)

Preparar o Python uma vez: veja `ml/README.md` (venv + `pip install -r ml/requirements-dev.txt`).

| Comando | O que faz |
| --- | --- |
| `python ml/eval/run.py --list` | Modelos cadastrados em `ml/eval/models.toml` |
| `python ml/eval/run.py --model pro --sets enem` | ENEM 2024 com o Pro. Se a cota acabar, rode de novo depois: ele continua de onde parou |
| `python ml/eval/build_sets.py autorais` | Converte `ml/eval/sets/fontes/*.md` (instruções e segurança que você escreveu) em JSONL |
| `python ml/eval/judge.py --model <m> --judge juiz` | Julga as respostas com o juiz aberto (no Kaggle) |
| `python ml/eval/judge.py --model <m> --export-human 20` e depois `--agreement` | Amostra para você dar nota e a concordância com o juiz |
| `python ml/data/build_dataset.py --check` | Valida os exemplos autorais de treino |
| `python ml/data/build_dataset.py` | Monta `ml/data/out/train.jsonl` e `val.jsonl` |
| `python -m pytest ml` | Testes do harness e do dataset |

Modelos abertos e juiz rodam no **notebook do Kaggle** (`ml/eval/notebooks/baseline_kaggle.ipynb`): importe-o no Kaggle (*File → Import Notebook*), ligue *GPU T4 x2* e *Internet*, rode as células em ordem e baixe o `avaliacao.zip` no fim.
