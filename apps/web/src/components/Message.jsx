import { memo, useMemo } from 'react';
import { metaLine } from '../lib/format.js';
import { renderMarkdown } from '../lib/markdown.js';
import AcaiLogo from './AcaiLogo.jsx';
import './Message.css';

/**
 * One chat bubble.
 * - User text is shown as plain text (React escapes it).
 * - Assistant text is Markdown, converted to HTML and SANITIZED by DOMPurify (lib/markdown.js)
 *   before it touches the page — the only place where we inject HTML.
 * @param {{ message: import('../lib/chat-reducer.js').ChatMessage }} props
 */
function Message({ message }) {
  const { role, text, status, error } = message;
  const isAssistant = role === 'assistant';
  const meta = metaLine(message);
  const waitingFirstToken = status === 'streaming' && text === '';
  const html = useMemo(() => (isAssistant && text ? renderMarkdown(text) : ''), [isAssistant, text]);

  return (
    <article className={`message message--${role} message--${status}`} aria-busy={status === 'streaming' || undefined}>
      {isAssistant && (
        <span className="message__avatar">
          <AcaiLogo size={22} />
        </span>
      )}
      <div className="message__content">
        <div className="message__bubble">
          {waitingFirstToken && (
            <span className="message__typing" aria-label="A AçaIA está escrevendo">
              <span />
              <span />
              <span />
            </span>
          )}
          {text && !isAssistant && <span className="message__text">{text}</span>}
          {/* eslint-disable-next-line react/no-danger -- sanitized by DOMPurify in renderMarkdown */}
          {html && <div className="message__markdown" dangerouslySetInnerHTML={{ __html: html }} />}
          {status === 'stopped' && !text && <span className="message__placeholder">Resposta interrompida.</span>}
          {error && <p className="message__error">{error}</p>}
        </div>
        {meta && <p className="message__meta">{meta}</p>}
      </div>
    </article>
  );
}

// memo: while one answer streams, the other bubbles do not re-render.
export default memo(Message);
