// Lists the models your PRO_API_KEY can use at PRO_BASE_URL (OpenAI-compatible GET /models).
// Usage (from the repo root): npm run pro:models
// Use it to pick a value for PRO_MODEL instead of guessing model names.

const baseUrl = process.env.PRO_BASE_URL?.trim();
const apiKey = process.env.PRO_API_KEY?.trim();

if (!baseUrl || !apiKey) {
  console.error('Defina PRO_BASE_URL e PRO_API_KEY no arquivo .env antes de rodar este comando.');
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
  headers: { Authorization: `Bearer ${apiKey}` },
}).catch((err) => {
  console.error(`Não consegui acessar ${baseUrl}: ${err.message}`);
  process.exit(1);
});

if (!response.ok) {
  console.error(`O provedor respondeu HTTP ${response.status}. Confira a chave e a URL.`);
  process.exit(1);
}

const body = await response.json();
const ids = (body.data ?? []).map((model) => String(model.id).replace(/^models\//, '')).sort();
console.log(`${ids.length} modelos disponíveis:\n`);
for (const id of ids) console.log(`  ${id}`);
console.log('\nCopie um deles para PRO_MODEL no .env (prefira modelos "flash" ou "lite" no plano gratuito).');
