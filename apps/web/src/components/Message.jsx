import { memo } from 'react';
import { metaLine } from '../lib/format.js';
import AcaiLogo from './AcaiLogo.jsx';
import './Message.css';

/**
 * One chat bubble. React escapes text by default, so model output can never inject HTML.
 * (Markdown rendering with DOMPurify comes in Phase 1.)
 * @param {{ message: import('../lib/chat-reducer.js').ChatMessage }} props
 */
function Message({ message }) {
  const { role, text, status, error } = message;
  const isAssistant = role === 'assistant';
  const meta = metaLine(message);
  const waitingFirstToken = status === 'streaming' && text === '';

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
          {text && <span className="message__text">{text}</span>}
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
