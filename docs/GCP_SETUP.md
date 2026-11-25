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

## 4. Ainda não faça

- **Não ative APIs** (Cloud Run, Cloud SQL, Artifact Registry...): vamos ativar juntos na Fase 1, uma por uma, com explicação.
- **Não crie chaves de conta de serviço (JSON).** O deploy vai usar *Workload Identity Federation*, sem chave guardada no GitHub (Fase 1).

## 5. Quando terminar, me passe

- O **ID do projeto** (ex.: `acaia-123456`). Não é segredo.
- Se a conta de faturamento ficou em **BRL** ou **USD**.
- Se você entrou na **avaliação gratuita** e até quando ela vale. Isso muda o plano de custos da Fase 1 (ver `PROGRESS.md`).
