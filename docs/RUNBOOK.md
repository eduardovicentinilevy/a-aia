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
npm run dev
```

- Chat: **http://localhost:5173** (React com Vite: ao salvar um `.jsx` ou `.css`, a tela atualiza na hora, sem perder a conversa)
- API: **http://localhost:8080/health** deve responder `"status":"ok"` e `"pgvector":true`.
- Para parar: `Ctrl+C` no terminal do `npm run dev`. O banco continua rodando; para desligar, use `npm run db:down`. Os dados do banco ficam guardados num volume do Docker.

> Na Fase 0 as conversas ficam **em memória**: reiniciar a API apaga o histórico. O banco já sobe para a Fase 1, que vai gravar nele.

## 4. Configurar o Pro (grátis, com o Gemini API)

Sem configurar nada, quem responde é o **MockProvider** (texto de teste). Para conversar com um modelo de verdade **sem custo**:

1. Entre em **https://aistudio.google.com** com sua conta Google.
2. Clique em **Get API key → Create API key**. Deixe o AI Studio criar um projeto novo para a chave.
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

6. Escolha um modelo da lista (no plano gratuito, os **Flash** ou **Flash-Lite** têm limites maiores), coloque em `PRO_MODEL=` e reinicie o `npm run dev`.
7. No chat, a linha abaixo da resposta passa a mostrar `AçaIA Pro · <modelo>`.

**Cuidados com o plano gratuito:**
- Os limites (requisições por minuto e por dia) são baixos e mudam com frequência; veja os seus no AI Studio. Para desenvolver no dia a dia, prefira o mock (`PRO_PROVIDER=mock`).
- Nos serviços gratuitos, o Google pode usar o conteúdo enviado para melhorar os produtos dele. **Não mande dados pessoais nem sensíveis.** Para testes seus, tudo bem; para usuários reais no beta, vamos rever essa escolha (veja `docs/DECISIONS.md`, D-004).
- O código não depende do Gemini: qualquer provedor com endpoint compatível com OpenAI funciona trocando `PRO_BASE_URL`, `PRO_API_KEY` e `PRO_MODEL`.

## 5. Testes

```powershell
npm test
```

Para incluir o teste que conversa com o banco real (precisa do `npm run db:up` antes):

```powershell
$env:TEST_DATABASE_URL="postgres://acaia:acaia@localhost:5432/acaia"; npm test
```

No macOS/Linux: `TEST_DATABASE_URL=postgres://acaia:acaia@localhost:5432/acaia npm test`.

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
| `db:up` falha com *"cannot connect to the Docker daemon"* / *"pipe/dockerDesktopLinuxEngine"* | Docker Desktop fechado | Abra o Docker Desktop e espere ficar verde |
| `db:up` falha com *"port is already allocated"* (5432) | Já existe um PostgreSQL instalado no Windows | Pare o serviço `postgresql-x64-*` em *services.msc*, ou mude a porta no `infra/docker-compose.yml` **e** no `DATABASE_URL` |
| `/health` mostra `"status":"degraded"` | Banco fora do ar | `npm run db:up` e confira o Docker Desktop |
| `npm run dev` diz *"Configuração inválida no .env"* | Variável faltando ou com valor inválido | A mensagem lista quais; confira o `.env` |
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

O WSL 2 encaminha `localhost:5432` para o Windows, então o `DATABASE_URL` do `.env` continua o mesmo. Nesse caso, pule o `npm run db:up`.

## 7. Deploy e rollback

Ainda não existe deploy: ele chega na Fase 1 (Cloud Run + Cloud SQL via GitHub Actions). Este documento vai ganhar as seções de deploy e de rollback nessa fase. Por enquanto, a API **se recusa a subir com `NODE_ENV=production`**, porque ainda não há login.
