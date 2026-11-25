import { ApiError, createConversation, sendMessage } from './api.js';

const els = {
  messages: /** @type {HTMLElement} */ (document.getElementById('messages')),
  empty: /** @type {HTMLElement} */ (document.getElementById('empty-state')),
  form: /** @type {HTMLFormElement} */ (document.getElementById('composer')),
  input: /** @type {HTMLTextAreaElement} */ (document.getElementById('input')),
  send: /** @type {HTMLButtonElement} */ (document.getElementById('send')),
  stop: /** @type {HTMLButtonElement} */ (document.getElementById('stop')),
  newChat: /** @type {HTMLButtonElement} */ (document.getElementById('new-chat')),
};

/** @type {string|null} */
let conversationId = null;
/** @type {AbortController|null} */
let controller = null;

/** @param {number|null|undefined} ms */
function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/** @param {{ tier: string, model: string }} meta */
function modelLabel(meta) {
  const tier = meta.tier === 'copinho' ? 'AçaIA Copinho' : 'AçaIA Pro';
  return `${tier} · ${meta.model}`;
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

/**
 * Adds a message bubble. Text is always inserted as text (never as HTML), so model
 * output cannot inject markup. Markdown rendering with DOMPurify comes in Phase 1.
 * @param {'user'|'assistant'} role
 * @param {string} [text]
 */
function addMessage(role, text = '') {
  els.empty.hidden = true;
  const wrapper = document.createElement('article');
  wrapper.className = `msg msg-${role}`;
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = text;
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  wrapper.append(body, meta);
  els.messages.append(wrapper);
  scrollToBottom();
  return { wrapper, body, meta };
}

/** @param {boolean} streaming */
function setStreaming(streaming) {
  els.send.hidden = streaming;
  els.stop.hidden = !streaming;
  els.input.disabled = streaming;
}

function autoResize() {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(els.input.scrollHeight, 200)}px`;
}

/** @param {SubmitEvent} event */
async function onSubmit(event) {
  event.preventDefault();
  const content = els.input.value.trim();
  if (!content || controller) return;

  els.input.value = '';
  autoResize();
  addMessage('user', content);
  const answer = addMessage('assistant');
  answer.wrapper.classList.add('is-streaming');
  answer.wrapper.setAttribute('aria-busy', 'true');
  setStreaming(true);
  controller = new AbortController();

  /** @type {{ tier: string, model: string }|null} */
  let meta = null;
  try {
    conversationId ??= (await createConversation()).id;
    await sendMessage(conversationId, content, {
      signal: controller.signal,
      onEvent(name, data) {
        if (name === 'meta') {
          meta = data;
          answer.meta.textContent = modelLabel(data);
        } else if (name === 'token') {
          answer.body.append(data.text);
          scrollToBottom();
        } else if (name === 'done') {
          const label = meta ? `${modelLabel(meta)} · ` : '';
          answer.meta.textContent = `${label}1ª palavra em ${formatMs(data.firstTokenMs)} · total ${formatMs(data.latencyMs)}`;
        } else if (name === 'error') {
          showError(answer, data.message);
        }
      },
    });
  } catch (err) {
    if (/** @type {Error} */ (err).name === 'AbortError') {
      answer.meta.textContent = `${answer.meta.textContent} · interrompida`.replace(/^ · /, '');
    } else if (err instanceof ApiError) {
      showError(answer, err.message);
    } else {
      showError(answer, 'Não consegui falar com a API. Ela está rodando? (npm run dev)');
    }
  } finally {
    answer.wrapper.classList.remove('is-streaming');
    answer.wrapper.removeAttribute('aria-busy');
    controller = null;
    setStreaming(false);
    els.input.focus();
  }
}

/**
 * @param {{ wrapper: HTMLElement, body: HTMLElement }} answer
 * @param {string} message
 */
function showError(answer, message) {
  answer.wrapper.classList.add('msg-error');
  answer.body.textContent = answer.body.textContent ? `${answer.body.textContent}\n\n${message}` : message;
}

function newChat() {
  controller?.abort();
  conversationId = null;
  els.messages.querySelectorAll('.msg').forEach((node) => node.remove());
  els.empty.hidden = false;
  els.input.focus();
}

els.form.addEventListener('submit', onSubmit);
els.stop.addEventListener('click', () => controller?.abort());
els.newChat.addEventListener('click', newChat);
els.input.addEventListener('input', autoResize);
els.input.addEventListener('keydown', (event) => {
  // Enter sends; Shift+Enter breaks the line. Ignore Enter while an IME is composing.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});
