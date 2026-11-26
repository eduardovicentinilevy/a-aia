# Licenças dos conjuntos de avaliação

## `enem2024.jsonl`

Questões do **ENEM 2024**, elaboradas pelo INEP (Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira), na versão compilada pelo projeto **GPT-4-ENEM** — https://github.com/piresramon/gpt-4-enem (arquivo `data/enem/2024.jsonl`, commit `cbba7fdd735845bb45ac80d5090baae1b949d782`), que inclui as descrições textuais das imagens do caderno de prova acessível. Convertido para o nosso formato por `ml/eval/build_sets.py` (questão anulada removida; descrições inseridas no lugar das imagens).

Uso: **somente avaliação**. Estas questões não entram no dataset de treino.

Licença do projeto de origem:

```
MIT License

Copyright (c) 2023 Ramon Pires

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## `instrucoes.jsonl` e `seguranca.jsonl`

Escritos pelo autor do projeto (Eduardo), a partir de `fontes/*.md`. Uso: somente avaliação.
