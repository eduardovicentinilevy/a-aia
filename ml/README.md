# `ml/` — avaliação, dados e treino do AçaIA Copinho

| Pasta | O que tem |
| --- | --- |
| `eval/` | **Harness de avaliação**: roda um modelo nos conjuntos de teste e gera um relatório com as métricas |
| `eval/sets/` | Conjuntos de teste (ENEM 2024, instruções, segurança) — formato e guia em `eval/sets/README.md` |
| `eval/reports/` | Relatórios gerados (versionados: são a linha de base de cada modelo) |
| `data/` | Montagem do dataset de ajuste fino (Fase 2, parte 2) |
| `train/`, `runs/` | Treino QLoRA (Fase 3) |

## Preparar o Python (uma vez)

Precisa de **Python 3.11 ou mais novo** (https://www.python.org/downloads/ — no Windows, marque *"Add python.exe to PATH"*). Na raiz do repositório:

```bash
python -m venv .venv
```

Ative o ambiente — **Git Bash (Windows):** `source .venv/Scripts/activate` · **PowerShell:** `.venv\Scripts\Activate.ps1` · **macOS/Linux:** `source .venv/bin/activate`. Depois:

```bash
pip install -r ml/requirements-dev.txt
```

O harness em si só usa a biblioteca padrão do Python; o `pytest` é para os testes.

## Usar o harness

```bash
python ml/eval/run.py --list                      # modelos cadastrados em ml/eval/models.toml
python ml/eval/run.py --model mock                # teste sem rede: confere se tudo funciona
python ml/eval/run.py --model pro --sets enem --limit 10   # 10 questões com o Pro (Gemini, chave do .env)
python ml/eval/run.py --model pro --sets enem     # ENEM 2024 completo (179 questões)
python -m pytest ml                               # testes do harness
```

- As respostas ficam em `ml/eval/results/<modelo>/` (fora do Git). **Rodar de novo só pergunta o que falta ou mudou** — se o plano gratuito acabar no meio (erro 429), o comando para, salva o progresso e você continua depois.
- O relatório vai para `ml/eval/reports/<modelo>.md`.
- Todos os modelos recebem o **mesmo system prompt da AçaIA** (`apps/api/src/prompts/system.v1.md`), com temperatura 0: comparamos modelos do jeito que o Copinho será usado.
