import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownIcon } from './Icons.jsx';
import Message from './Message.jsx';
import './MessageList.css';

/** How close to the bottom (px) still counts as "following" the conversation. */
const STICKY_THRESHOLD = 80;

/**
 * Scrollable list of messages. Follows new tokens automatically, unless the user
 * scrolled up to read something older; then a "back to the end" button appears.
 * @param {{ messages: import('../lib/chat-reducer.js').ChatMessage[] }} props
 */
export default function MessageList({ messages }) {
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const followRef = useRef(true);
  const [awayFromEnd, setAwayFromEnd] = useState(false);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD;
    setAwayFromEnd(!followRef.current); // React skips the render when the value did not change
  }

  function scrollToEnd() {
    const el = listRef.current;
    if (!el) return;
    followRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="message-list">
      <div className="message-list__scroll" ref={listRef} onScroll={handleScroll} role="log" aria-label="Conversa">
        <div className="message-list__inner">
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
        </div>
      </div>
      <button
        type="button"
        className={`message-list__end${awayFromEnd ? ' message-list__end--visible' : ''}`}
        onClick={scrollToEnd}
        aria-label="Ir para o fim da conversa"
        tabIndex={awayFromEnd ? 0 : -1}
      >
        <ArrowDownIcon />
      </button>
    </div>
  );
}
