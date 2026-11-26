import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SendIcon, StopIcon } from './Icons.jsx';
import './Composer.css';

const MAX_LENGTH = 8000;
const MAX_HEIGHT_PX = 220;
/** The character counter only shows up close to the limit. */
const COUNTER_FROM = 6000;

/**
 * Message box. Enter sends, Shift+Enter breaks the line. While an answer streams,
 * the send button turns into a stop button.
 * @param {{ onSend: (text: string) => void, onStop: () => void, isStreaming: boolean }} props
 */
export default function Composer({ onSend, onStop, isStreaming }) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(/** @type {HTMLTextAreaElement|null} */ (null));
  const canSend = value.trim().length > 0 && !isStreaming;

  // Grow the textarea with its content, up to MAX_HEIGHT_PX.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  // Give the focus back when an answer finishes.
  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus();
  }, [isStreaming]);

  function submit() {
    if (!canSend) return;
    onSend(value);
    setValue('');
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className={`composer__box${isStreaming ? ' composer__box--busy' : ''}`}>
        <label htmlFor="composer-input" className="sr-only">
          Mensagem
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          className="composer__input"
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder="Pergunte qualquer coisa à AçaIA…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Ignore Enter while an IME is composing (e.g. accents on some keyboards).
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {isStreaming ? (
          <button type="button" className="composer__button composer__button--stop" onClick={onStop} aria-label="Parar resposta">
            <StopIcon />
          </button>
        ) : (
          <button type="submit" className="composer__button" disabled={!canSend} aria-label="Enviar mensagem">
            <SendIcon />
          </button>
        )}
      </div>
      <p className="composer__hint">
        <span>A AçaIA pode errar. Confira informações importantes.</span>
        {value.length >= COUNTER_FROM ? (
          <span className={`composer__count${value.length >= MAX_LENGTH ? ' composer__count--full' : ''}`}>
            {value.length.toLocaleString('pt-BR')} / {MAX_LENGTH.toLocaleString('pt-BR')}
          </span>
        ) : (
          <span className="composer__keys">
            <kbd>Enter</kbd> envia · <kbd>Shift</kbd> + <kbd>Enter</kbd> quebra linha
          </span>
        )}
      </p>
    </form>
  );
}
