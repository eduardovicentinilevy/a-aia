// Setup screen logic. `window.acaia` comes from preload.cjs.
const form = document.getElementById('form');
const keyInput = document.getElementById('key');
const modelInput = document.getElementById('model');
const toggle = document.getElementById('toggle');
const message = document.getElementById('message');
const save = document.getElementById('save');
const demo = document.getElementById('demo');

function showMessage(text) {
  message.textContent = text;
  message.hidden = !text;
}

function setBusy(busy, label) {
  save.disabled = busy;
  demo.disabled = busy;
  keyInput.disabled = busy;
  save.textContent = busy ? label : 'Salvar e começar';
}

window.acaia.getSetup().then((setup) => {
  if (!setup) return;
  modelInput.value = setup.model;
  modelInput.placeholder = setup.defaultModel;
  document.getElementById('saved-hint').hidden = !setup.hasKey;
  keyInput.focus();
});

document.getElementById('studio-link').addEventListener('click', (event) => {
  event.preventDefault();
  window.acaia.openExternal('https://aistudio.google.com/app/apikey');
});

toggle.addEventListener('click', () => {
  const show = keyInput.type === 'password';
  keyInput.type = show ? 'text' : 'password';
  toggle.textContent = show ? 'Ocultar' : 'Mostrar';
  toggle.setAttribute('aria-pressed', String(show));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');
  setBusy(true, 'Conferindo a chave…');
  const result = await window.acaia.saveKey(keyInput.value, modelInput.value);
  if (!result?.ok) {
    setBusy(false);
    showMessage(result?.message ?? 'Algo deu errado. Tente de novo.');
    keyInput.focus();
    return;
  }
  setBusy(true, 'Abrindo a AçaIA…');
});

demo.addEventListener('click', async () => {
  setBusy(true, 'Abrindo a AçaIA…');
  await window.acaia.useDemo();
});
