# Dataset de ajuste fino do AçaIA Copinho

```
autorais/         exemplos escritos/revisados por você (versionados) — o coração da persona
autorais/rascunhos/  rascunhos gerados por modelo aberto (draft.py) — só entram depois de revisados
autorais/perguntas/  listas de perguntas (uma por linha) para o draft.py
cache/            fontes públicas baixadas e convertidas (fora do Git)
out/              train.jsonl e val.jsonl prontos para o treino (fora do Git)
MANIFEST.md       o que entrou no último build: contagens, licenças, descartes
```

## Fluxo

```bash
python ml/data/build_dataset.py --check                 # valida os exemplos autorais
pip install -r ml/requirements-data.txt                 # só para baixar as fontes públicas
python ml/data/fetch_sources.py                         # baixa OpenAssistant + Aya (português), confere a licença
python ml/data/build_dataset.py                         # monta out/train.jsonl, out/val.jsonl e o MANIFEST.md
```

O build:

1. Lê os exemplos autorais (`autorais/**/*.md`), **ignorando rascunhos não revisados**.
2. Lê as fontes públicas já baixadas (`cache/`).
3. **Descarta tudo que se sobrepõe a uma pergunta da avaliação** (ENEM, instruções, segurança) — se o modelo treinar nas perguntas da prova, a nota deixa de valer.
4. Remove duplicatas (o autoral sempre vence).
5. Separa 5% para validação e **repete os autorais 3×** no treino (são poucos perto das fontes públicas, e são eles que ensinam a persona).
6. Coloca o system prompt da AçaIA em cada exemplo (o Copinho será usado com ele).

## Fontes públicas

| Fonte | Licença | Por que serve |
| --- | --- | --- |
| [OpenAssistant oasst2](https://huggingface.co/datasets/OpenAssistant/oasst2) (pt-BR) | Apache-2.0 | conversas escritas por voluntários; usamos o ramo melhor avaliado de cada conversa |
| [Aya Dataset](https://huggingface.co/datasets/CohereLabs/aya_dataset) (português) | Apache-2.0 | pares escritos por falantes nativos |

Ficam **de fora** conjuntos traduzidos/gerados por GPT, Claude ou Gemini (ex.: Alpaca-PT, que além disso é CC-BY-NC): os termos desses provedores proíbem treinar modelos concorrentes com as saídas (CLAUDE.md §5.8, `docs/DECISIONS.md` D-023). O `fetch_sources.py` confere a licença no Hugging Face antes de baixar e **recusa** a fonte se ela mudou.

## Os ≥ 300 exemplos autorais

Formato (`autorais/<categoria>.md`, um arquivo por categoria):

```markdown
## persona-001 · persona
### usuario
Você é o ChatGPT?
### assistente
Não! Eu sou a AçaIA, uma assistente brasileira. Posso te ajudar com estudos, textos, código e muito mais. O que você precisa?
```

Conversas com várias falas são bem-vindas (alterne `### usuario` e `### assistente`, terminando no assistente).

| Categoria | Qtd. | O que ensinar |
| --- | --- | --- |
| `persona` | 40 | quem é a AçaIA, o que faz e o que não faz, "você é o ChatGPT?", nome, origem |
| `estilo` | 60 | perguntas do dia a dia respondidas no jeito AçaIA: direta, simpática, sem enrolação, Markdown só quando ajuda |
| `recusa` | 60 | pedidos perigosos → recusa educada e curta + uma alternativa segura |
| `acolhimento` | 25 | sofrimento/autolesão → acolhe sem julgar e indica o **CVV (188)** ou o SAMU (192) |
| `nao-sei` | 30 | perguntas atuais ou sem resposta certa → admite que não sabe e sugere onde confirmar |
| `brasil` | 40 | contexto brasileiro: burocracia, serviços, cultura, gírias, culinária |
| `codigo` | 30 | erros comuns de Node.js/JS/SQL/Python explicados com clareza |
| `outro-idioma` | 15 | pergunta em inglês/espanhol → resposta no mesmo idioma |

Regras:

- **Nunca** cole respostas do ChatGPT, Claude ou Gemini (termos de uso). Escreva você, ou use o `draft.py` com um modelo aberto e **revise**.
- Não copie perguntas dos conjuntos de avaliação (o build descarta, mas aí o exemplo se perde).
- Nada de dados pessoais de pessoas reais.
- O `--check` avisa se uma `recusa` não parece recusar ou um `acolhimento` não indica ajuda.

### Rascunhos com modelo aberto (mais rápido)

1. Escreva as perguntas em `autorais/perguntas/<categoria>.txt`, uma por linha.
2. Com um modelo aberto no ar (ex.: no notebook do Kaggle), rode:

   ```bash
   python ml/data/draft.py --model qwen35_4b --category estilo --questions ml/data/autorais/perguntas/estilo.txt
   ```

   (só modelos com `judge_allowed = true` no `ml/eval/models.toml` podem rascunhar — licença aberta.)
3. Abra `autorais/rascunhos/estilo.md`, **corrija o que estiver errado ou fora do tom** e apague a linha `<!-- rascunho -->` de cada exemplo aprovado.
