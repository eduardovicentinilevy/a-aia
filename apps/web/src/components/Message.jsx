import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard.js';
import { COPIED_LABEL, COPY_LABEL, codeOf, enhanceCodeBlocks } from '../lib/code-blocks.js';
import { metaLine, tierLabel } from '../lib/format.js';
import { renderMarkdown } from '../lib/markdown.js';
import AcaiLogo from './AcaiLogo.jsx';
import { CheckIcon, CopyIcon } from './Icons.jsx';
import './Message.css';

/**
 * One chat message.
 * - User text is shown as plain text in a bubble (React escapes it).
 * - Assistant text is Markdown, converted to HTML and SANITIZED by DOMPurify (lib/markdown.js)
 *   before it touches the page — the only place where we inject HTML.
 * @param {{ message: import('../lib/chat-reducer.js').ChatMessage }} props
 */
function Message({ message }) {
  if (message.role !== 'assistant') {
    return (
      <article className="message message--user">
        <div className="message__bubble">{message.text}</div>
      </article>
    );
  }

  return <AssistantMessage message={message} />;
}

/** @param {{ message: import('../lib/chat-reducer.js').ChatMessage }} props */
function AssistantMessage({ message }) {
  const { text, status, error, meta } = message;
  const details = metaLine(message);
  const streaming = status === 'streaming';
  const waitingFirstToken = streaming && text === '';
  const html = useMemo(() => (text ? renderMarkdown(text) : ''), [text]);
  const markdownRef = useRef(/** @type {HTMLDivElement|null} */ (null));

  // Before paint, so code headers never flicker while tokens arrive.
  useLayoutEffect(() => {
    if (markdownRef.current) enhanceCodeBlocks(markdownRef.current);
  }, [html]);

  /** @param {import('react').MouseEvent<HTMLDivElement>} event */
  async function onMarkdownClick(event) {
    const button = /** @type {HTMLElement} */ (event.target).closest('button.code-block__copy');
    if (!button) return;
    const label = button.querySelector('span');
    const ok = await copyText(codeOf(button));
    if (!label) return;
    label.textContent = ok ? COPIED_LABEL : 'Não deu';
    button.classList.toggle('code-block__copy--done', ok);
    setTimeout(() => {
      label.textContent = COPY_LABEL;
      button.classList.remove('code-block__copy--done');
    }, 1600);
  }

  return (
    <article className={`message message--assistant message--${status}`} aria-busy={streaming || undefined}>
      <header className="message__head">
        <span className={`message__avatar${streaming ? ' message__avatar--live' : ''}`}>
          <AcaiLogo size={20} />
        </span>
        <span className="message__author">AçaIA</span>
        {meta && (
          <span className={`message__tier message__tier--${meta.tier}`} title={meta.routeReason ? `Rota: ${meta.routeReason}` : undefined}>
            {tierLabel(meta.tier)}
          </span>
        )}
      </header>

      <div className="message__body">
        {waitingFirstToken && (
          <span className="message__typing" role="status" aria-label="A AçaIA está escrevendo">
            <span />
            <span />
            <span />
          </span>
        )}
        {html && (
          // eslint-disable-next-line react/no-danger -- sanitized by DOMPurify in renderMarkdown
          <div className="message__markdown" ref={markdownRef} onClick={onMarkdownClick} dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {status === 'stopped' && !text && <p className="message__placeholder">Resposta interrompida.</p>}
        {error && (
          <p className="message__error" role="alert">
            {error}
          </p>
        )}
      </div>

      {!streaming && (text || details) && (
        <footer className="message__foot">
          {text && <CopyButton text={text} />}
          {details && <span className="message__meta">{details}</span>}
        </footer>
      )}
    </article>
  );
}

/** Copies the whole answer (as Markdown). @param {{ text: string }} props */
function CopyButton({ text }) {
  const [state, setState] = useState(/** @type {'idle'|'done'|'failed'} */ ('idle'));

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = setTimeout(() => setState('idle'), 1600);
    return () => clearTimeout(timer);
  }, [state]);

  const label = state === 'done' ? 'Copiado!' : state === 'failed' ? 'Não deu para copiar' : 'Copiar resposta';
  return (
    <button
      type="button"
      className={`message__action${state === 'done' ? ' message__action--done' : ''}`}
      onClick={async () => setState((await copyText(text)) ? 'done' : 'failed')}
      aria-label={label}
      title={label}
    >
      {state === 'done' ? <CheckIcon /> : <CopyIcon />}
      <span className="message__action-label" aria-hidden="true">
        {state === 'done' ? 'Copiado' : 'Copiar'}
      </span>
    </button>
  );
}

// memo: while one answer streams, the other messages do not re-render.
export default memo(Message);
